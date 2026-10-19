"use client";

import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { useServerNow } from "@/hooks/useServerClock";
import { campaignTimer, compactTimer, computeCampaignStatus } from "@/lib/store-campaigns/status";
import { useServerTimeSeed } from "./CampaignTimer";

// A small clock on a product in the seller's product list when a live or upcoming campaign badges it. Hover (or
// focus) shows the campaign and the time left.

export function ProductCampaignBadge({ campaign, serverNow }: { campaign: { campaignId: string; name: string; startsAt: string | null; endsAt: string | null }; serverNow: string }) {
  const t = useT("campaigns");
  useServerTimeSeed(serverNow);
  const now = useServerNow();
  const status = now > 0 ? computeCampaignStatus(campaign, now) : null;
  if (status === "ended" || status === "archived") return null;
  const timer = now > 0 ? campaignTimer(campaign, now) : null;
  const time = timer && (timer.kind === "starts" || timer.kind === "ends") ? compactTimer(timer.msLeft) : "";
  const text = !timer ? campaign.name : timer.kind === "starts" ? t("timer.startsIn", { time }) : timer.kind === "ends" ? t("timer.endsIn", { time }) : t("status.paused");
  const live = status === "live" || status === "ending_soon";
  // Inside the row's own link, so a label rather than a second link.
  return (
    <span
      title={`${campaign.name} · ${text}`}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold ${live ? "bg-app-success-tint text-app-success" : "bg-[#E8EAFB] text-[#3D4FB8]"}`}
    >
      <Icon name="clock" size={11} />
      <span className="sr-only">{`${campaign.name}: ${text}`}</span>
      <span className="tabular-nums" aria-hidden>{time || campaign.name}</span>
    </span>
  );
}
