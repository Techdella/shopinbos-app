import type { TFunction } from "@shared/i18n";
import {
  DECLINE_REASONS,
  EXCEPTION_WORDS,
  ISSUE_WORDS,
  JOB_STATUS_WORDS,
  OFF_PLATFORM_WARNING,
  POD_DISCLAIMER,
  SERVICE_LABELS,
  SIZE_BAND_LABELS,
  timeframeWords,
  type ExceptionKind,
  type IssueKind,
  type PartnerService,
  type SizeBand,
  type TimelineStep,
} from "@shared/delivery-market";
import { RANGE_LABELS, type AnalyticsRangeDays } from "@/lib/delivery-market/analytics";

// The logistics marketplace's rule words (shared/delivery-market.ts, src/lib/delivery-market/analytics.ts) in the
// app language. The English constants stay where they are (tests read them, and the server stores decline reasons
// in English); here they're looked up in the "delivery" catalog with t.dynamic, English as the fallback. Pass any t
// that includes the "delivery" namespace (getT on the server, the useT hook in the browser).

export type DeliveryWords = Pick<TFunction, "dynamic" | "locale">;

export const serviceLabel = (t: DeliveryWords, service: string) =>
  t.dynamic(`service.${service}`, SERVICE_LABELS[service as PartnerService] ?? service.replace(/_/g, " "));

export const sizeLabel = (t: DeliveryWords, band: string) => t.dynamic(`size.${band}`, SIZE_BAND_LABELS[band as SizeBand] ?? band);

export const jobStatusLabel = (t: DeliveryWords, status: string) => t.dynamic(`status.${status}`, JOB_STATUS_WORDS[status] ?? status);

export const exceptionLabel = (t: DeliveryWords, kind: string) => t.dynamic(`exception.${kind}`, EXCEPTION_WORDS[kind as ExceptionKind] ?? kind);

export const issueLabel = (t: DeliveryWords, kind: string) => t.dynamic(`issue.${kind}`, ISSUE_WORDS[kind as IssueKind] ?? kind);

/** Keys of DECLINE_REASONS, in the same order. */
const DECLINE_KEYS = ["noRoute", "noRider", "tooBig", "badAddress", "other"] as const;

/** One of DECLINE_REASONS (the value the form posts stays English). */
export const declineReasonOption = (t: DeliveryWords, reason: string) => {
  const index = (DECLINE_REASONS as readonly string[]).indexOf(reason);
  return index < 0 ? reason : t.dynamic(`decline.${DECLINE_KEYS[index]}`, reason);
};

/**
 * A stored decline reason: "We don't cover this route right now. Too far" → the reason in the app language plus the
 * partner's own note as they wrote it. "No reason given" (analytics) too.
 */
export function declineReasonText(t: DeliveryWords, text: string) {
  if (text === "No reason given") return t.dynamic("decline.none", text);
  for (const reason of DECLINE_REASONS) {
    if (text === reason) return declineReasonOption(t, reason);
    if (text.startsWith(`${reason}. `)) return `${declineReasonOption(t, reason)}. ${text.slice(reason.length + 2)}`;
  }
  return text;
}

export const podDisclaimer = (t: DeliveryWords) => t.dynamic("pod.disclaimer", POD_DISCLAIMER);

export const offPlatformWarning = (t: DeliveryWords) => t.dynamic("offPlatform.warning", OFF_PLATFORM_WARNING);

/** "Same day" · "1 day" · "1–2 days" (shared/delivery-market.ts timeframeWords) in the app language. */
export function timeframeLabel(t: DeliveryWords, minDays: number, maxDays: number) {
  const english = timeframeWords(minDays, maxDays);
  if (maxDays <= 0) return t.dynamic("time.sameDay", english);
  if (minDays === maxDays) return t.dynamic("time.days", english, { count: maxDays });
  return t.dynamic("time.dayRange", english, { min: minDays, max: maxDays });
}

/** A timeframe already written by timeframeWords / cardTimeframe ("Same day", "1 day", "1–2 days", "Same day – 3 days"). */
export function timeframeText(t: DeliveryWords, text: string | null | undefined): string | null {
  if (!text) return text ?? null;
  const span = /^(.+?) – (.+)$/.exec(text);
  if (span) return `${timeframeText(t, span[1])} – ${timeframeText(t, span[2])}`;
  if (text === "Same day") return t.dynamic("time.sameDay", text);
  const one = /^(\d+) days?$/.exec(text);
  if (one) return t.dynamic("time.days", text, { count: Number(one[1]) });
  const range = /^(\d+)–(\d+) days$/.exec(text);
  if (range) return t.dynamic("time.dayRange", text, { min: Number(range[1]), max: Number(range[2]) });
  return text;
}

/** "Last 30 days" · "Last 90 days" · "Last 12 months". */
export const rangeLabel = (t: DeliveryWords, days: AnalyticsRangeDays) => t.dynamic(`range.${days}`, RANGE_LABELS[days]);

/** "12 min" · "3.5 hours" · "2.5 days" (src/lib/delivery-market/analytics.ts durationWords). */
export function durationLabel(t: DeliveryWords, millis: number | null) {
  if (millis === null || !Number.isFinite(millis)) return "—";
  const minutes = Math.max(0, Math.round(millis / 60_000));
  if (minutes < 60) return t.dynamic("time.minutes", `${minutes} min`, { count: minutes });
  const hours = millis / 3_600_000;
  if (hours < 48) {
    const count = Math.round(hours * 10) / 10;
    return t.dynamic("time.hours", `${count} hours`, { count });
  }
  const count = Math.round((hours / 24) * 10) / 10;
  return t.dynamic("time.daysLong", `${count} days`, { count });
}

const TIMELINE_KEYS: Record<string, string> = {
  "Order placed": "timeline.placed",
  "Ready for pickup": "timeline.readyForPickup",
  "Being prepared": "timeline.beingPrepared",
  Collected: "timeline.collected",
  Delivered: "timeline.delivered",
  "Sent to delivery partner": "timeline.sent",
  Accepted: "timeline.accepted",
  "Picked up": "timeline.pickedUp",
  "In transit": "timeline.inTransit",
  "At pickup point": "timeline.atPickupPoint",
  "Out for delivery": "timeline.outForDelivery",
};

/** A deliveryTimeline step's label in the app language. */
export const timelineLabel = (t: DeliveryWords, step: Pick<TimelineStep, "label">) => {
  const key = TIMELINE_KEYS[step.label];
  return key ? t.dynamic(key, step.label) : step.label;
};

/** The ?saved= texts the delivery actions send back (src/app/actions/delivery-market.ts), in the app language. */
const SAVED_KEYS: Record<string, string> = {
  "Delivery settings saved.": "flash.settingsSaved",
  "Partner added. Their public rates now price your deliveries with them.": "flash.partnerAdded",
  "Partner settings saved.": "flash.partnerSaved",
  "Partner removed. Jobs already sent to them carry on.": "flash.partnerRemoved",
  "Private rates accepted. New orders use them.": "flash.ratesAccepted",
  "Private rates declined. Their public rates still apply.": "flash.ratesDeclined",
  "Marked ready. Your partner knows they can collect it.": "flash.markedReady",
  "Sent to the new partner. They have a few hours to accept.": "flash.reassigned",
  "Thanks. We've noted that you got the cash.": "flash.cashConfirmed",
};

export const savedText = (t: DeliveryWords, text: string) => (SAVED_KEYS[text] ? t.dynamic(SAVED_KEYS[text], text) : text);
