import { useState } from "react";
import { ActivityIndicator, Image, View } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Screen } from "@/components/Screen";
import { List, Pill, Row, type PillTone } from "@/components/design";
import { Notice, PillButton, T } from "@/components/ui";
import { api } from "@/lib/api";
import { money } from "@/lib/customers-pure";
import { useT } from "@/lib/i18n";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// The seller's wholesale orders (stock bought from suppliers). Once the supplier accepts, the seller can pay here
// by card: Paystack opens in the browser and the money goes straight to the supplier's bank (physical goods, so it
// isn't an in-app purchase). When the browser closes the app asks the server to confirm with Paystack.

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

export default function WholesaleOrders() {
  const t = useT("marketplace");
  const { data, error, refreshing, refresh, reload } = useLoad(() => api<WholesaleOrder[]>("/api/app/wholesale"));
  const [paying, setPaying] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function pay(order: WholesaleOrder) {
    setPaying(order.id);
    setNotice(null);
    try {
      const started = await api<{ reference: string; authorizationUrl: string | null }>(`/api/app/wholesale/${order.id}`, { method: "PATCH", json: { action: "pay" } });
      if (!started.authorizationUrl) throw new Error(t("ws.payError"));
      await WebBrowser.openBrowserAsync(started.authorizationUrl);
      // Back from the browser: Paystack's answer decides (an unfinished payment just stays unpaid).
      try {
        await api("/api/app/wholesale/pay-confirm", { method: "POST", json: { reference: started.reference } });
        setNotice({ tone: "success", text: t("ws.paidNotice") });
      } catch {
        // Not paid (closed early) or Paystack is slow: the webhook marks it paid if it went through.
      }
      await reload();
    } catch (cause) {
      setNotice({ tone: "error", text: cause instanceof Error && cause.message ? cause.message : t("ws.payError") });
    } finally {
      setPaying(null);
    }
  }

  return (
    <Screen title={t("ws.title")} sub={t("ws.sub")} refreshing={refreshing} onRefresh={refresh}>
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
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
                        title={t("ws.pay", { total: money(order.totalPrice, order.currency) })}
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
