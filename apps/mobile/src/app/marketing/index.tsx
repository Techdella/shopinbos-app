import { useState } from "react";
import { Share, View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { Badge, ErrorState, LinkRow, LoadingBlock, SectionTitle } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Chip, Field, Label, LinkButton, Notice, PillButton, Segmented, T } from "@/components/ui";
import { ChoiceRow } from "@/components/Sheet";
import { friendlyDay } from "@/lib/friendly";
import { shareShop } from "@/lib/share";
import { createDiscount, discountLabel, fetchMarketing, suggestCode, type CampaignRow, type QuickDiscount } from "@/lib/marketing";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Marketing (web /home/marketing and /home/discounts): share the shop, an ad, a discount code, ask for reviews;
// then the campaigns already sent and the codes. Writing campaigns and automations stays on the web.

// Labels are m_marketing keys.
const STATUS_TONE: Record<string, { bg: string; fg: string; label: "campaign.draft" | "campaign.scheduled" | "campaign.sending" | "campaign.sent" | "campaign.cancelled" }> = {
  draft: { bg: colors.canvas, fg: colors.inkSoft, label: "campaign.draft" },
  scheduled: { bg: "#FDF0D5", fg: "#8A5A00", label: "campaign.scheduled" },
  sending: { bg: colors.mintTint, fg: colors.forest, label: "campaign.sending" },
  sent: { bg: colors.successTint, fg: colors.success, label: "campaign.sent" },
  cancelled: { bg: colors.dangerTint, fg: colors.danger, label: "campaign.cancelled" },
};

const CHANNEL: Record<string, string> = { email: "Email", sms: "SMS", whatsapp: "WhatsApp" };

const EXPIRY = [
  { label: "expiry.none", days: 0 },
  { label: "expiry.3days", days: 3 },
  { label: "expiry.week", days: 7 },
  { label: "expiry.month", days: 30 },
] as const;

/** "2026-10-19" in Lagos time, `days` from now (the API reads a date as the start of that Lagos day). */
function lagosDate(days: number) {
  const date = new Date(Date.now() + 60 * 60_000 + days * 86_400_000);
  return date.toISOString().slice(0, 10);
}

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–");

function CampaignCard({ campaign }: { campaign: CampaignRow }) {
  const t = useT("m_marketing", "m_ui");
  const tone = STATUS_TONE[campaign.status] ?? STATUS_TONE.draft;
  return (
    <Card style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <T weight="extrabold" style={{ flex: 1, fontSize: 15 }} numberOfLines={1}>{campaign.name}</T>
        <Badge label={t(tone.label)} bg={tone.bg} fg={tone.fg} />
      </View>
      <T style={{ color: colors.inkSoft, fontSize: 14 }} numberOfLines={1}>
        {[campaign.channel === "email" ? t("campaign.email") : CHANNEL[campaign.channel] ?? campaign.channel, campaign.subject, campaign.sentAt ? t("campaign.sentOn", { day: friendlyDay(campaign.sentAt, new Date(), t) }) : campaign.scheduledAt ? t("campaign.for", { day: friendlyDay(campaign.scheduledAt, new Date(), t) }) : null].filter(Boolean).join(" · ")}
      </T>
      {campaign.status === "sent" ? (
        <View style={{ flexDirection: "row", gap: 14, marginTop: 2 }}>
          <T style={{ fontSize: 14 }}><T weight="bold" style={{ fontSize: 14 }}>{String(campaign.sentCount)}</T> {t("campaign.sentWord")}</T>
          <T style={{ fontSize: 14 }}><T weight="bold" style={{ fontSize: 14 }}>{pct(campaign.openCount, campaign.sentCount)}</T> {t("campaign.opened")}</T>
          <T style={{ fontSize: 14 }}><T weight="bold" style={{ fontSize: 14 }}>{pct(campaign.clickCount, campaign.sentCount)}</T> {t("campaign.clicked")}</T>
          {campaign.revenueGenerated ? <T weight="bold" style={{ fontSize: 14, color: colors.success }}>{naira(campaign.revenueGenerated)}</T> : null}
        </View>
      ) : null}
    </Card>
  );
}

export default function Marketing() {
  const t = useT("m_marketing", "m_ui", "common");
  const data = useLoad(fetchMarketing);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<QuickDiscount>({ name: "", code: "", type: "percentage", value: 10, expiresAt: null });
  const [days, setDays] = useState(0);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const overview = data.data;
  // When this screen opened, for "Ended" on expired codes (render stays pure).
  const [now] = useState(() => Date.now());

  async function create() {
    setSaving(true);
    setNote(null);
    const name = form.name.trim() || discountLabel(form, naira, t);
    const code = (form.code.trim() || suggestCode(name, form.type === "percentage" ? form.value : 0)).toUpperCase();
    try {
      const created = await createDiscount({ ...form, name, code, value: form.type === "free_shipping" ? 0 : form.value, expiresAt: days ? lagosDate(days) : null });
      setCreating(false);
      setForm({ name: "", code: "", type: "percentage", value: 10, expiresAt: null });
      setDays(0);
      setNote({ tone: "success", text: t("discount.created", { code: created.code }) });
      await data.reload();
    } catch (createError) {
      setNote({ tone: "error", text: createError instanceof Error ? createError.message : t("discount.createFailed") });
    } finally {
      setSaving(false);
    }
  }

  async function share() {
    setNote(null);
    if ((await shareShop().catch(() => "no-link" as const)) === "no-link") setNote({ tone: "error", text: t("noLink") });
  }

  return (
    <Screen title={t("title")} sub={t("sub")} refreshing={data.refreshing} onRefresh={() => void data.refresh()}>
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      <ChoiceRow icon="share" tint={colors.lilac} title={t("action.share")} sub={t("action.shareSub")} onPress={() => void share()} />
      <ChoiceRow icon="megaphone" tint={colors.mintTint} iconColor={colors.forest} title={t("action.ad")} sub={t("action.adSub")} onPress={() => void openWeb("/home/ads")} />
      <ChoiceRow icon="tag" tint={colors.peach} iconColor={colors.accentInk} title={t("action.discount")} sub={t("action.discountSub")} onPress={() => setCreating(true)} />
      <ChoiceRow icon="star" tint={colors.successTint} iconColor={colors.success} title={t("action.reviews")} sub={t("action.reviewsSub")} onPress={() => router.push("/reviews/ask")} />

      {data.loading && !overview ? <LoadingBlock /> : null}
      {data.error && !overview ? <ErrorState message={data.error} onRetry={() => void data.reload()} /> : null}
      {overview ? (
        <>
          {overview.campaigns.length ? (
            <>
              <SectionTitle>{t("campaigns")}</SectionTitle>
              <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t("totals", { sent: overview.totals.sent, opened: pct(overview.totals.opens, overview.totals.sent), clicked: pct(overview.totals.clicks, overview.totals.sent), revenue: naira(overview.totals.revenue) })}</T>
              {overview.campaigns.slice(0, 5).map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} />)}
            </>
          ) : null}

          {creating || overview.discounts.length ? <SectionTitle>{t("discounts")}</SectionTitle> : null}
          {creating ? (
            <Card style={{ gap: 8 }}>
              <Segmented
                options={[
                  { value: "percentage", label: t("discount.typePercent") },
                  { value: "fixed_amount", label: t("discount.typeAmount") },
                  { value: "free_shipping", label: t("discount.freeDelivery") },
                ]}
                value={form.type}
                onChange={(type) => setForm({ ...form, type, value: type === "percentage" ? 10 : type === "fixed_amount" ? 1000 : 0 })}
              />
              {form.type !== "free_shipping" ? (
                <>
                  <Label>{form.type === "percentage" ? t("discount.percentOff") : t("discount.nairaOff")}</Label>
                  <Field keyboardType="number-pad" value={form.value ? String(form.value) : ""} onChangeText={(text) => setForm({ ...form, value: Number(text.replace(/\D/g, "")) || 0 })} placeholder={form.type === "percentage" ? "10" : "1000"} />
                </>
              ) : null}
              <Label>{t("discount.code")}</Label>
              <Field autoCapitalize="characters" autoCorrect={false} value={form.code} onChangeText={(code) => setForm({ ...form, code: code.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40) })} placeholder={suggestCode(form.name || "Save", form.type === "percentage" ? form.value : 0)} />
              <Label>{t("discount.name")}</Label>
              <Field value={form.name} onChangeText={(name) => setForm({ ...form, name })} placeholder={t("discount.namePlaceholder")} maxLength={120} />
              <Label>{t("discount.ends")}</Label>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {EXPIRY.map((option) => <Chip key={option.days} label={t(option.label)} on={days === option.days} onPress={() => setDays(option.days)} />)}
              </View>
              <PillButton title={t("discount.make")} style={{ marginTop: 6 }} busy={saving} disabled={form.type !== "free_shipping" && !form.value} onPress={() => void create()} />
              <LinkButton title={t("discount.notNow")} color={colors.inkSoft} onPress={() => setCreating(false)} />
            </Card>
          ) : null}
          {overview.discounts.map((discount) => {
            const expired = discount.expiresAt ? new Date(discount.expiresAt).getTime() < now : false;
            return (
              <Card key={discount.id} style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <T weight="extrabold" style={{ flex: 1, fontSize: 16, letterSpacing: 0.5 }} selectable>{discount.code}</T>
                  <Badge label={expired ? t("discount.ended") : discount.status === "active" ? t("discount.active") : discount.status === "draft" ? t("status.draft") : t("discount.off")} bg={!expired && discount.status === "active" ? colors.successTint : colors.canvas} fg={!expired && discount.status === "active" ? colors.success : colors.inkSoft} />
                </View>
                <T style={{ color: colors.inkSoft, fontSize: 14 }}>
                  {[discountLabel(discount, naira, t), discount.name !== discount.code ? discount.name : null, discount.expiresAt ? (expired ? t("discount.endedOn", { day: friendlyDay(discount.expiresAt, new Date(), t) }) : t("discount.endsOn", { day: friendlyDay(discount.expiresAt, new Date(), t) })) : null].filter(Boolean).join(" · ")}
                </T>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <T style={{ fontSize: 14 }}>{t("discount.orders", { count: discount.orders })}{discount.revenue ? ` · ${t("discount.sold", { amount: naira(discount.revenue) })}` : ""}</T>
                  {discount.status === "active" && !expired ? <LinkButton title={t("share")} style={{ minHeight: 30 }} onPress={() => void Share.share({ message: t("discount.shareMessage", { code: discount.code, offer: discountLabel(discount, naira, t).toLowerCase() }) })} /> : null}
                </View>
              </Card>
            );
          })}

          <Card style={{ paddingVertical: 2, marginTop: 6 }}>
            <LinkRow first icon="mail" label={t("link.templates")} hint={t("link.templatesHint")} onPress={() => router.push("/marketing/templates")} />
            <LinkRow icon="users" label={t("link.subscribers")} hint={t("link.subscribersHint")} onPress={() => router.push("/marketing/subscribers")} />
            <LinkRow icon="sparkle" label={t("link.automations")} hint={t("link.automationsHint")} onPress={() => void openWeb("/home/marketing")} />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
