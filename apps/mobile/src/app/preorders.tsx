import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { naira } from "@shared/onboarding";
import { List, Pill, Row, type PillTone } from "@/components/design";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { OneLine } from "@/components/Preorder";
import { Screen } from "@/components/Screen";
import { Sheet } from "@/components/Sheet";
import { ButtonRow, Card, Notice, PillButton, Segmented, T, Toggle } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { balanceDueText, paidText, payButtonText, shipDayText, stageText, storeStageText, type PreorderStage, type StorePreorderStage } from "@/lib/preorder-pure";
import { fetchSellerWholesalePreorders, fetchStorePreorders, storeBalanceAction, storePreorderAction, toAsk, type SellerWholesalePreorder, type StorePreorderGroup } from "@/lib/preorders";
import { useLoad } from "@/lib/useLoad";
import { payWholesaleOrder } from "@/lib/wallet";
import { colors } from "@/theme";

// The seller's preorders (web /home/preorders; server src/lib/supplier-orders/preorders.server.ts), two views:
//   My shop         their store's preorders from shoppers, one card per product (ship-by date, units, each order);
//                   "Stock is ready" asks first, then moves the paid orders to processing (the usual status change
//                   tells each customer it's being prepared) and can end the preorder. Unpaid orders stay as they are.
//                   Customers who paid a deposit show "Balance due": "Stock is ready" asks them for the rest (email
//                   and text, 7 days to pay); the seller can mark it "Paid another way", or cancel once it's overdue
//                   (the deposit is then owed back; src/lib/commerce/store-balance.server.ts).
//   From suppliers  bulk preorders they placed: stage, deposit paid / balance due, and Pay deposit / Pay balance
//                   (the same Paystack path as any bulk order, straight to the supplier's bank).
// Reached from Orders (Preorders chip), Wholesale (Preorders chip) and Find after placing a preorder (?view=suppliers).

type View_ = "shop" | "suppliers";

const STAGE_TONE: Record<PreorderStage, PillTone> = { waiting: "warn", pay_balance: "org", ready: "ok", shipped: "teal", delivered: "ok", cancelled: "gray" };
const STORE_TONE: Record<StorePreorderStage, PillTone> = { unpaid: "gray", waiting: "warn", balance_due: "org", preparing: "ok" };

type StoreOrderRow = StorePreorderGroup["orders"][number];

function Thumb({ uri }: { uri: string | null }) {
  return uri ? (
    <Image source={{ uri }} style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: colors.canvas }} accessibilityIgnoresInvertColors />
  ) : (
    <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: colors.canvas }} />
  );
}

export default function Preorders() {
  const t = useT("m_ui");
  const params = useLocalSearchParams<{ view?: string }>();
  const [view, setView] = useState<View_>(params.view === "suppliers" ? "suppliers" : "shop");
  useEffect(() => {
    if (params.view === "suppliers" || params.view === "shop") setView(params.view);
  }, [params.view]);

  return (
    <Screen title={t("preorders.title")} sub={view === "shop" ? t("preorders.shopSub") : t("preorders.suppliersSub")}>
      <Segmented
        options={[
          { value: "shop", label: t("preorders.viewShop") },
          { value: "suppliers", label: t("preorders.viewSuppliers") },
        ]}
        value={view}
        onChange={setView}
      />
      {view === "shop" ? <ShopPreorders /> : <SupplierPreorders />}
    </Screen>
  );
}

function ShopPreorders() {
  const t = useT("m_ui");
  const loaded = useLoad(fetchStorePreorders);
  const [groups, setGroups] = useState<StorePreorderGroup[] | null>(null);
  const [asking, setAsking] = useState<StorePreorderGroup | null>(null);
  const [endToo, setEndToo] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [cancelling, setCancelling] = useState<StoreOrderRow | null>(null);
  const shown = groups ?? loaded.data?.groups ?? null;
  const now = new Date();

  async function settle(order: StoreOrderRow, action: "balance_paid" | "cancel_unpaid") {
    setBusy(`${action}:${order.id}`);
    setNotice(null);
    try {
      const result = await storeBalanceAction(order.id, action);
      setGroups(result.groups);
      setNotice({ tone: "success", text: action === "balance_paid" ? t("preorders.markedPaid") : t("preorders.cancelledUnpaid") });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error && error.message ? error.message : t("preorders.failed") });
    } finally {
      setBusy(null);
      setCancelling(null);
    }
  }

  async function act(group: StorePreorderGroup, action: "ready" | "end", end?: boolean) {
    setBusy(`${action}:${group.productId}`);
    setNotice(null);
    try {
      const result = await storePreorderAction(group.productId, action, end);
      setGroups(result.groups);
      setNotice({
        tone: "success",
        text:
          action === "ready"
            ? [t("preorders.movedDone", { count: result.moved ?? 0 }), result.asked ? t("preorders.askedDone", { count: result.asked }) : null, result.unpaid ? t("preorders.unpaidLeft", { count: result.unpaid }) : null, result.ended ? t("preorders.endedDone") : null].filter(Boolean).join(" ")
            : t("preorders.endedDone"),
      });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error && error.message ? error.message : t("preorders.failed") });
    } finally {
      setBusy(null);
      setAsking(null);
      setEndToo(false);
    }
  }

  return (
    <>
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      {loaded.loading && !shown ? <LoadingBlock /> : null}
      {loaded.error && !shown ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      {shown && !shown.length ? (
        <Card style={{ gap: 6 }}>
          <T weight="extrabold" style={{ fontSize: 17 }}>{t("preorders.shopEmpty")}</T>
          <T style={{ color: colors.inkSoft, lineHeight: 21 }}>{t("preorders.shopEmptySub")}</T>
        </Card>
      ) : null}
      {shown?.map((group) => (
        <View key={group.productId} style={{ gap: 10 }}>
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
              <Thumb uri={group.image} />
              <View style={{ flex: 1, gap: 4 }}>
                <T weight="extrabold" style={{ fontSize: 17 }} numberOfLines={2}>{group.name}</T>
                {group.product ? <Pill tone={group.product.on ? "warn" : "gray"} label={group.product.on ? t("preorders.taking") : t("preorders.stopped")} /> : null}
              </View>
            </View>
            <T style={{ color: colors.inkSoft, fontSize: 14.5, lineHeight: 21 }}>
              {[group.shipsOn ? t("preorders.shipBy", { date: shipDayText(group.shipsOn, now, t) }) : t("preorders.noDate"), t("preorders.orders", { count: group.orders.length }), t("preorders.units", { count: group.units })].join(" · ")}
            </T>
            {group.product?.on ? (
              <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>
                {[
                  group.product.limit ? t("preorders.takenOf", { taken: group.product.taken, limit: group.product.limit }) : t("preorders.noLimit", { taken: group.product.taken }),
                  group.product.depositPct ? t("preorders.depositPct", { pct: group.product.depositPct }) : t("preorders.payInFull"),
                ].join(" · ")}
              </T>
            ) : null}
            {/* Ship date, limit, deposit and promise are on the product (its Preorder section). */}
            <PillButton size="sm" tone="white" accessibilityLabel={t("preorders.edit")} onPress={() => router.push({ pathname: "/product/[id]", params: { id: group.productId, section: "preorder" } })}>
              <OneLine text={t("preorders.edit")} size={15} />
            </PillButton>
            {group.waiting > 0 || toAsk(group) > 0 ? (
              <PillButton size="md" busy={busy === `ready:${group.productId}`} disabled={Boolean(busy)} accessibilityLabel={t("preorders.stockReady")} onPress={() => setAsking(group)}>
                <OneLine text={t("preorders.stockReady")} color="#FFFFFF" size={16} />
              </PillButton>
            ) : null}
            {group.product?.on ? (
              <PillButton size="sm" tone="white" busy={busy === `end:${group.productId}`} disabled={Boolean(busy)} accessibilityLabel={t("preorders.end")} onPress={() => void act(group, "end")}>
                <OneLine text={t("preorders.end")} size={15} />
              </PillButton>
            ) : null}
          </Card>
          {group.orders.length === 0 ? (
            <T style={{ color: colors.inkSoft, fontSize: 14.5, lineHeight: 21, paddingHorizontal: 4 }}>{t("preorders.noOrdersYet")}</T>
          ) : null}
          <List>
            {group.orders.map((order) => (
              <Row
                key={order.id}
                title={`#${order.orderNumber} · ${order.buyerName}`}
                sub={
                  <View style={{ gap: 6 }}>
                    <T style={{ fontSize: 14, color: colors.inkSoft }}>{[t("preorders.units", { count: order.quantity }), t("preorders.orderedOn", { date: shipDayText(order.createdAt.slice(0, 10), now, t) })].join(" · ")}</T>
                    <Pill tone={STORE_TONE[order.stage]} label={storeStageText(order.stage, t)} />
                    {order.stage === "balance_due" ? (
                      <>
                        <T weight={order.overdue ? "bold" : "regular"} style={{ fontSize: 14, lineHeight: 20, color: order.overdue ? colors.danger : colors.inkSoft }}>
                          {balanceDueText({ dueKobo: order.dueKobo ?? 0, balanceDueOn: order.balanceDueOn ?? null, overdue: Boolean(order.overdue) }, naira, now, t)}
                        </T>
                        <ButtonRow labels={order.overdue ? [t("preorders.markPaid"), t("preorders.cancelUnpaid")] : [t("preorders.markPaid")]} size="sm">
                          <PillButton size="sm" tone="white" accessibilityLabel={t("preorders.markPaid")} busy={busy === `balance_paid:${order.id}`} disabled={Boolean(busy)} onPress={() => void settle(order, "balance_paid")}>
                            <OneLine text={t("preorders.markPaid")} size={15} />
                          </PillButton>
                          {order.overdue ? (
                            <PillButton size="sm" tone="white" accessibilityLabel={t("preorders.cancelUnpaid")} disabled={Boolean(busy)} onPress={() => setCancelling(order)}>
                              <OneLine text={t("preorders.cancelUnpaid")} size={15} color={colors.danger} />
                            </PillButton>
                          ) : null}
                        </ButtonRow>
                      </>
                    ) : null}
                  </View>
                }
                onPress={() => router.push({ pathname: "/order/[id]", params: { id: order.id } })}
              />
            ))}
          </List>
        </View>
      ))}

      {asking ? (
        <Sheet visible onClose={() => { setAsking(null); setEndToo(false); }} title={t("preorders.confirmTitle")}>
          {asking.waiting > 0 ? <T style={{ fontSize: 16, lineHeight: 23 }}>{t("preorders.shopConfirm", { count: asking.waiting, name: asking.name })}</T> : null}
          {toAsk(asking) > 0 ? <T style={{ fontSize: 16, lineHeight: 23 }}>{t("preorders.balanceAskConfirm", { count: toAsk(asking) })}</T> : null}
          {asking.unpaid ? <T style={{ fontSize: 14.5, lineHeight: 21, color: colors.inkSoft }}>{t("preorders.unpaidStay", { count: asking.unpaid })}</T> : null}
          {asking.product?.on ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <T style={{ flex: 1, fontSize: 15.5 }}>{t("preorders.endToo")}</T>
              <Toggle on={endToo} onChange={setEndToo} label={t("preorders.endToo")} />
            </View>
          ) : null}
          <PillButton busy={busy === `ready:${asking.productId}`} accessibilityLabel={t("preorders.confirmYes")} onPress={() => void act(asking, "ready", endToo)}>
            <OneLine text={t("preorders.confirmYes")} color="#FFFFFF" />
          </PillButton>
          <PillButton tone="white" size="md" accessibilityLabel={t("preorders.notYet")} onPress={() => { setAsking(null); setEndToo(false); }}>
            <OneLine text={t("preorders.notYet")} size={16} />
          </PillButton>
        </Sheet>
      ) : null}

      {cancelling ? (
        <Sheet visible onClose={() => setCancelling(null)} title={t("preorders.cancelUnpaid")}>
          <T style={{ fontSize: 16, lineHeight: 23 }}>{t("preorders.cancelUnpaidConfirm", { number: cancelling.orderNumber })}</T>
          <PillButton accessibilityLabel={t("preorders.cancelUnpaidYes")} busy={busy === `cancel_unpaid:${cancelling.id}`} onPress={() => void settle(cancelling, "cancel_unpaid")}>
            <OneLine text={t("preorders.cancelUnpaidYes")} color="#FFFFFF" />
          </PillButton>
          <PillButton tone="white" size="md" accessibilityLabel={t("preorders.notYet")} onPress={() => setCancelling(null)}>
            <OneLine text={t("preorders.notYet")} size={16} />
          </PillButton>
        </Sheet>
      ) : null}
    </>
  );
}

function SupplierPreorders() {
  const t = useT("m_ui");
  const tp = useT("m_money");
  const loaded = useLoad(fetchSellerWholesalePreorders);
  const [paying, setPaying] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const orders = loaded.data?.orders ?? null;
  const now = new Date();

  async function pay(order: SellerWholesalePreorder) {
    setPaying(order.id);
    setNotice(null);
    try {
      const result = await payWholesaleOrder(order.id);
      setNotice(result.outcome === "paid" ? { tone: "success", text: t("preorders.paidNotice") } : result.outcome === "pending" ? { tone: "info", text: tp("pay.pending") } : { tone: "error", text: tp("pay.cancelled") });
      await loaded.reload();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error && error.message ? error.message : t("preorders.failed") });
    } finally {
      setPaying(null);
    }
  }

  return (
    <>
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      {loaded.loading && !orders ? <LoadingBlock /> : null}
      {loaded.error && !orders ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      {orders && !orders.length ? (
        <Card style={{ gap: 10, alignItems: "flex-start" }}>
          <T weight="extrabold" style={{ fontSize: 17 }}>{t("preorders.suppliersEmpty")}</T>
          <T style={{ color: colors.inkSoft, lineHeight: 21 }}>{t("preorders.suppliersEmptySub")}</T>
          <PillButton size="sm" accessibilityLabel={t("preorders.findProducts")} onPress={() => router.push("/find")}>
            <OneLine text={t("preorders.findProducts")} color="#FFFFFF" size={15} />
          </PillButton>
        </Card>
      ) : null}
      {orders?.length ? (
        <List>
          {orders.map((order) => {
            const preorder = order.preorder;
            if (!preorder) return null;
            return (
              <Row
                key={order.id}
                lead={<Thumb uri={order.product.image} />}
                title={`${order.quantity} × ${order.product.name}`}
                sub={
                  <View style={{ gap: 8 }}>
                    <T style={{ fontSize: 14, color: colors.inkSoft }}>
                      {[order.supplier.name, preorder.shipsOn ? t("preorder.shipsOn", { date: shipDayText(preorder.shipsOn, now, t) }) : t("preorder.shipsSoon"), naira(order.totalPrice)].join(" · ")}
                    </T>
                    {preorder.depositKobo > 0 ? <T style={{ fontSize: 14, color: colors.inkSoft }}>{paidText(preorder, naira, t)}</T> : null}
                    <Pill tone={STAGE_TONE[preorder.stage]} label={stageText(preorder.stage, t)} />
                    {order.pay ? (
                      <PillButton
                        size="sm"
                        tone="accent"
                        busy={paying === order.id}
                        disabled={Boolean(paying)}
                        accessibilityLabel={payButtonText(order.pay, naira, t)}
                        onPress={() => void pay(order)}
                        style={{ alignSelf: "flex-start" }}
                      >
                        <OneLine text={payButtonText(order.pay, naira, t)} size={15} />
                      </PillButton>
                    ) : null}
                  </View>
                }
                onPress={order.product.slug ? () => router.push({ pathname: "/find/[slug]", params: { slug: order.product.slug } }) : undefined}
              />
            );
          })}
        </List>
      ) : null}
    </>
  );
}
