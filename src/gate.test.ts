import { test } from "node:test";
import assert from "node:assert/strict";
import { gate } from "./gate.js";
import type { BlindProfile, Screening } from "./types.js";

const profile: BlindProfile = {
  candidateId: "x1",
  text: "Experience:\n- Support Lead at Acme Payroll (4 years, current)\n  Built the Zendesk triggers and macro library.\nApplication answers:\nQ: Sponsorship?\nA: No",
  answersText: "Q: Sponsorship?\nA: No",
  supportMonths: 48,
};

const base: Screening = {
  candidateId: "x1",
  mustHaves: [
    { requirement: "3+ years", status: "met", evidence: "Support Lead at Acme Payroll (4 years, current)" },
    { requirement: "Owned a process", status: "met", evidence: "Built the Zendesk triggers and macro library." },
  ],
  niceToHaves: [],
  dealbreaker: { triggered: false, quote: "" },
  recommendation: "advance",
  reasoning: "",
  email: "Hi {{first_name}},",
};

test("verified quotes let an advance stand", () => {
  const g = gate(base, profile);
  assert.equal(g.recommendation, "advance");
  assert.equal(g.gateNotes.length, 0);
});

test("an invented quote turns met into unclear, and advance into hold with no email", () => {
  const s = { ...base, mustHaves: [base.mustHaves[0], { ...base.mustHaves[1], evidence: "Managed a team of 12 agents." }] };
  const g = gate(s, profile);
  assert.equal(g.mustHaves[1].status, "unclear");
  assert.equal(g.recommendation, "hold");
  assert.equal(g.email, "");
});

test("a dealbreaker quoted from outside the candidate's answers is dropped, so the decline becomes a hold", () => {
  const s: Screening = { ...base, recommendation: "decline", dealbreaker: { triggered: true, quote: "I need sponsorship" } };
  const g = gate(s, profile);
  assert.equal(g.dealbreaker.triggered, false);
  assert.equal(g.recommendation, "hold");
});

test("a decline on a verified unmet must-have stands", () => {
  const s: Screening = {
    ...base,
    recommendation: "decline",
    mustHaves: [{ requirement: "3+ years", status: "not_met", evidence: "Support Lead at Acme Payroll (4 years, current)" }],
  };
  assert.equal(gate(s, profile).recommendation, "decline");
});
