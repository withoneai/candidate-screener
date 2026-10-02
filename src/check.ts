import { DEMO, SCREEN_STAGE, gmailConfigured, loadBrief, memberId } from "./config.js";
import { readHiringTeam, readJob } from "./workable.js";
import { readMailbox } from "./gmail.js";

/**
 * Proves the run will work before you rely on it: the brief has the
 * sections the screener needs, and (live only) Workable and Gmail answer.
 */
let failed = false;

try {
  const brief = loadBrief();
  const sections = ["## Must-haves", "## Dealbreakers", "## How to decide", "## The two emails"];
  const missing = sections.filter((s) => !brief.includes(s));
  if (missing.length) throw new Error(`config/role-brief.md is missing ${missing.join(", ")}`);
  const mustHaves = brief.split("## Must-haves")[1].split("\n## ")[0].split("\n").filter((l) => l.startsWith("- ")).length;
  console.log(`✓ config/role-brief.md has every section (${mustHaves} must-haves)`);
  console.log(`✓ screening stage: ${SCREEN_STAGE}`);

  if (DEMO) {
    console.log("\nNo keys in the environment, so the connections were not probed.");
    console.log("This clone will run `npm start` in demo mode: a recorded job, real logic.");
  } else {
    const job = await readJob();
    console.log(`✓ Workable answers: ${job.title} (${job.shortcode})`);
    const team = await readHiringTeam();
    if (memberId()) {
      const me = team.find((m) => m.id === memberId());
      console.log(me ? `✓ comments will be posted as ${me.name}` : `· WORKABLE_MEMBER_ID ${memberId()} is not on this job's hiring team`);
    } else {
      console.log("· WORKABLE_MEMBER_ID not set, so no comments will be left. Pick one:");
      for (const m of team) console.log(`    ${m.id}  ${m.name}${m.role ? `  (${m.role})` : ""}`);
    }
    console.log(gmailConfigured() ? `✓ Gmail answers: drafts go to ${await readMailbox()}` : "· Gmail not configured, so no emails will be drafted (optional)");
  }
} catch (err) {
  console.error(`✗ ${err instanceof Error ? err.message : err}`);
  failed = true;
}

process.exit(failed ? 1 : 0);
