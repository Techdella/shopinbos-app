"use client";

import { useEffect } from "react";
import { Pill, type Tone } from "@/components/app-kit";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { primeServerClock, useServerNow } from "@/hooks/useServerClock";
import { campaignTimer, compactTimer, computeCampaignStatus, type CampaignStatus, type CampaignTiming } from "@/lib/store-campaigns/status";
import { formatEndLabel } from "@/components/storefront/campaign/CampaignCountdown";

// Live status and timer for a seasonal campaign (or any countdown) in the seller backend. The status is worked out
// again every second from the dates and the shared server clock, so a campaign flips from Scheduled to Live to Ended
// on screen at the right moment, matching the store.

export const STATUS_TONE: Record<CampaignStatus, Tone> = {
  draft: "muted",
  scheduled: "info",
  live: "success",
  ending_soon: "warning",
  ended: "muted",
  paused: "accent",
  archived: "muted",
};

/** Seeds the shared clock with the server time a page or API response carried. */
export function useServerTimeSeed(serverNow: string | number | null | undefined) {
  useEffect(() => {
    const ms = typeof serverNow === "number" ? serverNow : serverNow ? Date.parse(serverNow) : NaN;
    if (Number.isFinite(ms)) primeServerClock(ms, { endpoint: "/api/time" });
  }, [serverNow]);
}

export function useStatusLabel() {
  const t = useT("campaigns");
  return (status: CampaignStatus) => {
    switch (status) {
      case "draft": return t("status.draft");
      case "scheduled": return t("status.scheduled");
      case "live": return t("status.live");
      case "ending_soon": return t("status.ending_soon");
      case "ended": return t("status.ended");
      case "paused": return t("status.paused");
      default: return t("status.archived");
    }
  };
}

/** The status the campaign has right now on the shared clock (the server's until the first tick). */
export function useLiveStatus(timing: CampaignTiming, fallback: CampaignStatus): CampaignStatus {
  const now = useServerNow();
  return now > 0 ? computeCampaignStatus(timing, now) : fallback;
}

export function StatusPill({ status }: { status: CampaignStatus }) {
  const label = useStatusLabel();
  return <Pill tone={STATUS_TONE[status]} dot>{label(status)}</Pill>;
}

/** "Starts in 2d 04:13:22" / "Ends in 03:12:09" / "Ended 1 December, 11:59 pm" / "Paused". */
export function TimerText({ timing, timeZone = "Africa/Lagos", className }: { timing: CampaignTiming; timeZone?: string; className?: string }) {
  const t = useT("campaigns");
  const locale = useLocale();
  const now = useServerNow();
  if (now <= 0) return <span className={className} aria-hidden>…</span>;
  const timer = campaignTimer(timing, now);
  const label = timer.target !== null ? t("countdown.endsLabel", { date: formatEndLabel(timer.target, locale, timeZone) }) : undefined;
  let text: string;
  switch (timer.kind) {
    case "starts":
      text = t("timer.startsIn", { time: compactTimer(timer.msLeft) });
      break;
    case "ends":
      text = t("timer.endsIn", { time: compactTimer(timer.msLeft) });
      break;
    case "ended":
      text = t("timer.ended", { date: formatEndLabel(timer.target!, locale, timeZone) });
      break;
    case "paused":
      text = t("status.paused");
      break;
    default:
      text = t("timer.notScheduled");
  }
  return (
    <span role="timer" aria-live="off" aria-label={timer.kind === "starts" || timer.kind === "ends" ? `${text}. ${label}` : text} className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {text}
    </span>
  );
}

/** Status pill plus live timer, side by side (wraps on phones). */
export function CampaignStatusTimer({ timing, initialStatus, timeZone, compact = false }: { timing: CampaignTiming; initialStatus: CampaignStatus; timeZone?: string; compact?: boolean }) {
  const status = useLiveStatus(timing, initialStatus);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <StatusPill status={status} />
      <TimerText timing={timing} timeZone={timeZone} className={compact ? "text-[12.5px] text-app-ink-soft" : "text-[13.5px] font-bold text-app-ink"} />
    </span>
  );
}
