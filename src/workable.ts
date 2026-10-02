import { DEMO, SCREEN_STAGE, connections, jobShortcode, loadFixture, oneClient } from "./config.js";
import type { RawCandidate, RawJob } from "./types.js";

/**
 * Workable has no typed module in @withone/sdk yet, so every call here goes
 * through One's raw passthrough (`runRaw`): same auth, same connection,
 * same retries as every typed call, just without generated request and
 * response types. The action ids are Workable's own actions in the One
 * catalog (`one --agent actions find workable "<intent>"`), and each path
 * is the action's path exactly as that catalog lists it.
 */
const ACTIONS = {
  getJob: { id: "conn_mod_def::GJ8W8mhzNHY::2ioRE-u4SF23jHVN_SvEAQ", path: "/jobs/{{shortcode}}" },
  listCandidates: { id: "conn_mod_def::GJ8W8F7Mo3M::5V99A7DPT0O5tIsthv3zFQ", path: "/spi/v3/candidates" },
  getCandidate: { id: "conn_mod_def::GJ8W8El2WKA::ArRZ_g2LSo-HWUJiuG2dbA", path: "/spi/v3/candidates/{{id}}" },
  listActivities: { id: "conn_mod_def::GJ8W8GiMPoc::fVGGEkR5TleFv4AWEvBJdg", path: "/candidates/{{id}}/activities" },
  createComment: { id: "conn_mod_def::GJ8W8M6lAsk::kik579ZNRdCMGzL2emQxtw", path: "/candidates/{{id}}/comments" },
  listMembers: { id: "conn_mod_def::GJ8W82V9HV4::WvNoq_rWQsiEIsYFCr0sVg", path: "/jobs/{{shortcode}}/members" },
} as const;

/** The marker every screening comment carries, so a re-run never screens the same person twice. */
export const SCREEN_MARKER = "[candidate-screener]";

const wk = () => oneClient().connection(connections.workable());

async function get<T>(
  action: { id: string; path: string },
  pathParams?: Record<string, string>,
  query?: Record<string, string | number>,
): Promise<T> {
  const res = await wk().runRaw({ systemId: action.id, method: "GET", path: action.path, pathParams, query });
  return res.data as T;
}

export async function readJob(): Promise<RawJob> {
  if (DEMO) return loadFixture("workable/job.json") as RawJob;
  return get<RawJob>(ACTIONS.getJob, { shortcode: jobShortcode() });
}

/**
 * Every candidate still sitting in the screening stage for this job and not
 * already disqualified. Paged with `since_id`, 100 at a time, which is the
 * endpoint's ceiling.
 */
export async function readNewCandidates(): Promise<RawCandidate[]> {
  if (DEMO) {
    const all = loadFixture("workable/candidates.json") as RawCandidate[];
    return all.filter((c) => c.stage === SCREEN_STAGE && !c.disqualified);
  }
  const out: RawCandidate[] = [];
  let sinceId: string | undefined;
  for (let page = 0; page < 20; page++) {
    const query: Record<string, string | number> = { shortcode: jobShortcode(), stage: SCREEN_STAGE, limit: 100 };
    if (sinceId) query.since_id = sinceId;
    const data = await get<{ candidates?: RawCandidate[]; paging?: { next?: string } }>(ACTIONS.listCandidates, undefined, query);
    const batch = data.candidates ?? [];
    out.push(...batch.filter((c) => !c.disqualified));
    const next = data.paging?.next ? new URL(data.paging.next).searchParams.get("since_id") : null;
    if (!next || batch.length === 0) break;
    sinceId = next;
  }
  return out;
}

/** The full profile: experience, skills, summary, cover letter, application answers. */
export async function readCandidate(id: string): Promise<RawCandidate> {
  if (DEMO) {
    const profiles = loadFixture("workable/profiles.json") as Record<string, RawCandidate>;
    const profile = profiles[id];
    if (!profile) throw new Error(`No recorded profile for candidate ${id} in fixtures/workable/profiles.json.`);
    return profile;
  }
  const data = await get<{ candidate: RawCandidate }>(ACTIONS.getCandidate, { id });
  return data.candidate;
}

/** True when a previous run already left its screening comment on this candidate. */
export async function alreadyScreened(id: string): Promise<boolean> {
  const activities = DEMO
    ? ((loadFixture("workable/activities.json") as Record<string, unknown[]>)[id] ?? [])
    : ((await get<{ activities?: unknown[] }>(ACTIONS.listActivities, { id })).activities ?? []);
  return activities.some((a) => JSON.stringify(a).includes(SCREEN_MARKER));
}

/**
 * The one Workable write in this repo: a comment on the candidate's
 * timeline carrying the screening and its quoted evidence. It never moves a
 * stage, never disqualifies, never tags. A recruiter reads the comment and
 * decides; overruling the screener is the same click it always was.
 */
export async function postComment(candidateId: string, member: string, body: string): Promise<void> {
  await wk().runRaw({
    systemId: ACTIONS.createComment.id,
    method: "POST",
    path: ACTIONS.createComment.path,
    pathParams: { id: candidateId },
    body: { member_id: member, comment: { body } },
  });
}

/** For `npm run check`: who is on the hiring team, so you can pick WORKABLE_MEMBER_ID. */
export async function readHiringTeam(): Promise<Array<{ id: string; name: string; role?: string }>> {
  const data = await get<{ members?: Array<{ id: string; name: string; role?: string }> }>(ACTIONS.listMembers, {
    shortcode: jobShortcode(),
  });
  return data.members ?? [];
}
