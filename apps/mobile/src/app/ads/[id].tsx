import { useState } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { AdStatusBadge, adMoney, StatTiles, useModeLabel } from "@/components/ads";
import { ErrorState, LoadingBlock, SectionTitle } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Sheet } from "@/components/Sheet";
import { Card, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { campaignAction, fetchAds } from "@/lib/ads";
import { campaignActions, campaignTotal, costPerOrder, groupDigits, type CampaignAction } from "@/lib/ads-pure";
import { friendlyDay } from "@/lib/friendly";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// One ad campaign (a card on web /home/ads): its numbers (spent, seen, reached, taps, orders), the words in its
// ads, the team's progress for one the Shopinbos team runs, and launch, pause, resume, refresh, end or delete.
// Launching, ending and deleting ask first in the app's own sheet.

type Asked = "launch" | "end" | "delete";

export default function AdCampaign() {
  const t = useT("m_ads", "ads", "m_ui");
  const modeLabel = useModeLabel();
  const { id } = useLocalSearchParams<{ id: string }>();
  const data = useLoad(fetchAds);
  const [busy, setBusy] = useState<CampaignAction | null>(null);
  const [asking, setAsking] = useState<Asked | null>(null);
  const [note, setNote] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const campaign = data.data?.campaigns.find((row) => row.id === String(id));

  if (!campaign) {
    return (
      <Screen title={t("title")}>
        {data.error ? <ErrorState message={data.error} onRetry={() => void data.reload()} /> : data.data ? <Notice tone="info">{t("gone")}</Notice> : <LoadingBlock />}
      </Screen>
    );
  }

  const actions = campaignActions(campaign);
  const perOrder = costPerOrder(campaign.stats);
  const money = (value: number) => adMoney(value, campaign.currency);

  async function act(action: CampaignAction) {
    setBusy(action);
    setNote(null);
    try {
      await campaignAction(campaign!.id, action);
      setAsking(null);
      if (action === "delete") {
        router.back();
        return;
      }
      setNote({ tone: "success", text: t.dynamic(`done.${action}`) });
      await data.reload();
    } catch (actionError) {
      setAsking(null);
      setNote({ tone: "error", text: actionError instanceof Error ? actionError.message : t("notDone") });
    } finally {
      setBusy(null);
    }
  }

  const askWords: Record<Asked, { title: string; body: string; yes: string }> = {
    launch: { title: t("ask.launchTitle"), body: t("ask.launchBody", { total: money(campaignTotal(campaign.dailyBudget, campaign.days)) }), yes: t("c.launch") },
    end: { title: t("ask.endTitle"), body: t("c.confirmEnd"), yes: t("ask.endYes") },
    delete: { title: t("ask.deleteTitle"), body: t("ask.deleteBody"), yes: t("ask.deleteYes") },
  };

  return (
    <Screen title={campaign.name} refreshing={data.refreshing} onRefresh={() => void data.refresh()}>
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      <Card style={{ gap: 10 }}>
        {campaign.image ? <Image source={{ uri: campaign.image }} style={{ width: "100%", aspectRatio: 1.6, borderRadius: 16 }} contentFit="cover" /> : null}
        <AdStatusBadge status={campaign.status} />
        <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>
          {[modeLabel(campaign), t("c.productsAds", { products: campaign.products, ads: campaign.ads })].join(" · ")}
        </T>
        <T style={{ fontSize: 15, lineHeight: 21 }}>
          {[t("perDay", { amount: money(campaign.dailyBudget) }), t("days", { count: campaign.days }), campaign.startAt ? t("dates", { start: friendlyDay(campaign.startAt, new Date(), t), end: friendlyDay(campaign.endAt, new Date(), t) }) : null].filter(Boolean).join(" · ")}
        </T>
        {campaign.objective ? <T style={{ color: colors.inkSoft, fontSize: 14.5 }}>{t("goalIs", { goal: t.dynamic(`c.obj.${campaign.objective}`, campaign.objective) })}</T> : null}
        {campaign.request ? <T weight="bold" style={{ fontSize: 15 }}>{t("c.teamStatus", { status: t.dynamic(`r.status.${campaign.request.status}`, campaign.request.status) })}</T> : null}
        {campaign.syncError ? <Notice>{t("c.metaSaid", { message: campaign.syncError })}</Notice> : null}
      </Card>

      {actions.includes("launch") ? <PillButton title={t("c.launch")} busy={busy === "launch"} disabled={busy !== null} onPress={() => setAsking("launch")} /> : null}
      {actions.includes("pause") || actions.includes("resume") || actions.includes("sync") ? (
        <View style={{ flexDirection: "row", gap: 10 }}>
          {actions.includes("pause") ? <PillButton title={t("c.pause")} tone="white" size="md" style={{ flex: 1 }} busy={busy === "pause"} disabled={busy !== null} onPress={() => void act("pause")} /> : null}
          {actions.includes("resume") ? <PillButton title={t("c.resume")} size="md" style={{ flex: 1 }} busy={busy === "resume"} disabled={busy !== null} onPress={() => void act("resume")} /> : null}
          {actions.includes("sync") ? <PillButton title={t("refresh")} tone="white" size="md" style={{ flex: 1 }} busy={busy === "sync"} disabled={busy !== null} onPress={() => void act("sync")} /> : null}
        </View>
      ) : null}

      <SectionTitle>{t("results")}</SectionTitle>
      <StatTiles
        items={[
          { label: t("c.stat.spent"), value: money(campaign.stats.spend) },
          { label: t("c.stat.seen"), value: groupDigits(campaign.stats.impressions) },
          { label: t("c.stat.reach"), value: groupDigits(campaign.stats.reach) },
          { label: t("stat.taps"), value: groupDigits(campaign.stats.clicks) },
          { label: t("stat.orders"), value: String(campaign.stats.orders) },
          { label: t("stat.perOrder"), value: perOrder ? money(perOrder) : "–" },
        ]}
      />
      {campaign.stats.revenue > 0 ? <T weight="bold" style={{ fontSize: 15, color: colors.success }}>{t("sold", { amount: money(campaign.stats.revenue) })}</T> : null}
      {campaign.lastSyncAt ? <T style={{ color: colors.inkSoft, fontSize: 13.5 }}>{t("updated", { day: friendlyDay(campaign.lastSyncAt, new Date(), t) })}</T> : null}

      {campaign.words.length ? (
        <>
          <SectionTitle>{t("c.ads")}</SectionTitle>
          {campaign.words.map((words, index) => (
            <Card key={index} style={{ gap: 4 }}>
              <T weight="extrabold" style={{ fontSize: 15 }}>{words.headline}</T>
              <T style={{ fontSize: 15, lineHeight: 22 }} selectable>{words.primaryText}</T>
            </Card>
          ))}
        </>
      ) : null}

      {actions.includes("end") ? <LinkButton title={t("end")} color={colors.inkSoft} onPress={() => setAsking("end")} /> : null}
      {actions.includes("delete") ? <LinkButton title={t("c.delete")} color={colors.danger} onPress={() => setAsking("delete")} /> : null}

      <Sheet visible={asking !== null} onClose={() => setAsking(null)} title={asking ? askWords[asking].title : ""}>
        {asking ? (
          <>
            <T style={{ fontSize: 15, lineHeight: 22, color: colors.inkSoft }}>{askWords[asking].body}</T>
            {busy === "launch" ? <Notice tone="info">{t("c.launching")}</Notice> : null}
            <PillButton title={askWords[asking].yes} busy={busy === asking} onPress={() => void act(asking)} />
            <LinkButton title={t("keep")} onPress={() => setAsking(null)} />
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
