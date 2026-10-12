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
import { colors } from "@/theme";

// Get more customers (web /home/marketing and /home/discounts), in plain words: share the shop, an advert, a
// discount code, ask for reviews; then the messages already sent to customers and the codes. Writing long emails
// and the messages that send themselves stay on the web.

const STATUS_TONE: Record<string, { bg: string; fg: string; label: string }> = {
  draft: { bg: colors.canvas, fg: colors.inkSoft, label: "Draft" },
  scheduled: { bg: "#FDF0D5", fg: "#8A5A00", label: "Scheduled" },
  sending: { bg: colors.mintTint, fg: colors.forest, label: "Sending" },
  sent: { bg: colors.successTint, fg: colors.success, label: "Sent" },
  cancelled: { bg: colors.dangerTint, fg: colors.danger, label: "Cancelled" },
};

const CHANNEL: Record<string, string> = { email: "Email", sms: "SMS", whatsapp: "WhatsApp" };

const EXPIRY = [
  { label: "No end", days: 0 },
  { label: "3 days", days: 3 },
  { label: "1 week", days: 7 },
  { label: "1 month", days: 30 },
];

/** "2026-10-19" in Lagos time, `days` from now (the API reads a date as the start of that Lagos day). */
function lagosDate(days: number) {
  const date = new Date(Date.now() + 60 * 60_000 + days * 86_400_000);
  return date.toISOString().slice(0, 10);
}

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–");

function CampaignCard({ campaign }: { campaign: CampaignRow }) {
  const tone = STATUS_TONE[campaign.status] ?? STATUS_TONE.draft;
  return (
    <Card style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <T weight="extrabold" style={{ flex: 1, fontSize: 15 }} numberOfLines={1}>{campaign.name}</T>
        <Badge label={tone.label} bg={tone.bg} fg={tone.fg} />
      </View>
      <T style={{ color: colors.inkSoft, fontSize: 14 }} numberOfLines={1}>
        {[CHANNEL[campaign.channel] ?? campaign.channel, campaign.subject, campaign.sentAt ? `sent ${friendlyDay(campaign.sentAt)}` : campaign.scheduledAt ? `for ${friendlyDay(campaign.scheduledAt)}` : null].filter(Boolean).join(" · ")}
      </T>
      {campaign.status === "sent" ? (
        <View style={{ flexDirection: "row", gap: 14, marginTop: 2 }}>
          <T style={{ fontSize: 14 }}><T weight="bold" style={{ fontSize: 14 }}>{String(campaign.sentCount)}</T> sent</T>
          <T style={{ fontSize: 14 }}><T weight="bold" style={{ fontSize: 14 }}>{pct(campaign.openCount, campaign.sentCount)}</T> opened</T>
          <T style={{ fontSize: 14 }}><T weight="bold" style={{ fontSize: 14 }}>{pct(campaign.clickCount, campaign.sentCount)}</T> tapped</T>
          {campaign.revenueGenerated ? <T weight="bold" style={{ fontSize: 14, color: colors.success }}>{naira(campaign.revenueGenerated)}</T> : null}
        </View>
      ) : null}
    </Card>
  );
}

export default function Marketing() {
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
    const name = form.name.trim() || `${form.type === "percentage" ? `${form.value}% off` : form.type === "fixed_amount" ? `${naira(form.value)} off` : "Free delivery"}`;
    const code = (form.code.trim() || suggestCode(name, form.type === "percentage" ? form.value : 0)).toUpperCase();
    try {
      const created = await createDiscount({ ...form, name, code, value: form.type === "free_shipping" ? 0 : form.value, expiresAt: days ? lagosDate(days) : null });
      setCreating(false);
      setForm({ name: "", code: "", type: "percentage", value: 10, expiresAt: null });
      setDays(0);
      setNote({ tone: "success", text: `Code ${created.code} works now. Customers type it when they pay.` });
      await data.reload();
    } catch (createError) {
      setNote({ tone: "error", text: createError instanceof Error ? createError.message : "Couldn't make the code. Check your connection and try again." });
    } finally {
      setSaving(false);
    }
  }

  async function share() {
    setNote(null);
    if ((await shareShop().catch(() => "no-link" as const)) === "no-link") setNote({ tone: "error", text: "Your shop link isn't ready yet. Finish setting up your shop first." });
  }

  return (
    <Screen title="Get more customers" sub="Ways to bring more people to your shop." refreshing={data.refreshing} onRefresh={() => void data.refresh()}>
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      <ChoiceRow icon="share" tint={colors.lilac} title="Share my shop" sub="Send your link on WhatsApp or your Status" onPress={() => void share()} />
      <ChoiceRow icon="megaphone" tint={colors.mintTint} iconColor={colors.forest} title="Show a product to more people" sub="An advert on Instagram and Facebook. Opens in your browser" onPress={() => void openWeb("/home/ads")} />
      <ChoiceRow icon="tag" tint={colors.peach} iconColor={colors.accentInk} title="Make a discount code" sub="Money off, like SALE10" onPress={() => setCreating(true)} />
      <ChoiceRow icon="star" tint={colors.successTint} iconColor={colors.success} title="Ask for reviews" sub="Happy customers bring new ones" onPress={() => router.push("/reviews/ask")} />

      {data.loading && !overview ? <LoadingBlock /> : null}
      {data.error && !overview ? <ErrorState message={data.error} onRetry={() => void data.reload()} /> : null}
      {overview ? (
        <>
          {overview.campaigns.length ? (
            <>
              <SectionTitle>Messages you sent to customers</SectionTitle>
              <T style={{ color: colors.inkSoft, fontSize: 15 }}>{overview.totals.sent} people got them · {pct(overview.totals.opens, overview.totals.sent)} opened · {pct(overview.totals.clicks, overview.totals.sent)} tapped · {naira(overview.totals.revenue)} in sales</T>
              {overview.campaigns.slice(0, 5).map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} />)}
            </>
          ) : null}

          {creating || overview.discounts.length ? <SectionTitle>Discount codes</SectionTitle> : null}
          {creating ? (
            <Card style={{ gap: 8 }}>
              <Segmented
                options={[
                  { value: "percentage", label: "% off" },
                  { value: "fixed_amount", label: "₦ off" },
                  { value: "free_shipping", label: "Free delivery" },
                ]}
                value={form.type}
                onChange={(type) => setForm({ ...form, type, value: type === "percentage" ? 10 : type === "fixed_amount" ? 1000 : 0 })}
              />
              {form.type !== "free_shipping" ? (
                <>
                  <Label>{form.type === "percentage" ? "Percent off" : "Naira off"}</Label>
                  <Field keyboardType="number-pad" value={form.value ? String(form.value) : ""} onChangeText={(text) => setForm({ ...form, value: Number(text.replace(/\D/g, "")) || 0 })} placeholder={form.type === "percentage" ? "10" : "1000"} />
                </>
              ) : null}
              <Label>Code shoppers type</Label>
              <Field autoCapitalize="characters" autoCorrect={false} value={form.code} onChangeText={(code) => setForm({ ...form, code: code.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40) })} placeholder={suggestCode(form.name || "Save", form.type === "percentage" ? form.value : 0)} />
              <Label>Name (only you see it)</Label>
              <Field value={form.name} onChangeText={(name) => setForm({ ...form, name })} placeholder="Weekend sale" maxLength={120} />
              <Label>Ends</Label>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {EXPIRY.map((option) => <Chip key={option.days} label={option.label} on={days === option.days} onPress={() => setDays(option.days)} />)}
              </View>
              <PillButton title="Make the code" style={{ marginTop: 6 }} busy={saving} disabled={form.type !== "free_shipping" && !form.value} onPress={() => void create()} />
              <LinkButton title="Not now" color={colors.inkSoft} onPress={() => setCreating(false)} />
            </Card>
          ) : null}
          {overview.discounts.map((discount) => {
            const expired = discount.expiresAt ? new Date(discount.expiresAt).getTime() < now : false;
            return (
              <Card key={discount.id} style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <T weight="extrabold" style={{ flex: 1, fontSize: 16, letterSpacing: 0.5 }} selectable>{discount.code}</T>
                  <Badge label={expired ? "Ended" : discount.status === "active" ? "Active" : discount.status === "draft" ? "Draft" : "Off"} bg={!expired && discount.status === "active" ? colors.successTint : colors.canvas} fg={!expired && discount.status === "active" ? colors.success : colors.inkSoft} />
                </View>
                <T style={{ color: colors.inkSoft, fontSize: 14 }}>
                  {[discountLabel(discount, naira), discount.name !== discount.code ? discount.name : null, discount.expiresAt ? `${expired ? "ended" : "ends"} ${friendlyDay(discount.expiresAt)}` : null].filter(Boolean).join(" · ")}
                </T>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <T style={{ fontSize: 14 }}>{discount.orders} order{discount.orders === 1 ? "" : "s"}{discount.revenue ? ` · ${naira(discount.revenue)} sold` : ""}</T>
                  {discount.status === "active" && !expired ? <LinkButton title="Share" style={{ minHeight: 30 }} onPress={() => void Share.share({ message: `Use code ${discount.code} for ${discountLabel(discount, naira).toLowerCase()} when you pay!` })} /> : null}
                </View>
              </Card>
            );
          })}

          <Card style={{ paddingVertical: 2, marginTop: 6 }}>
            <LinkRow first icon="mail" label="Ready-made emails" hint="For sales, new stock and thank-yous" onPress={() => router.push("/marketing/templates")} />
            <LinkRow icon="users" label="Groups of customers" hint="Opens in your browser" onPress={() => void openWeb("/home/marketing/subscribers")} />
            <LinkRow icon="sparkle" label="Messages that send themselves" hint="Welcome, customers who didn't finish paying, thank-you. Opens in your browser" onPress={() => void openWeb("/home/marketing")} />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
