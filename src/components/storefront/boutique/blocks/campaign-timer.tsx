"use client";

import type React from "react";
import { useT } from "@/components/i18n/I18nProvider";
import { CampaignCountdown, type CountdownLook } from "../../campaign/CampaignCountdown";
import { useSectionCampaign } from "../../campaign/CampaignContext";
import { toMs } from "@/lib/store-campaigns/status";
import { choice, str } from "./block-logic";
import type { BlockContext } from "./shared";

// The countdown inside the campaign sections (countdown banner, featured deal). Inside a running campaign it counts
// to the campaign's end; with "A set time", or outside a campaign, to the time the seller picked. In the builder,
// without a campaign, it shows dashes and a hint.

export function sectionTimerTarget(ctx: BlockContext, campaignEnd: string | null | undefined) {
  if (str(ctx.settings.timer) === "custom") return toMs(str(ctx.settings.endsAt));
  return toMs(campaignEnd ?? null);
}

export function SectionCountdown({ ctx, look, className, style }: { ctx: BlockContext; look: CountdownLook; className?: string; style?: React.CSSProperties }) {
  const t = useT("campaigns");
  const campaign = useSectionCampaign();
  const target = sectionTimerTarget(ctx, campaign?.endsAt);
  const expiry = choice(ctx.settings.expiry, ["hide", "message"] as const, "hide");
  if (target === null) {
    return ctx.editor ? <span className={className} style={{ ...style, opacity: 0.75, fontSize: 13 }}>{t("section.timerHint")}</span> : null;
  }
  return (
    <span className={className} style={style}>
      <CampaignCountdown target={target} timeZone={campaign?.timezone} look={look} expiry={expiry} expiredText={str(ctx.copy.endedText)} />
    </span>
  );
}
