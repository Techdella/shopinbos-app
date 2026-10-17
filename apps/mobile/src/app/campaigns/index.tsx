import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { EmptyState, ErrorState, LoadingBlock, SectionTitle } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, PillButton, T } from "@/components/ui";
import { CountdownPill, StatusBadge, useServerNow, whenText } from "@/components/campaigns";
import { fetchCampaigns, type CampaignSummary } from "@/lib/campaigns";
import { campaignStatus, groupCampaigns, presetSwatch } from "@/lib/campaigns-pure";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Seasonal campaigns (web /home/campaigns): live, coming up, not scheduled yet and ended, each with a countdown that
// ticks (to the end when live, to the start when scheduled) and its discount code. Archived ones stay on the web.

function CampaignCard({ campaign, now }: { campaign: CampaignSummary; now: number }) {
  const t = useT("m_campaigns", "m_ui");
  const swatch = presetSwatch(campaign.preset);
  const code = campaign.discount ? (campaign.discount.automatic ? campaign.discount.name : campaign.discount.code) : null;
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/campaigns/[id]", params: { id: campaign.id } })} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 10, alignSelf: "stretch", borderRadius: 5, overflow: "hidden" }} accessibilityElementsHidden importantForAccessibility="no">
            {swatch.map((colour) => <View key={colour} style={{ flex: 1, backgroundColor: colour, borderWidth: colour.toUpperCase() === "#FFFFFF" ? 0.5 : 0, borderColor: colors.line }} />)}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T weight="extrabold" style={{ fontSize: 16 }} numberOfLines={2}>{campaign.name}</T>
            <T style={{ color: colors.inkSoft, fontSize: 14 }}>
              {campaign.startsAt && campaign.endsAt ? t("dates", { start: whenText(campaign.startsAt, campaign.timezone, now, t), end: whenText(campaign.endsAt, campaign.timezone, now, t) }) : t("timer.noDates")}
            </T>
          </View>
          <StatusBadge status={campaignStatus(campaign, now)} />
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          {campaign.startsAt ? <CountdownPill campaign={campaign} now={now} /> : null}
          {code ? (
            <View style={{ flexDirection: "row", alignItems: "center", minHeight: 32, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.peach }}>
              <T weight="extrabold" style={{ fontSize: 14, color: colors.accentInk, letterSpacing: 0.5 }}>{t("code", { code })}</T>
            </View>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

export default function Campaigns() {
  const t = useT("m_campaigns", "m_ui");
  const list = useLoad(fetchCampaigns);
  const now = useServerNow(list.data?.offset ?? 0);
  const groups = list.data ? groupCampaigns(list.data.campaigns, now) : [];

  return (
    <Screen title={t("title")} sub={t("sub")} refreshing={list.refreshing} onRefresh={() => void list.refresh()}>
      <PillButton title={t("new")} onPress={() => router.push("/campaigns/new")} />

      {list.loading && !list.data ? <LoadingBlock /> : null}
      {list.error && !list.data ? <ErrorState message={list.error} onRetry={() => void list.reload()} /> : null}
      {list.data && !groups.length ? (
        <EmptyState icon="clock" title={t("empty.title")}>{t("empty.body")}</EmptyState>
      ) : null}

      {groups.map(({ group, items }) => (
        <View key={group} style={{ gap: 10 }}>
          <SectionTitle>{t.dynamic(`group.${group}`, group)}</SectionTitle>
          {items.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} now={now} />)}
        </View>
      ))}
    </Screen>
  );
}
