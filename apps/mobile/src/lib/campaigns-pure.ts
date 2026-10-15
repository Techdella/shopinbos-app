// Seasonal campaigns on the phone (web /home/campaigns): status from the dates, the list groups, live countdowns,
// the server clock, wall-clock dates in the campaign's time zone and the little calendar. No imports, so
// tests/mobile-campaigns.test.mjs loads it directly. The status rules are copies of src/lib/store-campaigns/status.ts
// and the preset colours of src/lib/store-campaigns/presets.ts; the test checks both still match.

export type CampaignStatus = "draft" | "scheduled" | "live" | "ending_soon" | "ended" | "paused" | "archived";
export type CampaignGroup = "live" | "scheduled" | "drafts" | "ended";

type When = string | number | null | undefined;

export interface CampaignTiming {
  startsAt: When;
  endsAt: When;
  pausedAt?: When;
  archivedAt?: When;
  endingSoonHours?: number | null;
}

// ─── Presets (the web's CAMPAIGN_PRESETS, in the same order) ────────────────────

export const PRESETS: { id: string; swatch: [string, string, string] }[] = [
  { id: "black_friday", swatch: ["#0A0A0A", "#FFD60A", "#FFFFFF"] },
  { id: "cyber_monday", swatch: ["#120A2E", "#00E5FF", "#FF3D71"] },
  { id: "christmas", swatch: ["#0F5132", "#C62828", "#FFF4E0"] },
  { id: "detty_december", swatch: ["#0B1F14", "#E8B53A", "#FFF7E6"] },
  { id: "new_year", swatch: ["#1B1B3A", "#F5C542", "#FFFFFF"] },
  { id: "valentine", swatch: ["#D6336C", "#FFF0F3", "#5A0B24"] },
  { id: "easter", swatch: ["#B8E0D2", "#F6E7A1", "#6B4F8A"] },
  { id: "ramadan_eid", swatch: ["#123B2A", "#C9A24A", "#F6F1E4"] },
  { id: "back_to_school", swatch: ["#FFD23F", "#3A86FF", "#1D1A16"] },
  { id: "flash_sale", swatch: ["#1A0B2E", "#FF3D71", "#FFD60A"] },
  { id: "blank", swatch: ["#F4F1EA", "#0E2A38", "#73D8C8"] },
];

export function presetSwatch(id: string | null | undefined): [string, string, string] {
  return (PRESETS.find((preset) => preset.id === id) ?? PRESETS[PRESETS.length - 1]).swatch;
}

// ─── Status ─────────────────────────────────────────────────────────────────

export function toMs(value: When): number | null {
  if (value === null || value === undefined || value === "") return null;
  const ms = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function endingSoonMs(hours: number | null | undefined) {
  const value = typeof hours === "number" && Number.isFinite(hours) ? hours : 24;
  return Math.max(0, Math.min(24 * 30, value)) * 3_600_000;
}

/** The campaign's status at `now` (always from the dates, like the server). */
export function campaignStatus(campaign: CampaignTiming, now: number): CampaignStatus {
  if (toMs(campaign.archivedAt) !== null) return "archived";
  const start = toMs(campaign.startsAt);
  const end = toMs(campaign.endsAt);
  if (start === null || end === null) return "draft";
  if (now >= end) return "ended";
  if (toMs(campaign.pausedAt) !== null) return "paused";
  if (now < start) return "scheduled";
  const soon = endingSoonMs(campaign.endingSoonHours);
  if (soon > 0 && end - now < soon) return "ending_soon";
  return "live";
}

export const isRunning = (status: CampaignStatus) => status === "live" || status === "ending_soon";

/** The list group: paused ones sit with live or scheduled by their dates; archived ones aren't shown. */
export function campaignGroup(campaign: CampaignTiming, now: number): CampaignGroup | null {
  const status = campaignStatus(campaign, now);
  if (status === "archived") return null;
  if (status === "draft") return "drafts";
  if (status === "ended") return "ended";
  if (status === "scheduled") return "scheduled";
  if (status === "paused") return now < (toMs(campaign.startsAt) ?? 0) ? "scheduled" : "live";
  return "live";
}

export const GROUP_ORDER: CampaignGroup[] = ["live", "scheduled", "drafts", "ended"];

/** Live (soonest end first), scheduled (soonest start first), drafts (newest first), ended (latest end first). */
export function groupCampaigns<T extends CampaignTiming & { updatedAt?: string | null }>(campaigns: T[], now: number): { group: CampaignGroup; items: T[] }[] {
  const groups: Record<CampaignGroup, T[]> = { live: [], scheduled: [], drafts: [], ended: [] };
  for (const campaign of campaigns) {
    const group = campaignGroup(campaign, now);
    if (group) groups[group].push(campaign);
  }
  const at = (value: When, missing: number) => toMs(value) ?? missing;
  groups.live.sort((a, b) => at(a.endsAt, Infinity) - at(b.endsAt, Infinity));
  groups.scheduled.sort((a, b) => at(a.startsAt, Infinity) - at(b.startsAt, Infinity));
  groups.drafts.sort((a, b) => at(b.updatedAt, 0) - at(a.updatedAt, 0));
  groups.ended.sort((a, b) => at(b.endsAt, 0) - at(a.endsAt, 0));
  return GROUP_ORDER.filter((group) => groups[group].length).map((group) => ({ group, items: groups[group] }));
}

/** What the seller can do from the phone: pause a live or scheduled one, resume a paused one, end one that started. */
export function campaignActions(campaign: CampaignTiming, now: number) {
  const status = campaignStatus(campaign, now);
  const started = (toMs(campaign.startsAt) ?? Infinity) <= now;
  return {
    pause: isRunning(status) || status === "scheduled",
    resume: status === "paused",
    endNow: (isRunning(status) || status === "paused") && started,
  };
}

// ─── Countdowns ─────────────────────────────────────────────────────────────

export type TimerKind = "starts" | "ends" | "ended" | "paused" | "none";

/** To the start when scheduled, to the end when live, the end date when ended, nothing ticking when paused. */
export function campaignTimer(campaign: CampaignTiming, now: number): { kind: TimerKind; target: number | null; msLeft: number } {
  const status = campaignStatus(campaign, now);
  const start = toMs(campaign.startsAt);
  const end = toMs(campaign.endsAt);
  if (status === "scheduled" && start !== null) return { kind: "starts", target: start, msLeft: Math.max(0, start - now) };
  if (isRunning(status) && end !== null) return { kind: "ends", target: end, msLeft: Math.max(0, end - now) };
  if (status === "ended" && end !== null) return { kind: "ended", target: end, msLeft: 0 };
  if (status === "paused") return { kind: "paused", target: null, msLeft: 0 };
  return { kind: "none", target: null, msLeft: 0 };
}

/** A home countdown (campaign, countdown pop-up or section) as timing: the server says whether it is paused. */
export function countdownTiming(item: { status: CampaignStatus; startsAt: string | null; endsAt: string | null }): CampaignTiming {
  return { startsAt: item.startsAt, endsAt: item.endsAt, pausedAt: item.status === "paused" ? 0 : null, endingSoonHours: 0 };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "04:13:22" and the whole days ("2" for "2d 04:13:22"), like the web's compact timer. */
export function countdownParts(ms: number): { days: number; clock: string } {
  const left = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  const days = Math.floor(left / 86_400);
  return { days, clock: `${pad(Math.floor((left % 86_400) / 3_600))}:${pad(Math.floor((left % 3_600) / 60))}:${pad(left % 60)}` };
}

/** "2d 04:13:22", or "04:13:22" under a day. */
export function compactTimer(ms: number): string {
  const { days, clock } = countdownParts(ms);
  return days > 0 ? `${days}d ${clock}` : clock;
}

/** How far the server clock is ahead of this phone, from one request (the server read its clock about halfway). */
export function clockOffset(serverNow: string | number | null | undefined, sentAt: number, receivedAt: number): number {
  const server = toMs(serverNow);
  if (server === null) return 0;
  return server + Math.max(0, receivedAt - sentAt) / 2 - receivedAt;
}

// ─── Dates in the campaign's time zone ──────────────────────────────────────

export interface Wall {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const LAGOS = "Africa/Lagos";
const HOUR = 3_600_000;

/** How far `zone` is ahead of UTC at `ms`. Lagos is always +1 (no daylight saving); others through Intl. */
export function zoneOffsetMs(ms: number, zone: string): number {
  if (!zone || zone === LAGOS) return HOUR;
  if (zone === "UTC") return 0;
  try {
    const parts: Record<string, number> = {};
    const format = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    for (const part of format.formatToParts(new Date(ms))) if (part.type !== "literal") parts[part.type] = Number(part.value);
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour === 24 ? 0 : parts.hour, parts.minute, parts.second);
    return Number.isFinite(asUtc) ? asUtc - Math.floor(ms / 1000) * 1000 : HOUR;
  } catch {
    return HOUR;
  }
}

/** The wall-clock date and time of `ms` in `zone`. */
export function toWall(ms: number, zone: string): Wall {
  const local = new Date(ms + zoneOffsetMs(ms, zone));
  return { year: local.getUTCFullYear(), month: local.getUTCMonth() + 1, day: local.getUTCDate(), hour: local.getUTCHours(), minute: local.getUTCMinutes() };
}

/** A wall-clock time in `zone` as UTC ms (corrected once for a daylight-saving change in between). */
export function fromWall(wall: Wall, zone: string): number {
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  let utc = asUtc - zoneOffsetMs(asUtc, zone);
  const corrected = asUtc - zoneOffsetMs(utc, zone);
  if (corrected !== utc) utc = corrected;
  return utc;
}

/** "9:00am", "11:59pm". */
export function clockText(hour: number, minute: number) {
  return `${hour % 12 || 12}:${pad(minute)}${hour < 12 ? "am" : "pm"}`;
}

/** Times offered under the calendar (the presets start at midnight and end at 11:59pm). */
export const TIME_CHOICES: [number, number][] = [[0, 0], [6, 0], [8, 0], [9, 0], [12, 0], [15, 0], [18, 0], [20, 0], [21, 0], [23, 59]];

/** The days of a month for a calendar, Monday first: null for the blanks before the 1st and after the last day. */
export function monthGrid(year: number, month: number): (number | null)[] {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const blanks = (first + 6) % 7;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array.from({ length: blanks }, () => null), ...Array.from({ length: days }, (_, index) => index + 1)];
  while (cells.length % 7) cells.push(null);
  return cells;
}

/** The month before or after (month 1-12). */
export function shiftMonth(year: number, month: number, by: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + by;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

// ─── The create / change form ───────────────────────────────────────────────

export type ScheduleProblem = "bothDates" | "endAfterStart" | "endPassed" | null;

export function scheduleProblem(startsAt: number | null, endsAt: number | null, now: number): ScheduleProblem {
  if (startsAt === null || endsAt === null) return "bothDates";
  if (endsAt <= startsAt) return "endAfterStart";
  if (endsAt <= now) return "endPassed";
  return null;
}

/** What shoppers type: capitals, digits, - and _, at most 40. */
export function cleanCode(text: string) {
  return text.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40);
}

/** A code from the campaign name and percent ("Black Friday 2026", 20 → "BLACKFRI20"). */
export function suggestCampaignCode(name: string, percent: number) {
  const word = name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8) || "SALE";
  return `${word}${percent > 0 && percent <= 100 ? Math.round(percent) : ""}`.slice(0, 12);
}

export function percentOk(value: number) {
  return Number.isFinite(value) && value >= 1 && value <= 100;
}
