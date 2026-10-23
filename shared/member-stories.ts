// Member stories ("From a real member" in the weekly tips), pure: the consent wording, the limits, checking what a
// member wrote, and which approved story a reader sees this week. Tested in tests/member-stories.test.mjs; storage and
// sending are src/lib/member-messaging/stories.server.ts.
//
// Nigeria Data Protection Act 2023: a story is used only with the member's explicit consent to exactly this wording
// (kept with the story, with the time), only for what it says, never with their contact details, and withdrawing it
// stops it in new messages at once. The team approves each story before it's used.

export const STORY_ROLES = ["seller", "supplier", "logistics_partner"] as const;
export type StoryRole = (typeof STORY_ROLES)[number];

export const STORY_LIMITS = { name: 60, city: 40, result: 80, story: 400, storyMin: 40 } as const;

export const CONSENT_VERSION = "v1";

/** What the member agrees to, word for word (stored with their story). */
export function consentText() {
  return [
    "I agree that Shopinbos may show my story in its emails to other businesses on Shopinbos, to show them what's possible:",
    "the name I gave, my city, what changed for me, my own words, and the Rex video I picked if I picked one.",
    "Shopinbos won't share my phone number, email or any other contact details, and won't change my words.",
    "I can stop this any time from this page, and my story then stops appearing in new emails straight away.",
  ].join(" ");
}

export interface StoryInput {
  displayName: string;
  city?: string | null;
  result?: string | null;
  story: string;
  consent: boolean;
}

const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const CONTACT = /(\+?\d[\d\s-]{8,}\d)|([\w.+-]+@[\w-]+\.[\w.]+)|(https?:\/\/|www\.)/i;

/** Checks a story: required fields, lengths, explicit consent, and no phone numbers, emails or links in it. */
export function checkStory(input: StoryInput): { ok: true; value: { displayName: string; city: string | null; result: string | null; story: string } } | { ok: false; error: string } {
  const displayName = clean(input.displayName);
  const city = clean(input.city) || null;
  const result = clean(input.result) || null;
  const story = clean(input.story);
  if (!input.consent) return { ok: false, error: "Tick the box to say we may share your story." };
  if (!displayName) return { ok: false, error: "Add the name you'd like us to use." };
  if (displayName.length > STORY_LIMITS.name) return { ok: false, error: `Keep the name under ${STORY_LIMITS.name} characters.` };
  if (city && city.length > STORY_LIMITS.city) return { ok: false, error: `Keep the city under ${STORY_LIMITS.city} characters.` };
  if (result && result.length > STORY_LIMITS.result) return { ok: false, error: `Keep "what changed" under ${STORY_LIMITS.result} characters.` };
  if (story.length < STORY_LIMITS.storyMin) return { ok: false, error: "Tell us a little more: a few sentences is perfect." };
  if (story.length > STORY_LIMITS.story) return { ok: false, error: `Keep your story under ${STORY_LIMITS.story} characters.` };
  if ([displayName, city, result, story].some((value) => value && CONTACT.test(value))) {
    return { ok: false, error: "Please leave out phone numbers, emails and links: we never share contact details." };
  }
  return { ok: true, value: { displayName, city, result, story } };
}

export interface ShowableStory {
  id: string;
  userId: string;
  role: string;
  status: string;
  approvedAt?: Date | null;
}

/** This week's story for a reader: an approved one for their role that isn't their own, taking turns week by week. */
export function storyForReader<T extends ShowableStory>(stories: readonly T[], role: string, readerId: string, week: number): T | null {
  const pool = stories.filter((story) => story.status === "approved" && story.role === role && story.userId !== readerId).sort((a, b) => a.id.localeCompare(b.id));
  return pool.length ? pool[((week % pool.length) + pool.length) % pool.length] : null;
}

/** Whole weeks since 2026-01-05 (a Monday), for taking turns. */
export function storyWeek(now: Date) {
  return Math.floor((now.getTime() - Date.UTC(2026, 0, 5)) / (7 * 86_400_000));
}

export const STORY_STATUS_LABEL: Record<string, string> = {
  submitted: "Waiting for review",
  approved: "Approved: in the tips",
  rejected: "Not used",
  withdrawn: "Withdrawn",
};
