import type { BlindProfile, GatedScreening, Recommendation, Screening } from "./types.js";

/**
 * The model proposes; this file decides what is allowed to stand. Three
 * rules, all in code:
 *
 * 1. Every quoted piece of evidence must appear word for word in the
 *    profile the model was shown. A quote that does not is discarded and
 *    that requirement becomes "unclear". A screener that can invent a line
 *    from a resume cannot be trusted with the ones it did not invent.
 * 2. A dealbreaker only counts if its quote is found in the candidate's own
 *    application answers, not in a summary or a guess.
 * 3. Advance needs every must-have met with a verified quote. Decline needs
 *    a verified dealbreaker or a verified "not met". Anything else becomes a
 *    hold, which a human reads. When the evidence is short, the tie goes to
 *    the candidate.
 */

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/^[\s"'.,:;-]+|[\s"'.,:;-]+$/g, "")
    .replace(/\s+/g, " ");
}

function found(quote: string, haystack: string): boolean {
  const q = norm(quote);
  return q.length >= 4 && norm(haystack).includes(q);
}

export function gate(s: Screening, profile: BlindProfile): GatedScreening {
  const notes: string[] = [];

  const mustHaves = s.mustHaves.map((m) => {
    if (m.status === "unclear") return m;
    if (found(m.evidence, profile.text)) return m;
    notes.push(`"${m.requirement}": the quote given for "${m.status === "met" ? "met" : "not met"}" is not in the profile, so it counts as unclear`);
    return { ...m, status: "unclear" as const, evidence: "" };
  });

  let dealbreaker = s.dealbreaker;
  if (dealbreaker.triggered && !found(dealbreaker.quote, profile.answersText)) {
    notes.push("dealbreaker claimed, but the quote is not in the candidate's own answers, so it was dropped");
    dealbreaker = { triggered: false, quote: "" };
  }

  const allMet = mustHaves.length > 0 && mustHaves.every((m) => m.status === "met");
  const anyNotMet = mustHaves.some((m) => m.status === "not_met");

  let recommendation: Recommendation = s.recommendation;
  if (recommendation === "advance" && (!allMet || dealbreaker.triggered)) {
    recommendation = "hold";
    notes.push("advance needs every must-have met with a verified quote and no dealbreaker, so this is a hold");
  }
  if (recommendation === "decline" && !dealbreaker.triggered && !anyNotMet) {
    recommendation = "hold";
    notes.push("decline needs a verified dealbreaker or a verified unmet must-have, so this is a hold");
  }

  return {
    ...s,
    mustHaves,
    dealbreaker,
    recommendation,
    proposed: s.recommendation,
    email: recommendation === s.recommendation ? s.email : "",
    gateNotes: notes,
  };
}
