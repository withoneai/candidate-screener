import { writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CLAUDE_MODEL, DEMO, loadBrief, loadFixture } from "./config.js";
import type { BlindProfile, Screening } from "./types.js";

const ScreeningBatchSchema = z.object({
  screenings: z.array(
    z.object({
      candidateId: z.string(),
      mustHaves: z.array(
        z.object({
          requirement: z.string(),
          status: z.enum(["met", "not_met", "unclear"]),
          evidence: z.string(),
        }),
      ),
      niceToHaves: z.array(z.string()),
      dealbreaker: z.object({ triggered: z.boolean(), quote: z.string() }),
      recommendation: z.enum(["advance", "hold", "decline"]),
      reasoning: z.string(),
      email: z.string(),
    }),
  ),
});

const BATCH = 8;
const RECORD = process.argv.includes("--record");

/**
 * Screens every candidate against the role brief. Claude sees the brief
 * verbatim and the blind profiles built in blind.ts, nothing else. Its job
 * is judgment: does each must-have hold, with a quote to prove it, and what
 * should happen next. Whether those quotes are real is checked afterwards in
 * code (gate.ts), not trusted.
 *
 * `--record` runs the live model against the demo fixtures and saves its
 * answers to fixtures/screenings.json. That is how the recorded demo output
 * in this repo was made.
 */
export async function screenCandidates(profiles: BlindProfile[]): Promise<Screening[]> {
  if (profiles.length === 0) return [];

  if (DEMO && !RECORD) {
    const recorded = loadFixture("screenings.json") as Record<string, Screening>;
    return profiles.map((p) => {
      const s = recorded[p.candidateId];
      if (!s) throw new Error(`No recorded screening for candidate ${p.candidateId} in fixtures/screenings.json.`);
      return s;
    });
  }

  const client = new Anthropic();
  const out: Screening[] = [];
  for (let i = 0; i < profiles.length; i += BATCH) {
    out.push(...(await screenBatch(client, profiles.slice(i, i + BATCH))));
  }

  if (DEMO && RECORD) {
    const url = new URL("../fixtures/screenings.json", import.meta.url);
    writeFileSync(url, JSON.stringify(Object.fromEntries(out.map((s) => [s.candidateId, s])), null, 2) + "\n");
    console.log(`   recorded ${out.length} live screenings to fixtures/screenings.json\n`);
  }
  return out;
}

async function screenBatch(client: Anthropic, profiles: BlindProfile[]): Promise<Screening[]> {
  const blocks = profiles
    .map((p) => `<candidate id="${p.candidateId}">\n${p.text}\n</candidate>`)
    .join("\n\n");

  const prompt = `You are screening job applicants against a role brief written by the hiring team. Follow the brief exactly. It is the only definition of the role.

## The role brief

${loadBrief()}

## The candidates

Each profile below was anonymized in code: names, contact details, locations, schools and calendar dates were removed, and role dates were turned into lengths. Do not try to infer any of them.

${blocks}

## Instructions

Return one screening per candidate id above.
- mustHaves: one entry per must-have in the brief, in the brief's order. "requirement" is a short name for it. "status" is met, not_met, or unclear per the brief. "evidence" is a VERBATIM quote copied exactly from that candidate's profile text (a phrase or a full line, no paraphrase, no ellipsis) that supports the status. If the status is unclear, evidence may be "". Every quote is checked against the profile by code; a quote that is not found word for word is discarded and the requirement becomes unclear.
- niceToHaves: the brief's nice-to-haves this profile shows, each as a short phrase. Empty if none.
- dealbreaker: triggered is true only if the candidate's own application answer states a dealbreaker from the brief. "quote" is the verbatim answer text. Otherwise false and "".
- recommendation: advance, hold, or decline per the brief's "How to decide".
- reasoning: two or three sentences a recruiter can read in ten seconds: why this recommendation, and what a human should look at if they disagree.
- email: for advance or decline, the draft email body per the brief's "The two emails" section. Start with "Hi {{first_name}}," (the literal placeholder; you do not know the name). Sign off as "The hiring team". For hold, "".
- Style: no em dashes or en dashes anywhere. Use a comma, period, colon, or parentheses instead.`;

  const response = await client.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    messages: [{ role: "user", content: prompt }],
    output_config: { format: zodOutputFormat(ScreeningBatchSchema) },
  });

  if (response.stop_reason === "refusal") throw new Error("Claude declined to screen this batch.");
  if (!response.parsed_output) throw new Error("Claude returned output that did not match the schema.");

  const sent = new Set(profiles.map((p) => p.candidateId));
  const got = response.parsed_output.screenings.filter((s) => sent.has(s.candidateId));
  for (const p of profiles) {
    if (!got.some((s) => s.candidateId === p.candidateId)) {
      console.error(`   warning: Claude did not return a screening for candidate ${p.candidateId}, leaving it for next run`);
    }
  }
  return got;
}
