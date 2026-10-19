import { useState } from "react";
import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { naira } from "@shared/onboarding";
import { AdStatusBadge, adMoney, StatTiles, useModeLabel, usePlatformName } from "@/components/ads";
import { AppIcon } from "@/components/icons";
import { EmptyState, ErrorState, LoadingBlock, SectionTitle } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Sheet } from "@/components/Sheet";
import { Card, Chip, Label, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { chooseMeta, disconnectMeta, fetchAds, fetchMetaChoices, setBoostStatus, type BoostRow, type MetaChoice } from "@/lib/ads";
import { costPerOrder, groupDigits, type CampaignRow, type MetaStatus } from "@/lib/ads-pure";
import { friendlyDay } from "@/lib/friendly";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Ads (web /home/ads): start a campaign, the Meta ads connection (pick the ad account and Page here; signing in to
// Facebook opens the web), requests to the Shopinbos ads team, every campaign with its numbers, and the older
// "boost it yourself" ads with their switches. Making a boost ad stays on the web.

function CampaignCard({ campaign }: { campaign: CampaignRow }) {
  const t = useT("m_ads", "ads", "m_ui");
  const modeLabel = useModeLabel();
  const perOrder = costPerOrder(campaign.stats);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={campaign.name} onPress={() => router.push({ pathname: "/ads/[id]", params: { id: campaign.id } })} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          {campaign.image ? (
            <Image source={{ uri: campaign.image }} style={{ width: 56, height: 56, borderRadius: 14 }} contentFit="cover" />
          ) : (
            <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
              <AppIcon name="megaphone" size={22} color={colors.inkSoft} />
            </View>
          )}
          <View style={{ flex: 1, gap: 4 }}>
            <T weight="extrabold" style={{ fontSize: 16 }} numberOfLines={2}>{campaign.name}</T>
            <AdStatusBadge status={campaign.status} />
          </View>
          <AppIcon name="chevron" size={18} color={colors.inkSoft} />
        </View>
        <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>
          {[modeLabel(campaign), t("c.productsAds", { products: campaign.products, ads: campaign.ads }), t("perDay", { amount: adMoney(campaign.dailyBudget, campaign.currency) })].join(" · ")}
        </T>
        {campaign.request ? <T weight="bold" style={{ fontSize: 14 }}>{t("c.teamStatus", { status: t.dynamic(`r.status.${campaign.request.status}`, campaign.request.status) })}</T> : null}
        <StatTiles
          items={[
            { label: t("c.stat.spent"), value: adMoney(campaign.stats.spend, campaign.currency) },
            { label: t("c.stat.reach"), value: groupDigits(campaign.stats.reach) },
            { label: t("stat.taps"), value: groupDigits(campaign.stats.clicks) },
            { label: t("stat.orders"), value: `${campaign.stats.orders}${perOrder ? ` · ${adMoney(perOrder, campaign.currency)}` : ""}` },
          ]}
        />
      </Card>
    </Pressable>
  );
}

function BoostCard({ ad, onChanged, onNote }: { ad: BoostRow; onChanged: () => Promise<void>; onNote: (note: { tone: "success" | "error"; text: string }) => void }) {
  const t = useT("m_ads", "ads", "m_ui");
  const platformName = usePlatformName();
  const [busy, setBusy] = useState<string | null>(null);

  async function change(status: "running" | "paused" | "ended") {
    setBusy(status);
    try {
      await setBoostStatus(ad.id, status);
      await onChanged();
    } catch (changeError) {
      onNote({ tone: "error", text: changeError instanceof Error ? changeError.message : t("notDone") });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        {ad.image ? <Image source={{ uri: ad.image }} style={{ width: 48, height: 48, borderRadius: 12 }} contentFit="cover" /> : null}
        <View style={{ flex: 1, gap: 4 }}>
          <T weight="extrabold" style={{ fontSize: 15 }} numberOfLines={2}>{ad.productName ?? ad.headline}</T>
          <AdStatusBadge status={ad.status} />
        </View>
      </View>
      <T style={{ color: colors.inkSoft, fontSize: 14 }}>
        {[platformName(ad.platform), ad.platform !== "whatsapp_status" ? t("perDay", { amount: naira(ad.dailyBudget) }) : null, ad.status === "running" ? t("dayOf", { day: ad.day + 1, days: ad.days }) : null].filter(Boolean).join(" · ")}
      </T>
      <T style={{ fontSize: 14 }}>
        {[`${t("stat.taps")}: ${groupDigits(ad.stats.clicks)}`, `${t("stat.orders")}: ${ad.stats.orders}`, ad.stats.spend ? `${t("stat.spent")}: ${naira(ad.stats.spend)}` : null].filter(Boolean).join(" · ")}
      </T>
      {ad.status !== "ended" ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {ad.status === "draft" ? <PillButton title={t("started")} size="sm" busy={busy === "running"} disabled={busy !== null} onPress={() => void change("running")} /> : null}
          {ad.status === "running" ? <PillButton title={t("pausedIt")} size="sm" tone="white" busy={busy === "paused"} disabled={busy !== null} onPress={() => void change("paused")} /> : null}
          {ad.status === "paused" ? <PillButton title={t("runningAgain")} size="sm" busy={busy === "running"} disabled={busy !== null} onPress={() => void change("running")} /> : null}
          {ad.status === "running" || ad.status === "paused" ? <PillButton title={t("end")} size="sm" tone="white" busy={busy === "ended"} disabled={busy !== null} onPress={() => void change("ended")} /> : null}
        </View>
      ) : null}
    </Card>
  );
}

function MetaCard({ meta, onChanged }: { meta: MetaStatus; onChanged: () => Promise<void> }) {
  const t = useT("m_ads", "ads", "m_ui");
  const [picking, setPicking] = useState(false);
  const [choices, setChoices] = useState<{ accounts: MetaChoice[]; pages: MetaChoice[] } | null>(null);
  const [accountId, setAccountId] = useState("");
  const [pageId, setPageId] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function openPicker() {
    setPicking(true);
    setProblem(null);
    if (choices) return;
    try {
      const loaded = await fetchMetaChoices();
      setChoices(loaded.choices);
      setAccountId(loaded.choices.accounts.find((account) => account.id === meta.accountId)?.id ?? loaded.choices.accounts[0]?.id ?? "");
      setPageId(loaded.choices.pages[0]?.id ?? "");
    } catch (loadError) {
      setProblem(loadError instanceof Error ? loadError.message : t("m.loadFailed"));
    }
  }

  async function save() {
    setBusy(true);
    setProblem(null);
    try {
      await chooseMeta(accountId, pageId);
      setPicking(false);
      await onChanged();
    } catch (saveError) {
      setProblem(saveError instanceof Error ? saveError.message : t("m.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    await disconnectMeta().catch(() => null);
    setBusy(false);
    setConfirmOff(false);
    await onChanged();
  }

  const line = !meta.configured
    ? t("m.notReady")
    : meta.status === "connected"
      ? t("m.connected", { account: meta.accountName ?? meta.accountId ?? "", page: meta.pageName ?? "" })
      : meta.status === "reauth"
        ? t("m.reauth")
        : meta.status === "needs_account"
          ? t("m.pick")
          : t("m.off");

  return (
    <Card style={{ gap: 8 }}>
      <T weight="extrabold" style={{ fontSize: 16 }}>{t("m.title")}</T>
      <T style={{ color: colors.inkSoft, fontSize: 14.5, lineHeight: 21 }}>{line}</T>
      {meta.configured && (meta.status === "off" || meta.status === "reauth") ? (
        <>
          <PillButton title={meta.status === "reauth" ? t("m.reconnect") : t("m.connect")} size="sm" style={{ alignSelf: "flex-start" }} onPress={() => void openWeb("/home/ads")} />
          <T style={{ color: colors.inkSoft, fontSize: 13.5, lineHeight: 19 }}>{t("meta.webHint")}</T>
        </>
      ) : null}
      {meta.configured && (meta.status === "connected" || meta.status === "needs_account") ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <PillButton title={meta.status === "needs_account" ? t("m.use") : t("m.change")} size="sm" tone={meta.status === "needs_account" ? "ink" : "white"} onPress={() => void openPicker()} />
          <PillButton title={t("m.disconnect")} size="sm" tone="white" onPress={() => setConfirmOff(true)} />
        </View>
      ) : null}

      <Sheet visible={picking} onClose={() => setPicking(false)} title={t("meta.pickTitle")}>
        {problem ? <Notice>{problem}</Notice> : null}
        {!choices && !problem ? <LoadingBlock label={t("m.loading")} /> : null}
        {choices ? (
          <>
            {choices.accounts.length === 0 ? <Notice tone="info">{t("m.noAccounts")}</Notice> : null}
            {choices.pages.length === 0 ? <Notice tone="info">{t("m.noPages")}</Notice> : null}
            <Label>{t("m.account")}</Label>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {choices.accounts.map((account) => <Chip key={account.id} label={account.currency ? `${account.name} (${account.currency})` : account.name} on={accountId === account.id} onPress={() => setAccountId(account.id)} />)}
            </View>
            <Label>{t("m.page")}</Label>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {choices.pages.map((page) => <Chip key={page.id} label={page.name} on={pageId === page.id} onPress={() => setPageId(page.id)} />)}
            </View>
            <PillButton title={t("m.use")} busy={busy} disabled={!accountId || !pageId} onPress={() => void save()} />
          </>
        ) : null}
      </Sheet>

      <Sheet visible={confirmOff} onClose={() => setConfirmOff(false)} title={t("m.disconnect")}>
        <T style={{ fontSize: 15, lineHeight: 22, color: colors.inkSoft }}>{t("m.confirmDisconnect")}</T>
        <PillButton title={t("meta.disconnectYes")} busy={busy} onPress={() => void disconnect()} />
        <LinkButton title={t("keep")} onPress={() => setConfirmOff(false)} />
      </Sheet>
    </Card>
  );
}

export default function Ads() {
  const t = useT("m_ads", "ads", "m_ui");
  const params = useLocalSearchParams<{ done?: string }>();
  const data = useLoad(fetchAds);
  const [note, setNote] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(() =>
    params.done === "launched" ? { tone: "success", text: t("c.launched") } : params.done === "draft" ? { tone: "info", text: t("c.saved") } : params.done === "request" ? { tone: "info", text: t("requestSent") } : null,
  );
  const overview = data.data;
  const openRequests = overview ? overview.requests.filter((request) => request.status !== "done" && request.status !== "cancelled") : [];

  return (
    <Screen title={t("title")} sub={t("sub")} refreshing={data.refreshing} onRefresh={() => void data.refresh()}>
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      <Card style={{ gap: 10, backgroundColor: colors.ink }}>
        <T weight="extrabold" style={{ fontSize: 18, color: "#FFFFFF" }}>{t("c.startTitle")}</T>
        <T style={{ fontSize: 14.5, lineHeight: 21, color: "rgba(255,255,255,0.8)" }}>{t("c.startHint")}</T>
        <PillButton title={t("c.start")} tone="white" size="md" onPress={() => router.push("/ads/new")} />
      </Card>

      {data.loading && !overview ? <LoadingBlock /> : null}
      {data.error && !overview ? <ErrorState message={data.error} onRetry={() => void data.reload()} /> : null}
      {overview ? (
        <>
          <MetaCard meta={overview.meta} onChanged={data.reload} />

          {openRequests.length ? (
            <Card style={{ gap: 8 }}>
              <T weight="extrabold" style={{ fontSize: 16 }}>{t("r.title")}</T>
              {openRequests.map((request) => (
                <View key={request.id} style={{ backgroundColor: colors.canvas, borderRadius: 14, padding: 10, gap: 4 }}>
                  <T weight="bold" style={{ fontSize: 14.5 }}>{[request.platform === "tiktok" ? "TikTok" : "Facebook & Instagram", request.businessName, friendlyDay(request.createdAt, new Date(), t)].join(" · ")}</T>
                  <T style={{ fontSize: 14, color: request.paid ? colors.success : "#8A5A00" }}>{t.dynamic(`r.status.${request.status}`, request.status)}</T>
                </View>
              ))}
              <T style={{ color: colors.inkSoft, fontSize: 13.5, lineHeight: 19 }}>{t("r.hint")}</T>
            </Card>
          ) : null}

          <SectionTitle>{t("campaigns")}</SectionTitle>
          {overview.campaigns.length ? (
            overview.campaigns.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} />)
          ) : (
            <EmptyState icon="megaphone" title={t("c.none")}>{t("noneBody")}</EmptyState>
          )}

          {overview.boosts.length ? (
            <>
              <SectionTitle>{t("c.boostYourself")}</SectionTitle>
              <T style={{ color: colors.inkSoft, fontSize: 14.5, lineHeight: 21 }}>{t("c.boostHint")}</T>
              {overview.boosts.map((ad) => <BoostCard key={ad.id} ad={ad} onChanged={data.reload} onNote={setNote} />)}
            </>
          ) : null}
          <LinkButton title={t("boostWeb")} color={colors.inkSoft} onPress={() => void openWeb("/home/ads")} />
        </>
      ) : null}
    </Screen>
  );
}
