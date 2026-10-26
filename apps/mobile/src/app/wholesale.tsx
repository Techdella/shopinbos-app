import { useState } from "react";
import { ActivityIndicator, Image, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { List, Pill, Row, type PillTone } from "@/components/design";
import { Notice, PillButton, T } from "@/components/ui";
import { api } from "@/lib/api";
import { money } from "@/lib/customers-pure";
import { useT } from "@/lib/i18n";
import { useLoad } from "@/lib/useLoad";
import { payWholesaleOrder } from "@/lib/wallet";
import { colors } from "@/theme";

// The seller's wholesale orders (stock bought from suppliers). Once the supplier accepts, the seller can pay here
// by card: Paystack opens in an in-app browser that closes by itself once paid (lib/pay.ts), and the money goes
// straight to the supplier's bank (physical goods, so it isn't an in-app purchase). The app then confirms it.

type WholesaleOrder = {
  id: string;
  status: string;
  quantity: number;
  totalPrice: number;
  currency: string;
  rejectReason: string | null;
  createdAt: string;
  expiredAt?: string | null;
  paidAt: string | null;
  paidOutAt: string | null;
  supplier: { id: string; name: string };
  product: { id: string; name: string; image: string | null };
  canPay: boolean;
};

const STAGE: Record<string, { key: string; tone: PillTone }> = {
  pending: { key: "Waiting for the supplier", tone: "warn" },
  confirmed: { key: "Confirmed: expect their invoice", tone: "teal" },
  processing: { key: "Being packed", tone: "teal" },
  shipped: { key: "On the way", tone: "org" },
  delivered: { key: "Delivered", tone: "ok" },
  refunded: { key: "Refunded", tone: "gray" },
  cancelled: { key: "Declined by the supplier", tone: "gray" },
};

const ref = (id: string) => `W-${id.slice(-6).toUpperCase()}`;

/** A price request the seller sent from Find ("Request a quote"), and the supplier's answer (GET /api/app/supplier-quotes). */
type PriceRequest = {
  id: string;
  quantity: number;
  status: string;
  quotedPrice: number | null;
  supplierResponse: string | null;
  supplier: { displayName: string };
  supplierProduct: { id: string; name: string; slug: string } | null;
};

const QUOTE_TONE: Record<string, PillTone> = { pending: "warn", responded: "ok", accepted: "teal", rejected: "gray", expired: "gray" };

export default function WholesaleOrders() {
  const t = useT("marketplace");
  const { data, error, refreshing, refresh, reload } = useLoad(() => api<WholesaleOrder[]>("/api/app/wholesale"));
  const tw = useT("m_find");
  const tp = useT("m_money");
  // Price requests: an extra; hidden when the server can't answer.
  const quotes = useLoad(() => api<PriceRequest[]>("/api/app/supplier-quotes?limit=20").catch(() => null));
  const [paying, setPaying] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);

  async function pay(order: WholesaleOrder) {
    setPaying(order.id);
    setNotice(null);
    try {
      // Paid, a transfer still on its way (the webhook marks it paid), or closed before paying.
      const result = await payWholesaleOrder(order.id);
      setNotice(
        result.outcome === "paid"
          ? { tone: "success", text: t("ws.paidNotice") }
          : result.outcome === "pending"
            ? { tone: "info", text: tp("pay.pending") }
            : { tone: "error", text: tp("pay.cancelled") },
      );
      await reload();
    } catch (cause) {
      setNotice({ tone: "error", text: cause instanceof Error && cause.message ? cause.message : t("ws.payError") });
    } finally {
      setPaying(null);
    }
  }

  return (
    <Screen title={t("ws.title")} sub={t("ws.sub")} refreshing={refreshing} onRefresh={() => { void quotes.reload(); return refresh(); }}>
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      {quotes.data?.length ? (
        <View style={{ gap: 8 }}>
          <T weight="extrabold" style={{ fontSize: 16 }}>{tw("wholesale.requests")}</T>
          <List>
            {quotes.data.map((quote) => {
              const slug = quote.supplierProduct?.slug;
              return (
                <Row
                  key={quote.id}
                  title={`${quote.quantity} × ${quote.supplierProduct?.name ?? ""}`}
                  sub={
                    <View style={{ gap: 6 }}>
                      <T style={{ fontSize: 14, color: colors.inkSoft }}>
                        {[quote.supplier.displayName, quote.quotedPrice != null ? tw("wholesale.each", { price: money(quote.quotedPrice, "NGN") }) : null].filter(Boolean).join(" · ")}
                      </T>
                      <Pill tone={QUOTE_TONE[quote.status] ?? "gray"} label={tw.dynamic(`wholesale.q.${quote.status}`, quote.status)} />
                      {quote.supplierResponse ? <T style={{ fontSize: 13, color: colors.inkSoft }}>{`“${quote.supplierResponse}”`}</T> : null}
                    </View>
                  }
                  onPress={slug ? () => router.push({ pathname: "/find/[slug]", params: { slug } }) : undefined}
                />
              );
            })}
          </List>
        </View>
      ) : null}
      {error && !data ? <Notice>{error}</Notice> : null}
      {!data && !error ? <ActivityIndicator color={colors.ink} style={{ marginTop: 24 }} /> : null}
      {data && !data.length ? (
        <View style={{ gap: 12, alignItems: "flex-start" }}>
          <T weight="bold" style={{ fontSize: 18 }}>{t("ws.empty")}</T>
          <T style={{ color: colors.inkSoft, lineHeight: 21 }}>{t("ws.emptySub")}</T>
          <PillButton title={t("ws.findProducts")} size="md" onPress={() => router.push("/find")} />
        </View>
      ) : null}
      {data?.length ? (
        <List>
          {data.map((order) => {
            const stage = order.status === "cancelled" && order.expiredAt ? { key: "The supplier didn't answer in time", tone: "gray" as PillTone } : STAGE[order.status] ?? { key: order.status, tone: "gray" as PillTone };
            const paid = Boolean(order.paidAt);
            return (
              <Row
                key={order.id}
                lead={
                  order.product.image ? (
                    <Image source={{ uri: order.product.image }} style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: colors.canvas }} accessibilityIgnoresInvertColors />
                  ) : (
                    <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: colors.canvas }} />
                  )
                }
                title={`${order.quantity} × ${order.product.name}`}
                sub={
                  <View style={{ gap: 8 }}>
                    <T style={{ fontSize: 14, color: colors.inkSoft }}>{`${order.supplier.name} · ${ref(order.id)} · ${money(order.totalPrice, order.currency)}`}</T>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                      <Pill tone={stage.tone} label={t.dynamic(`ws.stage.${stage.key}`, stage.key)} />
                      {paid ? <Pill tone="ok" icon="check" label={t("ws.paidInApp")} /> : null}
                    </View>
                    {order.status === "cancelled" && order.rejectReason && !order.expiredAt ? (
                      <T style={{ fontSize: 13, color: colors.inkSoft }}>{t("ws.note.declined", { reason: order.rejectReason })}</T>
                    ) : null}
                    {order.canPay && !paid ? (
                      <PillButton
                        title={tw("ws.payOrder", { total: money(order.totalPrice, order.currency) })}
                        accessibilityLabel={t("ws.payLabel", { ref: ref(order.id) })}
                        tone="accent"
                        size="sm"
                        busy={paying === order.id}
                        disabled={Boolean(paying)}
                        onPress={() => void pay(order)}
                        style={{ alignSelf: "flex-start" }}
                      />
                    ) : null}
                  </View>
                }
              />
            );
          })}
        </List>
      ) : null}
    </Screen>
  );
}
