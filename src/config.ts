import "dotenv/config";
import { readFileSync } from "node:fs";
import { One } from "@withone/sdk";

/**
 * Demo mode replays a recorded slice of a Workable job from fixtures/. It
 * turns on two ways: explicitly with --demo, or implicitly when the
 * required keys are absent. The implicit fallback is what makes a fresh
 * clone runnable with zero configuration: the same pipeline runs end to
 * end, only the Workable reads, the Claude call and the Gmail drafts come
 * from disk instead of the wire.
 */
const KEYS_PRESENT = Boolean(
  process.env.ONE_SECRET &&
    process.env.ANTHROPIC_API_KEY &&
    process.env.ONE_CONNECTION_WORKABLE &&
    process.env.WORKABLE_JOB_SHORTCODE,
);

export const DEMO = process.argv.includes("--demo") || !KEYS_PRESENT;
export const DEMO_REASON = process.argv.includes("--demo")
  ? "--demo"
  : KEYS_PRESENT
    ? ""
    : "no keys in the environment";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
    console.error("Or run `npm start -- --demo` to replay the recorded job, no keys needed.");
    process.exit(1);
  }
  return value;
}

let client: One | undefined;
export function oneClient(): One {
  client ??= new One(required("ONE_SECRET"));
  return client;
}

export const connections = {
  workable: () => required("ONE_CONNECTION_WORKABLE"),
  gmail: () => required("ONE_CONNECTION_GMAIL"),
};

export const jobShortcode = () => required("WORKABLE_JOB_SHORTCODE");
export const SCREEN_STAGE = process.env.SCREEN_STAGE || "applied";

/** Optional outputs: each is configured or quietly skipped. */
export const memberId = () => process.env.WORKABLE_MEMBER_ID || "";
export const gmailConfigured = () => Boolean(process.env.ONE_CONNECTION_GMAIL);

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

export function loadFixture(relPath: string): unknown {
  const url = new URL(`../fixtures/${relPath}`, import.meta.url);
  try {
    return JSON.parse(readFileSync(url, "utf8"));
  } catch {
    throw new Error(`No fixture at fixtures/${relPath}.`);
  }
}

export function loadBrief(): string {
  return readFileSync(new URL("../config/role-brief.md", import.meta.url), "utf8");
}
