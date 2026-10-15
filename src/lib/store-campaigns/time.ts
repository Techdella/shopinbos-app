// Time zones and clock drift for seasonal campaigns. Pure (Intl only).
//
// Campaign times are stored in UTC. The seller picks them as wall-clock times in the campaign's time zone (Africa/Lagos
// unless they choose another), so a phone set to another zone, or daylight saving elsewhere, never moves a sale.

export const DEFAULT_CAMPAIGN_TIME_ZONE = "Africa/Lagos";

/** Time zones offered in the editor (the store's markets first). Any valid IANA zone is accepted by the API. */
export const CAMPAIGN_TIME_ZONES = [
  "Africa/Lagos",
  "Africa/Accra",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "Africa/Cairo",
  "Africa/Abidjan",
  "Africa/Kigali",
  "Europe/London",
  "America/New_York",
  "UTC",
] as const;

export function isValidTimeZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || !zone || zone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function safeTimeZone(zone: unknown): string {
  return isValidTimeZone(zone) ? zone : DEFAULT_CAMPAIGN_TIME_ZONE;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(zone: string) {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    formatters.set(zone, formatter);
  }
  return formatter;
}

/** The wall-clock fields of `ms` in `zone`. */
export function zonedParts(ms: number, zone: string) {
  const out: Record<string, number> = {};
  for (const part of partsFormatter(safeTimeZone(zone)).formatToParts(new Date(ms))) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  return { year: out.year, month: out.month, day: out.day, hour: out.hour === 24 ? 0 : out.hour, minute: out.minute, second: out.second };
}

/** How far `zone` is ahead of UTC at `ms`, in milliseconds (Lagos: +1h). */
export function zoneOffsetMs(ms: number, zone: string) {
  const p = zonedParts(ms, zone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** A wall-clock time in `zone` ("2026-11-27T00:00", what a datetime-local input holds) as a UTC Date. */
export function zonedInputToUtc(local: string, zone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const wall = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0));
  if (!Number.isFinite(wall)) return null;
  // Guess with the offset at that moment, then correct once for a daylight-saving change in between.
  let utc = wall - zoneOffsetMs(wall, zone);
  const corrected = wall - zoneOffsetMs(utc, zone);
  if (corrected !== utc) utc = corrected;
  return new Date(utc);
}

/** A UTC time as the datetime-local value for `zone` ("2026-11-27T00:00"). */
export function utcToZonedInput(value: Date | string | number | null | undefined, zone: string): string {
  if (value === null || value === undefined || value === "") return "";
  const ms = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(ms)) return "";
  const p = zonedParts(ms, zone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** A wall-clock date and time in `zone` as UTC ms (for presets: "27 Nov 2026, 00:00 in Lagos"). */
export function zonedTime(zone: string, year: number, month: number, day: number, hour = 0, minute = 0): number {
  const pad = (n: number) => String(n).padStart(2, "0");
  // Date.UTC normalises day overflow (e.g. 32 December → 1 January) before we format it.
  const normal = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const local = `${normal.getUTCFullYear()}-${pad(normal.getUTCMonth() + 1)}-${pad(normal.getUTCDate())}T${pad(normal.getUTCHours())}:${pad(normal.getUTCMinutes())}`;
  return zonedInputToUtc(local, zone)!.getTime();
}

/**
 * The server clock's lead over this device, from one round trip: the server read its clock about halfway between
 * sending and receiving. Add the result to Date.now() to get server time.
 */
export function clockOffset(serverNowMs: number, sentAtMs: number, receivedAtMs: number) {
  const roundTrip = Math.max(0, receivedAtMs - sentAtMs);
  return serverNowMs + roundTrip / 2 - receivedAtMs;
}
