import { useState } from "react";
import { Share, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { naira } from "@shared/onboarding";
import { ErrorState, LinkRow, LoadingBlock, SectionTitle } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Sheet } from "@/components/Sheet";
import { Card, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { CountdownPill, StatusBadge, useServerNow, whenText } from "@/components/campaigns";
import { campaignPreviewLink, fetchCampaign, runCampaignAction, type CampaignAction } from "@/lib/campaigns";
import { campaignActions, campaignStatus, presetSwatch } from "@/lib/campaigns-pure";
import { openShop } from "@/lib/share";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// One seasonal campaign (web /home/campaigns/:id): its countdown, dates and code; pause or resume, end now (after
// asking), see it on the shop through a private preview link and share the code. Name, dates and code change on
// /campaigns/new?id=…; the look and what shows open on the web.

export default function CampaignScreen() {
  const t = useT("m_campaigns", "m_ui");
  const { id } = useLocalSearchParams<{ id: string }>();
  const data = useLoad(() => fetchCampaign(String(id)), String(id));
  const now = useServerNow(data.data?.offset ?? 0);
  const [busy, setBusy] = useState<CampaignAction | "preview" | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [note, setNote] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const campaign = data.data?.campaign;

  if (!campaign) {
    return (
      <Screen title={t("detail.title")}>
        {data.error ? <ErrorState message={data.error} onRetry={() => void data.reload()} /> : <LoadingBlock />}
      </Screen>
    );
  }

  const status = campaignStatus(campaign, now);
  const actions = campaignActions(campaign, now);
  const zone = campaign.timezone || "Africa/Lagos";
  const code = campaign.discount ? (campaign.discount.automatic ? null : campaign.discount.code) : null;
  const swatch = presetSwatch(campaign.preset);

  async function act(action: CampaignAction) {
    setBusy(action);
    setNote(null);
    try {
      await runCampaignAction(campaign!.id, action);
      setConfirmEnd(false);
      setNote({ tone: "success", text: t.dynamic(`detail.done.${action}`) });
      await data.reload();
    } catch (actionError) {
      setConfirmEnd(false);
      setNote({ tone: "error", text: actionError instanceof Error ? actionError.message : t("form.tryAgain") });
    } finally {
      setBusy(null);
    }
  }

  async function preview() {
    setBusy("preview");
    setNote(null);
    try {
      const link = await campaignPreviewLink(campaign!.id);
      await openShop(link.url);
    } catch (previewError) {
      setNote({ tone: "error", text: previewError instanceof Error ? previewError.message : t("form.tryAgain") });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen title={campaign.name} refreshing={data.refreshing} onRefresh={() => void data.refresh()}>
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}

      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", height: 10, borderRadius: 5, overflow: "hidden" }} accessibilityElementsHidden importantForAccessibility="no">
          {swatch.map((colour) => <View key={colour} style={{ flex: 1, backgroundColor: colour }} />)}
        </View>
        <StatusBadge status={status} />
        {campaign.startsAt ? <CountdownPill campaign={campaign} now={now} big /> : null}
        <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>
          {campaign.startsAt && campaign.endsAt ? t("dates", { start: whenText(campaign.startsAt, zone, now, t), end: whenText(campaign.endsAt, zone, now, t) }) : t("detail.noDates")}
        </T>
        {campaign.revenue > 0 ? <T weight="bold" style={{ fontSize: 15 }}>{t("detail.sales", { amount: naira(Math.round(campaign.revenue)) })}</T> : null}
        {status === "paused" ? <T style={{ color: colors.inkSoft, fontSize: 14.5, lineHeight: 20 }}>{t("detail.pausedNote")}</T> : null}
      </Card>

      {status === "draft" ? <PillButton title={t("detail.schedule")} onPress={() => router.push({ pathname: "/campaigns/new", params: { id: campaign.id } })} /> : null}

      {actions.pause || actions.resume || actions.endNow ? (
        <View style={{ flexDirection: "row", gap: 10 }}>
          {actions.pause ? <PillButton title={t("detail.pause")} tone="white" size="md" style={{ flex: 1 }} busy={busy === "pause"} disabled={busy !== null} onPress={() => void act("pause")} /> : null}
          {actions.resume ? <PillButton title={t("detail.resume")} size="md" style={{ flex: 1 }} busy={busy === "resume"} disabled={busy !== null} onPress={() => void act("resume")} /> : null}
          {actions.endNow ? <PillButton title={t("detail.endNow")} tone="white" size="md" style={{ flex: 1 }} disabled={busy !== null} onPress={() => setConfirmEnd(true)} /> : null}
        </View>
      ) : null}

      <SectionTitle>{t("form.discount")}</SectionTitle>
      {campaign.discount ? (
        <Card style={{ gap: 8 }}>
          <T weight="extrabold" style={{ fontSize: 20, letterSpacing: 1 }} selectable>{code ?? campaign.discount.name}</T>
          <T style={{ color: colors.inkSoft, fontSize: 14.5, lineHeight: 20 }}>{campaign.discountAutoToggle ? t("detail.codeAuto") : t("detail.codeOwn")}</T>
          {code && status !== "ended" ? (
            <PillButton title={t("detail.share")} tone="white" size="sm" style={{ alignSelf: "flex-start" }} onPress={() => void Share.share({ message: t("detail.shareMessage", { name: campaign.name, code }) })} />
          ) : null}
        </Card>
      ) : (
        <Card>
          <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>{t("detail.noCode")}</T>
        </Card>
      )}

      <Card style={{ paddingVertical: 2 }}>
        <LinkRow first icon="globe" label={busy === "preview" ? t("detail.opening") : t("detail.preview")} hint={t("detail.previewHint")} onPress={() => void (busy ? null : preview())} />
        {status !== "ended" && status !== "draft" ? <LinkRow icon="clock" label={t("detail.edit")} hint={t("detail.editHint")} onPress={() => router.push({ pathname: "/campaigns/new", params: { id: campaign.id } })} /> : null}
        <LinkRow icon="image" label={t("form.look")} hint={t("form.lookHint")} onPress={() => router.push({ pathname: "/web-only", params: { what: "campaign", id: campaign.id } })} />
      </Card>

      <Sheet visible={confirmEnd} onClose={() => setConfirmEnd(false)} title={t("detail.endTitle", { name: campaign.name })}>
        <T style={{ fontSize: 15, lineHeight: 22, color: colors.inkSoft }}>{t("detail.endBody")}</T>
        <PillButton title={t("detail.endYes")} busy={busy === "end-now"} onPress={() => void act("end-now")} />
        <LinkButton title={t("detail.keep")} onPress={() => setConfirmEnd(false)} />
      </Sheet>
    </Screen>
  );
}
