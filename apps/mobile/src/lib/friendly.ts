// Words a seller reads without thinking: "today", "yesterday", "Friday", amounts as ₦12,500.
// Pure (no React Native imports), so the root tests can load it.

const LAGOS_OFFSET_MS = 60 * 60_000;
const DAY_MS = 86_400_000;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Days since 1970 on the Lagos calendar. */
function lagosDay(time: number) {
  return Math.floor((time + LAGOS_OFFSET_MS) / DAY_MS);
}

/** "today", "yesterday", "Friday" (this past week), "tomorrow", or "12 Oct" (and the year when it isn't this one). */
export function friendlyDay(value: string | number | Date | null | undefined, now: Date = new Date()) {
  if (value === null || value === undefined || value === "") return "";
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  if (Number.isNaN(time)) return "";
  const diff = lagosDay(now.getTime()) - lagosDay(time);
  if (diff === 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff === -1) return "tomorrow";
  const local = new Date(time + LAGOS_OFFSET_MS);
  if (diff > 1 && diff < 7) return WEEKDAYS[local.getUTCDay()];
  const sameYear = new Date(now.getTime() + LAGOS_OFFSET_MS).getUTCFullYear() === local.getUTCFullYear();
  return `${local.getUTCDate()} ${MONTHS[local.getUTCMonth()]}${sameYear ? "" : ` ${local.getUTCFullYear()}`}`;
}

/** "today at 2:30pm" (Lagos time). */
export function friendlyTime(value: string | number | Date | null | undefined, now: Date = new Date()) {
  const day = friendlyDay(value, now);
  if (!day) return "";
  const local = new Date(new Date(value as string).getTime() + LAGOS_OFFSET_MS);
  const hours = local.getUTCHours();
  const minutes = String(local.getUTCMinutes()).padStart(2, "0");
  return `${day} at ${hours % 12 || 12}:${minutes}${hours < 12 ? "am" : "pm"}`;
}

/** Capital first letter, for the start of a line: "Today", "Yesterday". */
export function capitalise(text: string) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}
