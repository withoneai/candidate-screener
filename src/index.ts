import { DEMO, DEMO_REASON, SCREEN_STAGE, gmailConfigured, loadFixture, memberId } from "./config.js";
import { alreadyScreened, postComment, readCandidate, readJob, readNewCandidates } from "./workable.js";
import { buildBlindProfile, isThin } from "./blind.js";
import { screenCandidates } from "./screen.js";
import { gate } from "./gate.js";
import { commentBody } from "./report.js";
import { createDraft, readMailbox } from "./gmail.js";
import type { BlindProfile, RawCandidate, ScreenResult } from "./types.js";

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      [
        "Usage:",
        "  npm start                    screen every new applicant, comment in Workable, draft the emails",
        "  npm start -- --demo          replay the recorded job, no keys, no network",
        "  npm start -- --dry-run       print every screening, comment nothing, draft nothing",
        "  npm start -- --demo --record re-screen the demo job with the live model and save the answers",
        "",
        `Screens candidates in the "${SCREEN_STAGE}" stage; override with SCREEN_STAGE in .env.`,
      ].join("\n"),
    );
    process.exit(0);
  }
  return { dryRun: args.includes("--dry-run") };
}

const opts = parseArgs(process.argv);
const now = DEMO ? new Date((loadFixture("workable/meta.json") as { captured_at: string }).captured_at) : new Date();

console.log(`── candidate screener${DEMO ? ` (demo: ${DEMO_REASON}, replaying a recorded job)` : ""}\n`);
if (DEMO && DEMO_REASON !== "--demo") {
  console.log("   No keys found, so this replays a recorded Workable job: fictional applicants, real logic.\n");
}

const job = await readJob();
const listed = await readNewCandidates();

// Facts first, in code: who was already screened, and who has nothing to screen.
const fresh: RawCandidate[] = [];
const thin: RawCandidate[] = [];
let skipped = 0;
for (const c of listed) {
  if (await alreadyScreened(c.id)) {
    skipped += 1;
    continue;
  }
  const full = await readCandidate(c.id);
  (isThin(full) ? thin : fresh).push(full);
}

console.log(
  `${job.title}: ${listed.length} in "${SCREEN_STAGE}", ${fresh.length} to screen, ${thin.length} with an empty profile, ${skipped} already screened${opts.dryRun ? " (dry run)" : ""}\n`,
);

const profiles = new Map<string, BlindProfile>(fresh.map((c) => [c.id, buildBlindProfile(c, now)]));
const screenings = await screenCandidates([...profiles.values()]);

const member = memberId();
const writeLive = !DEMO && !opts.dryRun;
const mailbox = writeLive && gmailConfigured() ? await readMailbox() : "";
const company = job.account?.name ?? "our team";

const results: ScreenResult[] = [];
for (const raw of screenings) {
  const candidate = fresh.find((c) => c.id === raw.candidateId)!;
  const s = gate(raw, profiles.get(candidate.id)!);

  console.log(`── ${candidate.name}  →  ${s.recommendation.toUpperCase()}${s.proposed !== s.recommendation ? ` (model said ${s.proposed})` : ""}`);
  console.log(`   ${s.reasoning}`);
  for (const m of s.mustHaves) {
    console.log(`   · ${m.requirement}: ${m.status.replace("_", " ")}${m.evidence ? `  "${m.evidence.trim()}"` : ""}`);
  }
  if (s.dealbreaker.triggered) console.log(`   · dealbreaker: "${s.dealbreaker.quote.trim()}"`);
  for (const n of s.gateNotes) console.log(`   ! ${n}`);

  let commentPosted = false;
  let draftId: string | null = null;
  const firstName = candidate.firstname || candidate.name.split(/\s+/)[0];
  const email = s.email.replaceAll("{{first_name}}", firstName);

  if (writeLive) {
    if (member) {
      await postComment(candidate.id, member, commentBody(s));
      commentPosted = true;
      console.log("   comment left on the candidate in Workable");
    } else {
      console.log("   no WORKABLE_MEMBER_ID, so no comment was left (see npm run check)");
    }
    if (email && candidate.email && mailbox) {
      const subject = `Your application for ${job.title} at ${company}`;
      draftId = await createDraft(mailbox, candidate.email, subject, email);
      console.log(`   ${s.recommendation} email drafted in Gmail (draft ${draftId}), not sent`);
    }
  } else if (email) {
    console.log(`   ${s.recommendation} email${DEMO ? " (demo, not drafted)" : " (dry run, not drafted)"}:`);
    console.log(email.split("\n").map((l) => `     | ${l}`).join("\n"));
  }
  console.log();
  results.push({ candidate, screening: s, commentPosted, draftId });
}

for (const c of thin) {
  console.log(`── ${c.name}  →  HOLD (empty profile, no model call)`);
  console.log("   No roles, summary, cover letter or answers parsed. Open the resume by hand.\n");
}

const count = (r: string) => results.filter((x) => x.screening.recommendation === r).length;
const changed = results.filter((x) => x.screening.proposed !== x.screening.recommendation).length;
console.log(
  `${results.length + thin.length} screened: ${count("advance")} advance, ${count("hold") + thin.length} hold, ${count("decline")} decline. ` +
    `${changed} changed by the evidence check. ${skipped} already screened.`,
);
if (DEMO) console.log("demo mode: nothing was commented in Workable, nothing was drafted in Gmail");
else if (opts.dryRun) console.log("dry run: nothing was commented in Workable, nothing was drafted in Gmail");
else console.log("No candidate was moved, disqualified or emailed. Every email is a draft.");
