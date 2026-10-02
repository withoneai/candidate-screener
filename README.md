<h3 align="center">Candidate Screener</h3>
<p align="center">An AI screener for inbound applicants: it reads every new Workable candidate <strong>blind</strong>, checks them against a role brief you wrote in one markdown file, and leaves its reasoning on the candidate with every claim quoted from the profile, so a recruiter can overrule it in one read.<br />Built on <a href="https://withone.ai">One</a>. It never moves a stage, never disqualifies, never sends. Emails land as Gmail drafts.</p>

<p align="center">
  <a href="https://withone.ai"><strong>Website</strong></a>
  &nbsp;·&nbsp;
  <a href="https://withone.ai/docs"><strong>Docs</strong></a>
  &nbsp;·&nbsp;
  <a href="https://app.withone.ai"><strong>Dashboard</strong></a>
</p>

---

## What it does

A role gets 200 applicants and somebody reads them on a Friday afternoon. Run this against the job and for every candidate still in "Applied" it:

1. **Reads the job and the new candidates from Workable.** Disqualified candidates and anyone already past the screening stage are left alone.
2. **Skips anyone it already screened.** Every comment it leaves carries a marker, and a re-run checks the candidate's timeline first.
3. **Builds a blind profile, in code.** Name, email, phone, photo, address, location, social profiles and every school are never put in front of the model. The candidate's own name is scrubbed out of their summary and cover letter, and role dates become lengths ("3 years 11 months"), so nobody's age can be worked back out of a start year.
4. **Sends an empty profile straight to a human.** No roles, no summary, no answers usually means a resume Workable could not parse. That is a hold with no model call, because any verdict on nothing is a guess.
5. **Screens with Claude against `config/role-brief.md`**, verbatim: every must-have as met, not met, or unclear, each with a quote copied from the profile, plus dealbreakers from the candidate's own application answers.
6. **Checks every quote in code.** A quote that is not in the profile word for word is thrown out and that requirement becomes "unclear". Advance needs every must-have met with a verified quote. Decline needs a verified dealbreaker or a verified unmet must-have. Anything else is a hold. When the evidence is short, the tie goes to the candidate.
7. **Leaves the reasoning on the candidate in Workable** as a comment, and **drafts the email in Gmail**: an intro-call invite for an advance, a kind no for a decline, nothing for a hold.

Sample output (fictional applicants, shipped as the demo fixture, screened by the live model):

```
$ npm start

Support Operations Lead: 7 in "applied", 5 to screen, 1 with an empty profile, 1 already screened

── Daniel Reyes  →  DECLINE
   Strong profile that meets all three must-haves, but the candidate's own answer states they need H-1B sponsorship, which this role cannot provide. Only revisit if the sponsorship policy for this role changes.
   · 3+ years in support at a software company: met  "Support leader with six years in SaaS."
   · Owned a queue, team, or support process: met  "Hired and managed a team of 7 agents across two shifts."
   · Help desk tool automation beyond answering tickets: met  "Migrated the team from shared inbox to Intercom, wrote the routing rules and the first 60 macros."
   · dealbreaker: "Yes, I would need H-1B sponsorship to work in the US."

── Tom Lindqvist  →  HOLD
   Four plus years at a SaaS company, but in customer success (onboarding, QBRs, renewals) rather than clearly in support, and no evidence of owning a support queue or process. A recruiter should check whether the role included support ownership or Intercom configuration.
   · 3+ years in support at a software company: unclear  "Customer Success Manager at Formstack Labs (4 years 2 months, current)"
   · Owned a queue, team, or support process: unclear

── Rosa Delgado  →  ADVANCE
   Over five years of support at a payroll and benefits software company, runs the Freshdesk automation setup and owns the year-end tax form escalation process.
   advance email (demo, not drafted):
     | Hi Rosa,
     |
     | Thank you for applying for the Support Operations Lead role. The team was really struck by the 80 help center articles you wrote that cut W-2 tickets by a third, along with your ownership of the year-end tax form escalation process.
     | ...

6 screened: 2 advance, 2 hold, 2 decline. 0 changed by the evidence check. 1 already screened.
```

Rosa taught middle school math for eleven years, with a gap before she moved into support. The model never saw the dates or the gap, and the brief tells it not to weigh either. She advances on what she did at Brightledger.

Every platform call goes through [One](https://withone.ai): Workable has no typed SDK module yet, so the job, candidate, activity and comment calls go through One's raw passthrough with Workable's own action ids; Gmail uses the typed `@withone/sdk/gmail` module.

## Try it in 60 seconds, no keys

```bash
git clone https://github.com/withoneai/candidate-screener
cd candidate-screener
npm install
npm start
```

With no keys in the environment, the same pipeline runs against a recorded Workable job (a Support Operations Lead role at a fictional payroll company) and the screenings Claude actually returned for it. Seven applicants sit in "Applied": two strong fits (one a former teacher), one strong fit who needs visa sponsorship, one with no software experience, one customer success manager the brief cannot call either way, one empty profile, and one already screened on a prior run. A disqualified candidate and one already at phone screen are in the list too, and are correctly ignored.

To re-screen the demo job with the live model, set `ANTHROPIC_API_KEY` and run `npm start -- --demo --record`.

## Go live (about 5 minutes)

**1. Connect Workable and Gmail through One**

```bash
npm i -g @withone/cli
one init             # create an account or log in
one add workable
one add gmail
```

**2. Configure this repo**

```bash
cp .env.example .env
```

Fill in `ONE_SECRET`, `ANTHROPIC_API_KEY`, `ONE_CONNECTION_WORKABLE` and `ONE_CONNECTION_GMAIL` from `one --agent list`, and `WORKABLE_JOB_SHORTCODE` from the job's page in Workable.

**3. Write your role brief**

`config/role-brief.md` is the whole configuration, in plain English: the must-haves, the nice-to-haves, the only dealbreakers that count, how to decide, what the screener must never weigh, and what the two emails should say. The model reads it verbatim. Keep the section headings; `npm run check` looks for them.

**4. Check, then run**

```bash
npm run check          # brief parses, Workable and Gmail answer, lists the hiring team
npm start -- --dry-run # every screening, nothing written
npm start              # comment in Workable, draft in Gmail
```

`npm run check` prints the job's hiring team with their ids. Put one in `WORKABLE_MEMBER_ID` and the screening is left as a comment from that member; without it, the run still screens and drafts, it just leaves no comment.

## Usage

```bash
npm start                    # screen every new applicant
npm start -- --dry-run       # print every screening, write nothing
npm start -- --demo          # replay the recorded job even with keys present
npm test                     # the evidence gate's tests
```

Screen a different stage with `SCREEN_STAGE` (default `applied`), and switch models with `CLAUDE_MODEL`.

## What a run costs

One Workable call for the job, one per page of 100 candidates, and two per new candidate (their activity, to skip anyone already screened, and their full profile). Claude sees candidates eight to a call, so 200 applicants is 25 calls. Re-running is safe and cheap: anyone already screened is skipped before the model is called.

## The thing that is easy to get wrong

**Telling a model to ignore a name is not the same as not showing it one.** Blind screening here is a property of the code: `src/blind.ts` builds the only string the model ever reads, and the name, contact details, location and schools are simply not in it. The second half is the same idea applied to the output. A screener that can invent a line from a resume cannot be trusted with the lines it did not invent, so `src/gate.ts` checks every quote against that same string, and only a verified quote can carry a decline.

## What it does not do

- It does not move, disqualify, tag or rate a candidate in Workable. The comment is the only write.
- It does not send email. Every email is a Gmail draft you read first; holds get none.
- It does not read resume PDFs. It screens what Workable parsed out of them (roles, summary, skills, answers). A resume Workable could not parse becomes a hold for a human.
- It is not a hiring decision. It is a first read with its reasoning attached, built so that disagreeing with it is fast.

## How it is wired

| File | What it does |
| --- | --- |
| `config/role-brief.md` | The role, in plain English. The model reads it verbatim |
| `src/workable.ts` | Reads the job, candidates, profiles and activity via One's raw passthrough; posts the comment |
| `src/blind.ts` | Builds the anonymized profile the model sees, and flags empty profiles |
| `src/screen.ts` | Claude screens each batch against the brief, with quoted evidence |
| `src/gate.ts` | Checks every quote and decides which recommendations are allowed to stand |
| `src/report.ts` | The Workable comment a recruiter reads |
| `src/gmail.ts` | The advance and decline drafts |
| `src/index.ts` | The run |
| `fixtures/` | The recorded Workable job and the screenings the demo replays |

## Extending it

- **Read the resume itself**: Workable's "List a Candidate's Files" action is in the One catalog. Downloading the PDF and adding its text to the blind profile is a change to `buildBlindProfile`, plus the same name scrub.
- **Run it on a schedule**: a cron of `npm start` every morning screens overnight applicants; the marker makes overlapping runs safe.
- **Another ATS**: `src/blind.ts`, `src/screen.ts` and `src/gate.ts` do not know Workable exists. Swapping `src/workable.ts` for another ATS in the One catalog is a one-file change.

## License

MIT
