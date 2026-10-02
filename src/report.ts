import { SCREEN_MARKER } from "./workable.js";
import type { GatedScreening } from "./types.js";

const STATUS = { met: "met", not_met: "not met", unclear: "unclear" } as const;
const VERDICT = { advance: "Advance", hold: "Hold for a human", decline: "Decline" } as const;

/**
 * The comment left on the candidate in Workable. It is written for the
 * recruiter who disagrees: every must-have with the line from the profile
 * that decided it, so overruling the screener takes one read, not a
 * re-screen.
 */
export function commentBody(s: GatedScreening): string {
  const lines = [`Screening: ${VERDICT[s.recommendation]}`, "", s.reasoning, ""];
  for (const m of s.mustHaves) {
    lines.push(`- ${m.requirement}: ${STATUS[m.status]}${m.evidence ? ` ("${m.evidence.trim()}")` : ""}`);
  }
  if (s.dealbreaker.triggered) lines.push(`- Dealbreaker, in their own answer: "${s.dealbreaker.quote.trim()}"`);
  if (s.niceToHaves.length) lines.push(`- Also brings: ${s.niceToHaves.join("; ")}`);
  if (s.gateNotes.length) {
    lines.push("", `The screener proposed "${s.proposed}". The evidence check changed it:`);
    for (const n of s.gateNotes) lines.push(`- ${n}`);
  }
  lines.push(
    "",
    "Screened blind against config/role-brief.md (no name, contact, location, school or dates). Nothing was moved or sent; any email is a draft.",
    SCREEN_MARKER,
  );
  return lines.join("\n");
}
