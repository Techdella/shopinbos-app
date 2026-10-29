import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { Badge, ChipRow, EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Sheet } from "@/components/Sheet";
import { Card, Chip, PillButton, T } from "@/components/ui";
import { TONE_COLORS } from "@/lib/dashboard";
import { friendlyDay } from "@/lib/friendly";
import { fetchInvoices, type ManualInvoice } from "@/lib/money";
import { INVOICE_TABS, orderStatusTone, type InvoiceTab } from "@/lib/money-pure";
import { shareText } from "@/lib/share";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Invoices (web /home/invoices): every order's invoice (tap one to see its lines and share it) and the invoices the
// seller made by hand for customers, suppliers and delivery partners ("New invoice" makes one; a sent one with an
// email is emailed, as on the web).

export default function Invoices() {
  const t = useT("m_money", "m_ui", "common");
  const loaded = useLoad(fetchInvoices);
  const [tab, setTab] = useState<InvoiceTab>("orders");
  const [open, setOpen] = useState<ManualInvoice | null>(null);
  const data = loaded.data;

  return (
    <Screen title={t("inv.title")} sub={t("inv.subShort")} tip={t("inv.sub")} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
      <PillButton testID="new-invoice" onPress={() => router.push("/invoices/new")} accessibilityLabel={t("inv.new")} icon="plus" title={t("inv.new")} />

      {loaded.loading && !data ? <LoadingBlock /> : null}
      {loaded.error && !data ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}

      {data ? (
        <>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Stat label={t("inv.waiting")} value={naira(data.summary.waiting.total)} hint={t("count.orders", { count: data.summary.waiting.count })} />
            <Stat label={t("inv.totalOrdered")} value={naira(data.summary.totalOrdered)} hint={t("latest100")} />
          </View>

          <ChipRow>
            {INVOICE_TABS.map((key) => (
              <Chip key={key} label={`${t(`inv.tab.${key}`)} ${key === "orders" ? data.orders.length : data.manual.length}`} on={tab === key} onPress={() => setTab(key)} />
            ))}
          </ChipRow>

          {tab === "orders" ? (
            data.orders.length ? (
              data.orders.map((order) => {
                const tone = TONE_COLORS[orderStatusTone(order.status)];
                return (
                  <Pressable key={order.id} accessibilityRole="button" onPress={() => router.push({ pathname: "/invoices/[id]", params: { id: order.id } })} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
                    <Card style={{ gap: 6 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Badge label={t.dynamic(`status.${order.status}`, order.status)} bg={tone.bg} fg={tone.fg} />
                        <T style={{ flex: 1, color: colors.inkSoft, fontSize: 13.5 }} numberOfLines={1}>{`${order.orderNumber} · ${friendlyDay(order.createdAt, new Date(), t)}`}</T>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <T weight="extrabold" style={{ flex: 1, fontSize: 16 }} numberOfLines={1}>{order.buyerName || t("customer")}</T>
                        <T weight="extrabold" style={{ fontSize: 16 }}>{naira(order.total)}</T>
                      </View>
                      <T style={{ color: colors.inkSoft, fontSize: 14 }} numberOfLines={1}>{t("inv.plusDelivery", { subtotal: naira(order.subtotal), fee: naira(order.shippingFee) })}</T>
                    </Card>
                  </Pressable>
                );
              })
            ) : (
              <EmptyState icon="doc" title={t("inv.noOrders")}>{t("inv.noOrdersSub")}</EmptyState>
            )
          ) : data.manual.length ? (
            data.manual.map((invoice) => (
              <Pressable key={invoice.id} accessibilityRole="button" onPress={() => setOpen(invoice)} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
                <Card style={{ gap: 6 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Badge label={invoice.direction === "sent" ? t("inv.sent") : t("inv.received")} bg={TONE_COLORS[invoice.direction === "sent" ? "accent" : "success"].bg} fg={TONE_COLORS[invoice.direction === "sent" ? "accent" : "success"].fg} />
                    <T style={{ flex: 1, color: colors.inkSoft, fontSize: 13.5 }} numberOfLines={1}>{`${t.dynamic(`party.${invoice.partyType}`, invoice.partyType)} · ${friendlyDay(invoice.createdAt, new Date(), t)}`}</T>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <T weight="extrabold" style={{ flex: 1, fontSize: 16 }} numberOfLines={1}>{invoice.partyName}</T>
                    <T weight="extrabold" style={{ fontSize: 16 }}>{naira(invoice.amount)}</T>
                  </View>
                  <T style={{ color: colors.inkSoft, fontSize: 14 }} numberOfLines={2}>{invoice.description}</T>
                </Card>
              </Pressable>
            ))
          ) : (
            <EmptyState icon="doc" title={t("inv.noneMade")}>{t("inv.noneMadeSub")}</EmptyState>
          )}
        </>
      ) : null}

      <ManualInvoiceSheet invoice={open} onClose={() => setOpen(null)} />
    </Screen>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card style={{ flex: 1, gap: 2 }}>
      <T style={{ color: colors.inkSoft, fontSize: 14 }} numberOfLines={1}>{label}</T>
      <T weight="extrabold" style={{ fontSize: 20 }} numberOfLines={1} adjustsFontSizeToFit>{value}</T>
      <T style={{ color: colors.inkSoft, fontSize: 13.5 }} numberOfLines={1}>{hint}</T>
    </Card>
  );
}

/** One invoice the seller made: who it's for or from, what for, the amount, and sharing it. */
function ManualInvoiceSheet({ invoice, onClose }: { invoice: ManualInvoice | null; onClose: () => void }) {
  const t = useT("m_money", "m_ui", "common");
  if (!invoice) return null;
  const share = () => void shareText(t("inv.shareManual", { number: invoice.id, description: invoice.description, amount: naira(invoice.amount) }));
  return (
    <Sheet visible onClose={onClose} title={t("inv.number", { number: invoice.id })}>
      <Card style={{ gap: 8, backgroundColor: colors.canvas }}>
        <Row label={invoice.direction === "sent" ? t("inv.for") : t("inv.from")} value={`${invoice.partyName} (${t.dynamic(`party.${invoice.partyType}`, invoice.partyType)})`} />
        {invoice.partyEmail ? <Row label={t("inv.email")} value={invoice.partyEmail} /> : null}
        <Row label={t("inv.date")} value={friendlyDay(invoice.createdAt, new Date(), t)} />
        <Row label={t("inv.forWhat")} value={invoice.description} />
        <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 }}>
          <Row label={t("inv.amountLabel")} value={naira(invoice.amount)} strong />
        </View>
      </Card>
      <PillButton title={t("inv.share")} tone="accent" onPress={share} />
    </Sheet>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: "row", gap: 12, justifyContent: "space-between" }}>
      <T style={{ color: colors.inkSoft, fontSize: 15 }}>{label}</T>
      <T weight={strong ? "extrabold" : "semibold"} style={{ flex: 1, textAlign: "right", fontSize: strong ? 18 : 15 }}>{value}</T>
    </View>
  );
}
