// Seasonal campaign status, timers and scheduler jobs. Pure (no imports), so the seller pages, the storefront, the
// cron job and tests/store-campaigns.test.mjs all use the same rules.
//
// The status is always worked out from the dates, never stored, so it is right even when the scheduler runs late:
//   archived → draft (no dates) → ended (end passed) → paused → scheduled (not started) → ending soon → live.

export const CAMPAIGN_STATUSES = ["draft", "scheduled", "live", "ending_soon", "ended", "paused", "archived"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_TABS = ["all", "live", "scheduled", "drafts", "ended", "archived"] as const;
export type CampaignTab = (typeof CAMPAIGN_TABS)[number];

type When = Date | string | number | null | undefined;

export interface CampaignTiming {
  startsAt: When;
  endsAt: When;
  pausedAt?: When;
  archivedAt?: When;
  /** "Ending soon" once less than this many hours are left (0 turns it off). Default 24. */
  endingSoonHours?: number | null;
}

/** Milliseconds for a date-ish value, or null when it isn't a real time. */
export function toMs(value: When): number | null {
  if (value === null || value === undefined || value === "") return null;
  const ms = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function endingSoonMs(hours: number | null | undefined) {
  const value = typeof hours === "number" && Number.isFinite(hours) ? hours : 24;
  return Math.max(0, Math.min(24 * 30, value)) * 3_600_000;
}

/** The campaign's status at `now`. */
export function computeCampaignStatus(campaign: CampaignTiming, now: number = Date.now()): CampaignStatus {
  if (toMs(campaign.archivedAt) !== null) return "archived";
  const start = toMs(campaign.startsAt);
  const end = toMs(campaign.endsAt);
  if (start === null || end === null) return "draft";
  // An ended campaign reads as ended even if it was paused when the time ran out.
  if (now >= end) return "ended";
  if (toMs(campaign.pausedAt) !== null) return "paused";
  if (now < start) return "scheduled";
  const soon = endingSoonMs(campaign.endingSoonHours);
  if (soon > 0 && end - now < soon) return "ending_soon";
  return "live";
}

/** Live on the storefront right now (ending soon counts). */
export function isRunningStatus(status: CampaignStatus) {
  return status === "live" || status === "ending_soon";
}

/** Which list tab a campaign belongs to (paused ones sit with live or scheduled, by their dates). */
export function campaignTab(campaign: CampaignTiming, now: number = Date.now()): Exclude<CampaignTab, "all"> {
  const status = computeCampaignStatus(campaign, now);
  switch (status) {
    case "archived":
      return "archived";
    case "draft":
      return "drafts";
    case "ended":
      return "ended";
    case "scheduled":
      return "scheduled";
    case "paused":
      return now < (toMs(campaign.startsAt) ?? 0) ? "scheduled" : "live";
    default:
      return "live";
  }
}

/** "All" shows everything except archived campaigns. */
export function inCampaignTab(campaign: CampaignTiming, tab: CampaignTab, now: number = Date.now()) {
  const own = campaignTab(campaign, now);
  return tab === "all" ? own !== "archived" : own === tab;
}

export type TimerKind = "starts" | "ends" | "ended" | "paused" | "none";

export interface CampaignTimer {
  kind: TimerKind;
  /** The moment the timer counts to (start or end), or the end for "ended". */
  target: number | null;
  /** Time left to the target (0 when it isn't ticking). */
  msLeft: number;
}

/** What the live timer shows: time to start (scheduled), time to end (live), the end date (ended) or "Paused". */
export function campaignTimer(campaign: CampaignTiming, now: number = Date.now()): CampaignTimer {
  const status = computeCampaignStatus(campaign, now);
  const start = toMs(campaign.startsAt);
  const end = toMs(campaign.endsAt);
  if (status === "scheduled" && start !== null) return { kind: "starts", target: start, msLeft: Math.max(0, start - now) };
  if (isRunningStatus(status) && end !== null) return { kind: "ends", target: end, msLeft: Math.max(0, end - now) };
  if (status === "ended" && end !== null) return { kind: "ended", target: end, msLeft: 0 };
  if (status === "paused") return { kind: "paused", target: null, msLeft: 0 };
  return { kind: "none", target: null, msLeft: 0 };
}

// ─── Timer formatting ─────────────────────────────────────────────────────────

export const COUNTDOWN_FORMATS = ["dhms", "hms", "words"] as const;
export type CountdownFormat = (typeof COUNTDOWN_FORMATS)[number];

export interface TimeParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** Whole hours including the days (for HH:MM:SS). */
  totalHours: number;
  done: boolean;
}

export function timeParts(ms: number): TimeParts {
  const left = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  return {
    days: Math.floor(left / 86_400),
    hours: Math.floor((left % 86_400) / 3_600),
    minutes: Math.floor((left % 3_600) / 60),
    seconds: left % 60,
    totalHours: Math.floor(left / 3_600),
    done: left <= 0,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The digits a countdown shows: "02:04:13:22" (dhms), "52:13:22" (hms). "words" has no digits: callers show
 * wordsUnit() through their translations ("2 days left").
 */
export function clockDigits(ms: number, format: CountdownFormat = "dhms"): string {
  const p = timeParts(ms);
  if (format === "hms") return `${pad(p.totalHours)}:${pad(p.minutes)}:${pad(p.seconds)}`;
  return `${pad(p.days)}:${pad(p.hours)}:${pad(p.minutes)}:${pad(p.seconds)}`;
}

/** The seller backend's compact timer: "2d 04:13:22", or "04:13:22" under a day. */
export function compactTimer(ms: number): string {
  const p = timeParts(ms);
  const clock = `${pad(p.hours)}:${pad(p.minutes)}:${pad(p.seconds)}`;
  return p.days > 0 ? `${p.days}d ${clock}` : clock;
}

/** The biggest whole unit left, for "2 days left" / "5 hours left" / "12 minutes left" (rounded up). */
export function wordsUnit(ms: number): { unit: "days" | "hours" | "minutes"; count: number } {
  const left = Math.max(0, ms);
  if (left >= 86_400_000) return { unit: "days", count: Math.ceil(left / 86_400_000) };
  if (left >= 3_600_000) return { unit: "hours", count: Math.ceil(left / 3_600_000) };
  return { unit: "minutes", count: Math.max(0, Math.ceil(left / 60_000)) };
}

// ─── Lists ────────────────────────────────────────────────────────────────────

export interface WidgetItem {
  status: CampaignStatus;
  startsAt: When;
  endsAt: When;
}

/** Dashboard order: live (soonest end first), then scheduled by start time; nothing else. Max `limit`. */
export function sortForWidget<T extends WidgetItem>(items: T[], limit = 5): T[] {
  const live = items.filter((item) => isRunningStatus(item.status) || item.status === "paused");
  const scheduled = items.filter((item) => item.status === "scheduled");
  live.sort((a, b) => (toMs(a.endsAt) ?? Infinity) - (toMs(b.endsAt) ?? Infinity));
  scheduled.sort((a, b) => (toMs(a.startsAt) ?? Infinity) - (toMs(b.startsAt) ?? Infinity));
  return [...live, ...scheduled].slice(0, limit);
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

export type CampaignJob = "start" | "ending_soon" | "end";

export interface JobState extends CampaignTiming {
  startJobRanAt?: When;
  endJobRanAt?: When;
  endingSoonSentAt?: When;
}

/**
 * Side effects still owed at `now`. A late run still gets everything right: a campaign whose whole window was
 * missed only gets its end job (the runner marks the start as done without telling the seller it went live).
 * Running the jobs marks them, so asking again returns nothing.
 */
export function dueCampaignJobs(campaign: JobState, now: number = Date.now()): CampaignJob[] {
  if (toMs(campaign.archivedAt) !== null) return [];
  const start = toMs(campaign.startsAt);
  const end = toMs(campaign.endsAt);
  if (start === null || end === null) return [];
  if (now >= end) return toMs(campaign.endJobRanAt) === null ? ["end"] : [];
  if (now < start || toMs(campaign.pausedAt) !== null) return [];
  const jobs: CampaignJob[] = [];
  if (toMs(campaign.startJobRanAt) === null) jobs.push("start");
  const soon = endingSoonMs(campaign.endingSoonHours);
  if (soon > 0 && end - now < soon && toMs(campaign.endingSoonSentAt) === null) jobs.push("ending_soon");
  return jobs;
}

/** Whether a missed start should be announced: only when the campaign is still running. */
export function startWasMissed(campaign: JobState, now: number = Date.now()) {
  const end = toMs(campaign.endsAt);
  return end !== null && now >= end && toMs(campaign.startJobRanAt) === null;
}

/**
 * The job marks to clear when the seller moves the dates, so the side effects run again for the new window:
 * a start moved into the future clears the start (and ending-soon) marks; an end moved into the future clears the
 * end and ending-soon marks.
 */
export function jobResetsForNewDates(next: { startsAt: When; endsAt: When }, now: number = Date.now()) {
  const start = toMs(next.startsAt);
  const end = toMs(next.endsAt);
  return {
    startJobRanAt: start !== null && start > now,
    endJobRanAt: end !== null && end > now,
    endingSoonSentAt: end !== null && end > now,
  };
}

// ─── Overlaps ─────────────────────────────────────────────────────────────────

export interface OverlapCandidate extends CampaignTiming {
  id: string;
  name: string;
  hasOverrides: boolean;
}

/** Other non-archived campaigns with look or section changes whose dates overlap this one's. */
export function overlappingCampaigns<T extends OverlapCandidate>(target: { id?: string | null; startsAt: When; endsAt: When }, others: T[]): T[] {
  const start = toMs(target.startsAt);
  const end = toMs(target.endsAt);
  if (start === null || end === null) return [];
  return others.filter((other) => {
    if (other.id === target.id || !other.hasOverrides || toMs(other.archivedAt) !== null) return false;
    const otherStart = toMs(other.startsAt);
    const otherEnd = toMs(other.endsAt);
    if (otherStart === null || otherEnd === null) return false;
    return otherStart < end && start < otherEnd;
  });
}

/** True when the linked discount's own dates don't cover the campaign's window. */
export function discountDatesMismatch(campaign: { startsAt: When; endsAt: When }, discount: { startsAt?: When; expiresAt?: When } | null) {
  if (!discount) return false;
  const start = toMs(campaign.startsAt);
  const end = toMs(campaign.endsAt);
  if (start === null || end === null) return false;
  const dStart = toMs(discount.startsAt);
  const dEnd = toMs(discount.expiresAt);
  return (dStart !== null && dStart > start) || (dEnd !== null && dEnd < end);
}
