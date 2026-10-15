import { intlLocale, type Locale } from "@shared/i18n";

/** A campaign time as the seller reads it, in the campaign's time zone ("27 Nov, 12:00 am"). */
export function formatZoned(iso: string | null | undefined, timeZone: string, locale: Locale, withTime = true) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", ...(withTime ? { hour: "numeric", minute: "2-digit" } : { year: "numeric" }), timeZone }).format(date);
  } catch {
    return date.toISOString().slice(0, 16).replace("T", " ");
  }
}
