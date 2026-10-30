import { useState } from "react";
import { Alert, View } from "react-native";
import { router } from "expo-router";
import { BLAST_CHANNELS, FOLLOWER_BLAST_KINDS, checkBlast, fillBlastText, whatsappNewsText, type BlastChannel, type FollowerBlastKind } from "@shared/follower-blasts";
import { formatDate, formatNumber } from "@shared/i18n";
import { Badge, ErrorState, LoadingBlock, SectionTitle } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Chip, Field, Label, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { draftBlast, fetchFollowers, sendBlast, setUpWhatsAppNews } from "@/lib/followers";
import { useFeature } from "@/lib/features";
import { useLocale, useT } from "@/lib/i18n";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// Notify my followers (pilot feature "notify_followers"; shared/follower-blasts.ts; web /home/marketing/followers):
// how many follow the shop and who each channel reaches, "2 of 3 left this week", a short composer (kind, optional
// product, Rex's draft, preview) and what was sent before. Push starts when Shopinbos Plug launches.

const KIND_LABEL = { drop: "kind.drop", preorder: "kind.preorder", live: "kind.live" } as const;
const CHANNEL_LABEL = { whatsapp: "channel.whatsapp", email: "channel.email", push: "channel.push" } as const;
const STATUS = {
  queued: { label: "status.queued", bg: colors.canvas, fg: colors.inkSoft },
  sending: { label: "status.sending", bg: colors.mintTint, fg: colors.forest },
  sent: { label: "status.sent", bg: colors.successTint, fg: colors.success },
  failed: { label: "status.failed", bg: colors.dangerTint, fg: colors.danger },
} as const;

export default function Followers() {
  const on = useFeature("notify_followers");
  const t = useT("followers", "common");
  const locale = useLocale();
  const data = useLoad(fetchFollowers);
  const [kind, setKind] = useState<FollowerBlastKind>("drop");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [productId, setProductId] = useState<string | null>(null);
  const [showProducts, setShowProducts] = useState(false);
  const [channels, setChannels] = useState<BlastChannel[]>(["whatsapp", "email"]);
  const [busy, setBusy] = useState<"send" | "rex" | "whatsapp" | null>(null);
  const [note, setNote] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const overview = data.data;

  if (!on) {
    return (
      <Screen title={t("title")}>
        <Notice tone="info">{t("noFollowers")}</Notice>
      </Screen>
    );
  }

  const ready: Record<BlastChannel, boolean> = { whatsapp: Boolean(overview?.channels.whatsapp.ready), email: Boolean(overview?.channels.email.ready), push: Boolean(overview?.channels.push.ready) };
  const reachable = overview ? (overview.reachBy[[...channels].sort().join("+")] ?? 0) : 0;
  const product = overview?.products.find((p) => p.id === productId) ?? null;
  const checked = checkBlast({ kind, title, body, productId, link: null });
  const sample = { first_name: t("preview.sample"), store_name: overview?.storeName ?? "", product_name: product?.name ?? "" };
  const capped = (overview?.allowance.left ?? 0) <= 0;

  const problemText = (problem: string) =>
    problem === "title_long" ? t("error.title_long", { max: overview?.limits.title ?? 60 }) : problem === "body_long" ? t("error.body_long", { max: overview?.limits.body ?? 300 }) : t.dynamic(`error.${problem}`, problem);

  async function draft() {
    setBusy("rex");
    setNote(null);
    try {
      const result = await draftBlast({ kind, productId, language: locale });
      setTitle(result.title);
      setBody(result.body);
      if (!result.ai) setNote({ tone: "info", text: t("rex.fallback") });
    } catch {
      setNote({ tone: "error", text: t("rex.failed") });
    } finally {
      setBusy(null);
    }
  }

  async function setUpWhatsApp() {
    setBusy("whatsapp");
    setNote(null);
    try {
      await setUpWhatsAppNews();
      await data.reload();
    } catch (error) {
      setNote({ tone: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  }

  async function doSend() {
    setBusy("send");
    setNote(null);
    try {
      await sendBlast({ kind, title: checked.input.title, body: checked.input.body, productId, link: null, channels });
      setTitle("");
      setBody("");
      setProductId(null);
      setNote({ tone: "success", text: t("sent") });
      await data.reload();
    } catch (error) {
      setNote({ tone: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  }

  function send() {
    if (!overview) return;
    if (checked.problems.length) return setNote({ tone: "error", text: problemText(checked.problems[0]) });
    if (!channels.length) return setNote({ tone: "error", text: t("error.channels") });
    Alert.alert(t("compose.title"), t("confirm", { count: reachable, left: Math.max(0, overview.allowance.left - 1), cap: overview.allowance.cap }), [
      { text: t("cancel"), style: "cancel" },
      { text: t("send"), onPress: () => void doSend() },
    ]);
  }

  const toggle = (channel: BlastChannel) => setChannels((list) => (list.includes(channel) ? list.filter((c) => c !== channel) : [...list, channel]));

  return (
    <Screen title={t("title")} sub={t("sub")} refreshing={data.refreshing} onRefresh={() => void data.refresh()}>
      {data.loading && !overview ? <LoadingBlock /> : null}
      {data.error && !overview ? <ErrorState message={t("error.load")} onRetry={() => void data.reload()} /> : null}
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      {overview ? (
        <>
          <Card style={{ gap: 6 }}>
            <T weight="extrabold" style={{ fontSize: 28 }}>{formatNumber(overview.followers, locale)}</T>
            <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("stat.followersHint")}</T>
            <T style={{ fontSize: 14 }}>
              {t("stat.whatsapp")}: <T weight="bold" style={{ fontSize: 14 }}>{formatNumber(overview.audience.whatsapp, locale)}</T> · {t("stat.email")}: <T weight="bold" style={{ fontSize: 14 }}>{formatNumber(overview.audience.email, locale)}</T>
            </T>
            <T style={{ color: colors.inkSoft, fontSize: 13 }}>{t("pushSoon")}</T>
          </Card>

          <SectionTitle>{t("compose.title")}</SectionTitle>
          <T weight="bold" style={{ fontSize: 15, color: capped ? colors.danger : colors.forest }}>
            {capped && overview.allowance.nextFreeAt ? t("capReached", { cap: overview.allowance.cap, day: formatDate(overview.allowance.nextFreeAt, locale, { weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) }) : t("left", { left: overview.allowance.left, cap: overview.allowance.cap })}
          </T>
          {overview.followers === 0 ? <Notice tone="info">{t("noFollowers")}</Notice> : null}

          <Card style={{ gap: 8 }}>
            <Label>{t("compose.kind")}</Label>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {FOLLOWER_BLAST_KINDS.map((option) => <Chip key={option} label={t(KIND_LABEL[option])} on={kind === option} onPress={() => setKind(option)} />)}
            </View>

            <Label>{t("field.product")}</Label>
            <Chip label={product?.name ?? t("field.noProduct")} on={Boolean(product)} onPress={() => setShowProducts((open) => !open)} />
            {showProducts ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Chip label={t("field.noProduct")} on={!productId} onPress={() => { setProductId(null); setShowProducts(false); }} />
                {overview.products.slice(0, 40).map((p) => <Chip key={p.id} label={p.name} on={productId === p.id} onPress={() => { setProductId(p.id); setShowProducts(false); }} />)}
              </View>
            ) : null}

            <PillButton tone="white" size="md" title={busy === "rex" ? t("rex.drafting") : t("rex.draft")} icon="sparkle" busy={busy === "rex"} disabled={busy !== null} onPress={() => void draft()} />

            <Label>{t("field.title")}</Label>
            <Field value={title} onChangeText={setTitle} maxLength={overview.limits.title} placeholder={t("field.titlePlaceholder")} />
            <T style={{ color: colors.inkSoft, fontSize: 12 }}>{t("chars", { used: title.length, max: overview.limits.title })}</T>
            <Label>{t("field.message")}</Label>
            <Field value={body} onChangeText={setBody} maxLength={overview.limits.body} placeholder={t("field.messagePlaceholder")} multiline style={{ minHeight: 110, textAlignVertical: "top", paddingTop: 12 }} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <LinkButton title={t("insertName")} onPress={() => setBody((text) => `${text}${text && !text.endsWith(" ") ? " " : ""}{{first_name}}`.slice(0, overview.limits.body))} />
              <T style={{ color: colors.inkSoft, fontSize: 12 }}>{t("chars", { used: body.length, max: overview.limits.body })}</T>
            </View>

            <Label>{t("channels")}</Label>
            {BLAST_CHANNELS.map((channel) => (
              <View key={channel} style={{ gap: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Chip label={t(CHANNEL_LABEL[channel])} on={channels.includes(channel) && ready[channel]} disabled={!ready[channel]} onPress={() => toggle(channel)} />
                  <T style={{ color: colors.inkSoft, fontSize: 13, flex: 1 }}>{channel === "push" ? t("pushSoon") : t("channel.count", { count: ready[channel] ? overview.audience[channel] : 0 })}</T>
                </View>
                {channel === "whatsapp" && overview.channels.whatsapp.setup === "connect" ? (
                  <LinkButton title={t("whatsapp.connectButton")} onPress={() => router.push("/channels")} />
                ) : null}
                {channel === "whatsapp" && overview.channels.whatsapp.setup === "template_missing" ? (
                  <>
                    <T style={{ color: colors.inkSoft, fontSize: 13 }}>{t("whatsapp.missing")}</T>
                    <PillButton tone="white" size="sm" title={busy === "whatsapp" ? t("whatsapp.settingUp") : t("whatsapp.setUp")} busy={busy === "whatsapp"} disabled={busy !== null} onPress={() => void setUpWhatsApp()} />
                  </>
                ) : null}
                {channel === "whatsapp" && overview.channels.whatsapp.setup === "template_pending" ? <T style={{ color: colors.inkSoft, fontSize: 13 }}>{t("whatsapp.pending")}</T> : null}
                {channel === "whatsapp" && overview.channels.whatsapp.setup === "template_rejected" ? <T style={{ color: colors.inkSoft, fontSize: 13 }}>{t("whatsapp.rejected")}</T> : null}
                {channel === "whatsapp" ? <T style={{ color: colors.inkSoft, fontSize: 12.5 }}>{t("whatsapp.optInNote")}</T> : null}
                {channel === "email" && !ready.email && overview.channels.email.howTo ? <T style={{ color: colors.inkSoft, fontSize: 12.5 }}>{t("email.off", { reason: overview.channels.email.howTo })}</T> : null}
              </View>
            ))}
          </Card>

          <SectionTitle>{t("preview")}</SectionTitle>
          <Card style={{ gap: 6, backgroundColor: "#EFEAE2" }}>
            <T style={{ fontSize: 11, color: colors.inkSoft }}>{t("preview.whatsapp").toUpperCase()}</T>
            <View style={{ backgroundColor: "#FFFFFF", borderRadius: 12, padding: 10 }}>
              <T style={{ fontSize: 14, color: "#111111" }}>
                {`Hi ${sample.first_name}, news from ${overview.storeName} for you: ${whatsappNewsText({ title: title || t("field.titlePlaceholder"), body: body || t("field.messagePlaceholder") }, sample)}. Take a look here: ${product?.url || overview.storeLink} and reply if you have a question.`}
              </T>
            </View>
          </Card>
          <Card style={{ gap: 4 }}>
            <T style={{ fontSize: 11, color: colors.inkSoft }}>{t("preview.email").toUpperCase()}</T>
            <T weight="extrabold" style={{ fontSize: 17 }}>{fillBlastText(title || t("field.titlePlaceholder"), sample)}</T>
            <T style={{ fontSize: 14 }}>{fillBlastText(body || t("field.messagePlaceholder"), sample)}</T>
          </Card>

          <PillButton tone="accent" title={busy === "send" ? t("sending") : t("send")} icon="send" busy={busy === "send"} disabled={busy !== null || capped || reachable === 0} onPress={send} />
          <T style={{ color: colors.inkSoft, fontSize: 13, textAlign: "center" }}>{reachable === 0 && overview.followers > 0 ? t("nobodyReachable") : t("reach", { count: reachable })}</T>
          <T style={{ color: colors.inkSoft, fontSize: 12.5, textAlign: "center" }}>{t("capNote", { cap: overview.allowance.cap })}</T>

          <SectionTitle>{t("history")}</SectionTitle>
          {overview.blasts.length ? (
            overview.blasts.map((blast) => {
              const status = STATUS[blast.status as keyof typeof STATUS] ?? STATUS.queued;
              return (
                <Card key={blast.id} style={{ gap: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <T weight="extrabold" style={{ flex: 1, fontSize: 15 }} numberOfLines={1}>{blast.title}</T>
                    <Badge label={t(status.label)} bg={status.bg} fg={status.fg} />
                  </View>
                  <T style={{ color: colors.inkSoft, fontSize: 13 }}>
                    {[t.dynamic(`kind.${blast.kind}`, blast.kind), blast.channels.map((c) => t.dynamic(`channel.${c}`, c)).join(", "), formatDate(blast.sentAt ?? blast.createdAt, locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })].join(" · ")}
                  </T>
                  <T style={{ fontSize: 14 }}>{t("history.counts", { sent: blast.sentCount, failed: blast.failedCount, audience: blast.audienceCount })}</T>
                </Card>
              );
            })
          ) : (
            <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("history.empty")}</T>
          )}
        </>
      ) : null}
    </Screen>
  );
}
