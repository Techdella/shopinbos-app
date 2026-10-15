"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useT } from "@/components/i18n/I18nProvider";
import { Icon } from "@/components/ui/Icon";
import type { CampaignSummary } from "@/lib/store-campaigns/types";
import { TimerText, useServerTimeSeed } from "./CampaignTimer";

// In the store builder's top bar while a seasonal campaign is live: "Black Friday · Ends in 2d 04:13:22". The builder
// edits the store's own design; the campaign's look sits on top of it on the live store until it ends.

export function LiveCampaignChip() {
  const t = useT("campaigns");
  const [live, setLive] = useState<{ campaign: CampaignSummary; serverNow: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/app/campaigns?status=live")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { data?: { campaigns?: CampaignSummary[]; serverNow?: string } } | null) => {
        const campaign = json?.data?.campaigns?.find((entry) => entry.status === "live" || entry.status === "ending_soon");
        if (!cancelled && campaign && json?.data?.serverNow) setLive({ campaign, serverNow: json.data.serverNow });
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, []);
  useServerTimeSeed(live?.serverNow);
  if (!live) return null;
  const { campaign } = live;
  return (
    <Link
      href={`/home/campaigns/${campaign.id}`}
      title={t("builder.liveHint")}
      className="hidden min-w-0 shrink items-center gap-1.5 rounded-full bg-[#F1ECF7] px-2.5 py-1 text-[12px] font-bold text-[#6B4F8A] no-underline hover:brightness-95 lg:inline-flex"
    >
      <Icon name="clock" size={12} />
      <span className="max-w-[140px] truncate">{t("builder.liveChip", { name: campaign.name })}</span>
      <span aria-hidden>·</span>
      <TimerText timing={campaign} timeZone={campaign.timezone} />
    </Link>
  );
}
