/** The Workable candidate fields this repo reads. Only what it uses. */
export interface RawCandidate {
  id: string;
  name: string;
  firstname: string | null;
  email: string | null;
  headline: string | null;
  stage: string;
  disqualified: boolean;
  profile_url: string;
  job: { shortcode: string; title: string };
  summary?: string | null;
  cover_letter?: string | null;
  resume_url?: string | null;
  experience_entries?: Array<{
    title: string | null;
    company: string | null;
    summary: string | null;
    start_date: string | null; // YYYY-MM-DD
    end_date: string | null; // null while current
    current?: boolean;
  }>;
  skills?: Array<{ name: string }>;
  answers?: Array<{
    question?: { body?: string };
    answer?: { body?: string; checked?: boolean; choices?: Array<{ body?: string }> };
  }>;
  // Read by Workable, deliberately never forwarded to the model:
  // education_entries, image_url, address, phone, location, social_profiles.
}

export interface RawJob {
  shortcode: string;
  title: string;
  department?: string | null;
  account?: { name?: string };
}

/**
 * What the model is allowed to see about one candidate. Built in code by
 * blind.ts: no name, no contact details, no photo, no location, no school,
 * and no calendar dates (role lengths only, so nobody's age can be read off
 * a start year). `text` is the exact string the model screens, and the exact
 * string every quoted piece of evidence is checked against.
 */
export interface BlindProfile {
  candidateId: string;
  text: string;
  answersText: string;
  supportMonths: number; // computed in code, for the human-facing report only
}

export type MustHaveStatus = "met" | "not_met" | "unclear";
export type Recommendation = "advance" | "hold" | "decline";

export interface MustHaveCheck {
  requirement: string;
  status: MustHaveStatus;
  evidence: string; // a verbatim quote from the profile, or "" when unclear
}

/** What Claude returns for one candidate, before the code gate. */
export interface Screening {
  candidateId: string;
  mustHaves: MustHaveCheck[];
  niceToHaves: string[];
  dealbreaker: { triggered: boolean; quote: string };
  recommendation: Recommendation;
  reasoning: string;
  email: string; // uses {{first_name}}; "" for hold
}

/** The screening after the code gate has checked every quote. */
export interface GatedScreening extends Screening {
  proposed: Recommendation; // what the model asked for
  gateNotes: string[]; // every change the gate made, in words
}

export interface ScreenResult {
  candidate: RawCandidate;
  screening: GatedScreening;
  commentPosted: boolean;
  draftId: string | null;
}
