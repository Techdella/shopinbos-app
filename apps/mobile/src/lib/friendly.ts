// Words a seller reads without thinking: "today", "yesterday", "Friday", amounts as ₦12,500.
// Pure (no React Native imports), so the root tests can load it. Pass the screen's `t` (with "m_ui") for the app
// language; without it the words are English.
import type { TFunction } from "@shared/i18n";

type Words = Pick<TFunction, "dynamic">;
const say = (t: Words | undefined, key: string, english: string, vars?: Record<string, string | number>) => (t ? t.dynamic(key, english, vars) : english);

const LAGOS_OFFSET_MS = 60 * 60_000;
const DAY_MS = 86_400_000;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Days since 1970 on the Lagos calendar. */
function lagosDay(time: number) {
  return Math.floor((time + LAGOS_OFFSET_MS) / DAY_MS);
}

/** "today", "yesterday", "Friday" (this past week), "tomorrow", or "12 Oct" (and the year when it isn't this one). */
export function friendlyDay(value: string | number | Date | null | undefined, now: Date = new Date(), t?: Words) {
  if (value === null || value === undefined || value === "") return "";
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  if (Number.isNaN(time)) return "";
  const diff = lagosDay(now.getTime()) - lagosDay(time);
  if (diff === 0) return say(t, "day.today", "today");
  if (diff === 1) return say(t, "day.yesterday", "yesterday");
  if (diff === -1) return say(t, "day.tomorrow", "tomorrow");
  const local = new Date(time + LAGOS_OFFSET_MS);
  if (diff > 1 && diff < 7) return say(t, `day.weekday.${local.getUTCDay()}`, WEEKDAYS[local.getUTCDay()]);
  const sameYear = new Date(now.getTime() + LAGOS_OFFSET_MS).getUTCFullYear() === local.getUTCFullYear();
  const month = say(t, `day.month.${local.getUTCMonth()}`, MONTHS[local.getUTCMonth()]);
  return `${local.getUTCDate()} ${month}${sameYear ? "" : ` ${local.getUTCFullYear()}`}`;
}

/** "today at 2:30pm" (Lagos time). */
export function friendlyTime(value: string | number | Date | null | undefined, now: Date = new Date(), t?: Words) {
  const day = friendlyDay(value, now, t);
  if (!day) return "";
  const local = new Date(new Date(value as string).getTime() + LAGOS_OFFSET_MS);
  const hours = local.getUTCHours();
  const minutes = String(local.getUTCMinutes()).padStart(2, "0");
  const clock = `${hours % 12 || 12}:${minutes}${hours < 12 ? "am" : "pm"}`;
  return t ? t.dynamic("day.at", `${day} at ${clock}`, { day, time: clock }) : `${day} at ${clock}`;
}

/** Capital first letter, for the start of a line: "Today", "Yesterday". */
export function capitalise(text: string) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}
