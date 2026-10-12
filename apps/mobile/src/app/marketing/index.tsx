import { useState } from "react";
import { Share, View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { Badge, EmptyState, ErrorState, LinkRow, LoadingBlock, SectionTitle } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Chip, Field, Label, LinkButton, Notice, PillButton, Segmented, T } from "@/components/ui";
import { shortTime } from "@/lib/inbox-pure";
import { createDiscount, discountLabel, fetchMarketing, suggestCode, type CampaignRow, type QuickDiscount } from "@/lib/marketing";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors } from "@/theme";

// Marketing at a glance (web /home/marketing/campaigns and /home/discounts): how campaigns did, the latest ones,
// discount codes and a quick way to make a new code. Writing campaigns and automations stays on the web.

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
      <T style={{ color: colors.inkSoft, fontSize: 12.5 }} numberOfLines={1}>
        {[CHANNEL[campaign.channel] ?? campaign.channel, campaign.subject, campaign.sentAt ? `sent ${shortTime(campaign.sentAt)}` : campaign.scheduledAt ? `for ${shortTime(campaign.scheduledAt)}` : null].filter(Boolean).join(" · ")}
      </T>
      {campaign.status === "sent" ? (
        <View style={{ flexDirection: "row", gap: 14, marginTop: 2 }}>
          <T style={{ fontSize: 12.5 }}><T weight="bold" style={{ fontSize: 12.5 }}>{String(campaign.sentCount)}</T> sent</T>
          <T style={{ fontSize: 12.5 }}><T weight="bold" style={{ fontSize: 12.5 }}>{pct(campaign.openCount, campaign.sentCount)}</T> opened</T>
          <T style={{ fontSize: 12.5 }}><T weight="bold" style={{ fontSize: 12.5 }}>{pct(campaign.clickCount, campaign.sentCount)}</T> clicked</T>
          {campaign.revenueGenerated ? <T weight="bold" style={{ fontSize: 12.5, color: colors.success }}>{naira(campaign.revenueGenerated)}</T> : null}
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
      setNote({ tone: "success", text: `Code ${created.code} is live. Shoppers type it at checkout.` });
      await data.reload();
    } catch (createError) {
      setNote({ tone: "error", text: createError instanceof Error ? createError.message : "Couldn't make the code." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen title="Marketing" sub="Campaigns to your customers and discount codes." refreshing={data.refreshing} onRefresh={() => void data.refresh()}>
      {data.loading && !overview ? <LoadingBlock /> : null}
      {data.error && !overview ? <ErrorState message={data.error} onRetry={() => void data.reload()} web={{ label: "Open on web", onPress: () => void openWeb("/home/marketing") }} /> : null}
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      {overview ? (
        <>
          <View style={{ backgroundColor: colors.ink, borderRadius: 24, padding: 16, gap: 12 }}>
            <T style={{ color: "rgba(255,255,255,0.75)" }}>{overview.totals.campaignsSent} campaign{overview.totals.campaignsSent === 1 ? "" : "s"} sent · {overview.totals.subscribers} subscriber{overview.totals.subscribers === 1 ? "" : "s"}</T>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {[
                ["Reached", String(overview.totals.sent)],
                ["Opened", pct(overview.totals.opens, overview.totals.sent)],
                ["Clicked", pct(overview.totals.clicks, overview.totals.sent)],
                ["Sales", naira(overview.totals.revenue)],
              ].map(([label, value]) => (
                <View key={label} style={{ flex: 1, backgroundColor: "#24212F", borderRadius: 14, padding: 10 }}>
                  <T style={{ color: "rgba(255,255,255,0.7)", fontSize: 11.5 }}>{label}</T>
                  <T weight="extrabold" style={{ color: "#FFFFFF", fontSize: 15, marginTop: 2 }} numberOfLines={1} adjustsFontSizeToFit>{value}</T>
                </View>
              ))}
            </View>
          </View>

          <SectionTitle action={<LinkButton title="New campaign" color={colors.accentInk} style={{ minHeight: 32 }} onPress={() => void openWeb("/home/marketing/campaigns/new")} />}>Campaigns</SectionTitle>
          {!overview.campaigns.length ? (
            <EmptyState icon="megaphone" title="No campaigns yet" action={<PillButton title="Ask Rex to build one" size="sm" onPress={() => router.push({ pathname: "/rex", params: { prompt: "Help me build an email campaign for my customers." } })} />}>
              Email, SMS or WhatsApp your subscribers and buyers about new stock and offers.
            </EmptyState>
          ) : null}
          {overview.campaigns.slice(0, 10).map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} />)}
          {overview.campaigns.length > 10 ? <LinkButton title={`See all ${overview.campaigns.length} on the web`} color={colors.inkSoft} onPress={() => void openWeb("/home/marketing/campaigns")} /> : null}

          <SectionTitle action={!creating ? <LinkButton title="New code" color={colors.accentInk} style={{ minHeight: 32 }} onPress={() => setCreating(true)} /> : undefined}>Discount codes</SectionTitle>
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
              <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                <PillButton title="Make code" size="md" style={{ flex: 1 }} busy={saving} disabled={form.type !== "free_shipping" && !form.value} onPress={() => void create()} />
                <PillButton title="Cancel" size="md" tone="white" onPress={() => setCreating(false)} />
              </View>
              <T style={{ color: colors.inkSoft, fontSize: 12.5 }}>Minimum spend, usage limits, products and buy-X-get-Y are on the web.</T>
            </Card>
          ) : null}
          {!overview.discounts.length && !creating ? <EmptyState icon="tag" title="No discount codes yet" action={<PillButton title="Make a code" size="sm" onPress={() => setCreating(true)} />}>A code like SALE10 gives shoppers money off at checkout.</EmptyState> : null}
          {overview.discounts.map((discount) => {
            const expired = discount.expiresAt ? new Date(discount.expiresAt).getTime() < now : false;
            return (
              <Card key={discount.id} style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <T weight="extrabold" style={{ flex: 1, fontSize: 16, letterSpacing: 0.5 }} selectable>{discount.code}</T>
                  <Badge label={expired ? "Ended" : discount.status === "active" ? "Active" : discount.status === "draft" ? "Draft" : "Off"} bg={!expired && discount.status === "active" ? colors.successTint : colors.canvas} fg={!expired && discount.status === "active" ? colors.success : colors.inkSoft} />
                </View>
                <T style={{ color: colors.inkSoft, fontSize: 13 }}>
                  {[discountLabel(discount, naira), discount.name !== discount.code ? discount.name : null, discount.expiresAt ? `${expired ? "ended" : "ends"} ${new Date(discount.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : null].filter(Boolean).join(" · ")}
                </T>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <T style={{ fontSize: 12.5 }}>{discount.orders} order{discount.orders === 1 ? "" : "s"}{discount.revenue ? ` · ${naira(discount.revenue)} sold` : ""}</T>
                  {discount.status === "active" && !expired ? <LinkButton title="Share" style={{ minHeight: 30 }} onPress={() => void Share.share({ message: `Use code ${discount.code} for ${discountLabel(discount, naira).toLowerCase()} at checkout!` })} /> : null}
                </View>
              </Card>
            );
          })}

          <Card style={{ paddingVertical: 2, marginTop: 6 }}>
            <LinkRow first icon="mail" label="Email templates" hint="Ready-made emails for sales, launches and thank-yous" onPress={() => router.push("/marketing/templates")} />
            <LinkRow icon="user" label="Subscribers and segments" hint="Opens the web" onPress={() => void openWeb("/home/marketing/subscribers")} />
            <LinkRow icon="sparkle" label="Automations" hint="Welcome, abandoned checkout, thank-you (opens the web)" onPress={() => void openWeb("/home/marketing")} />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
