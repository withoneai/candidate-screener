import type { BlindProfile, RawCandidate } from "./types.js";

/**
 * Builds the only view of a candidate the model ever gets. This is code,
 * not a prompt instruction: a model told "ignore the name" has still read
 * the name. So the name, email, phone, photo, address, location, social
 * profiles and every school are simply never put in the string, the
 * candidate's own name is scrubbed out of the free text they wrote, and
 * role dates are turned into lengths ("2 years 4 months") so an age cannot
 * be worked back out of a start year.
 */

const MONTH_MS = 30.44 * 86_400_000;

function monthsBetween(start: string | null, end: string | null, now: Date): number {
  if (!start) return 0;
  const from = new Date(start).getTime();
  const to = end ? new Date(end).getTime() : now.getTime();
  return Math.max(0, Math.round((to - from) / MONTH_MS));
}

function length(months: number): string {
  if (months <= 0) return "length not given";
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts = [];
  if (y) parts.push(`${y} year${y === 1 ? "" : "s"}`);
  if (m) parts.push(`${m} month${m === 1 ? "" : "s"}`);
  return parts.join(" ");
}

function stripHtml(s: string): string {
  return s
    .replace(/<li>/gi, "\n- ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;|’/g, "'")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function scrub(text: string, c: RawCandidate): string {
  let out = stripHtml(text)
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/https?:\/\/\S+/g, "[link]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[phone]");
  const names = new Set([c.name, ...c.name.split(/\s+/), c.firstname ?? ""].filter((n) => n && n.length > 1));
  for (const n of [...names].sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "[name]");
  }
  return out;
}

/** Roles that count toward "support experience" for the human-facing report. Never shown to the model. */
const SUPPORT_TITLE = /support|customer (care|experience|service)|help ?desk|service desk|cx\b|technical account/i;

export function buildBlindProfile(c: RawCandidate, now: Date): BlindProfile {
  const lines: string[] = [];
  let supportMonths = 0;

  if (c.headline) lines.push(`Headline: ${scrub(c.headline, c)}`);
  if (c.summary) lines.push("", "Summary:", scrub(c.summary, c));

  const roles = c.experience_entries ?? [];
  if (roles.length) {
    lines.push("", "Experience (most recent first):");
    for (const r of roles) {
      const months = monthsBetween(r.start_date, r.end_date, now);
      if (SUPPORT_TITLE.test(r.title ?? "")) supportMonths += months;
      const current = !r.end_date || r.current ? ", current" : "";
      lines.push(`- ${r.title ?? "Untitled role"} at ${r.company ?? "an unnamed company"} (${length(months)}${current})`);
      if (r.summary) lines.push(...scrub(r.summary, c).split("\n").map((l) => `  ${l.trim()}`).filter((l) => l.trim()));
    }
  }

  const skills = (c.skills ?? []).map((s) => s.name).filter(Boolean);
  if (skills.length) lines.push("", `Skills: ${skills.join(", ")}`);
  if (c.cover_letter) lines.push("", "Cover letter:", scrub(c.cover_letter, c));

  const answerLines: string[] = [];
  for (const a of c.answers ?? []) {
    const q = a.question?.body?.trim();
    if (!q) continue;
    const ans =
      a.answer?.body ??
      (a.answer?.choices?.length ? a.answer.choices.map((x) => x.body).join(", ") : undefined) ??
      (a.answer?.checked === undefined ? "" : a.answer.checked ? "Yes" : "No");
    answerLines.push(`Q: ${scrub(q, c)}`, `A: ${scrub(ans || "(no answer)", c)}`);
  }
  if (answerLines.length) lines.push("", "Application answers:", ...answerLines);

  return {
    candidateId: c.id,
    text: lines.join("\n").trim(),
    answersText: answerLines.join("\n"),
    supportMonths,
  };
}

/**
 * Nothing to screen: no roles, no summary, no cover letter, no answers.
 * Usually a resume Workable could not parse. This goes straight to a human
 * without a model call, because any verdict on an empty profile is a guess.
 */
export function isThin(c: RawCandidate): boolean {
  return !(c.experience_entries?.length || c.summary?.trim() || c.cover_letter?.trim() || c.answers?.length);
}
