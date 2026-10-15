import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, FilterChips } from "@/components/app-kit";
import { getT } from "@/lib/i18n/server";
import { listCampaigns } from "@/lib/store-campaigns/server";
import { CAMPAIGN_TABS, inCampaignTab, type CampaignTab } from "@/lib/store-campaigns/status";
import { CAMPAIGN_PRESETS, suggestedPresetDates } from "@/lib/store-campaigns/presets";
import { DEFAULT_CAMPAIGN_TIME_ZONE } from "@/lib/store-campaigns/time";
import { CampaignsManager, type PresetCard } from "./CampaignsManager";

// Marketing > Seasonal campaigns: every campaign with its live status and timer, tabs, row actions, and "Create
// campaign" from a preset (Black Friday, Detty December, Sallah…) or blank.

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("campaigns");
  return { title: t("metaTitle") };
}

const TAB_LABEL: Record<CampaignTab, "tab.all" | "tab.live" | "tab.scheduled" | "tab.drafts" | "tab.ended" | "tab.archived"> = {
  all: "tab.all",
  live: "tab.live",
  scheduled: "tab.scheduled",
  drafts: "tab.drafts",
  ended: "tab.ended",
  archived: "tab.archived",
};

export default async function CampaignsPage({ searchParams }: { searchParams?: Promise<{ tab?: string; create?: string }> }) {
  const params = await searchParams;
  const tab: CampaignTab = (CAMPAIGN_TABS as readonly string[]).includes(params?.tab ?? "") ? (params!.tab as CampaignTab) : "all";
  const user = await requireRole(["seller"], "/login");
  const t = await getT("campaigns");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  const now = new Date();
  const campaigns = store ? await listCampaigns(store.id, now).catch(() => []) : [];
  const presets: PresetCard[] = CAMPAIGN_PRESETS.map((preset) => {
    const dates = suggestedPresetDates(preset.id, DEFAULT_CAMPAIGN_TIME_ZONE, now.getTime());
    return { id: preset.id, swatch: preset.swatch, startsAt: dates ? new Date(dates.startsAt).toISOString() : null, endsAt: dates ? new Date(dates.endsAt).toISOString() : null };
  });

  return (
    <SellerPage user={user} store={storeSummary(store)} title={t("title")} sub={t("sub")}>
      <div className="grid gap-5">
        <FilterChips
          items={CAMPAIGN_TABS.map((key) => ({
            label: t(TAB_LABEL[key]),
            href: key === "all" ? "/home/campaigns" : `/home/campaigns?tab=${key}`,
            count: campaigns.filter((campaign) => inCampaignTab(campaign, key, now.getTime())).length,
            active: key === tab,
          }))}
        />
        <CampaignsManager
          campaigns={campaigns.filter((campaign) => inCampaignTab(campaign, tab, now.getTime()))}
          total={campaigns.length}
          tab={tab}
          presets={presets}
          serverNow={now.toISOString()}
          startCreating={params?.create === "1"}
        />
        <AssistantNote>{t("note")}</AssistantNote>
      </div>
    </SellerPage>
  );
}
