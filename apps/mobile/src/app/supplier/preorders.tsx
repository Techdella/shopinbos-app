import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { List, Pill, Row, type PillTone } from "@/components/design";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { OneLine } from "@/components/Preorder";
import { Screen } from "@/components/Screen";
import { Sheet } from "@/components/Sheet";
import { Pic } from "@/components/SupplierKit";
import { Card, Notice, PillButton, T, Toggle } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { paidText, shipDayText, stageText, type PreorderStage } from "@/lib/preorder-pure";
import { fetchSupplierPreorders, supplierPreorderAction, type SupplierPreorderGroup } from "@/lib/preorders";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// The supplier's preorders (web /supplier/preorders; server src/lib/supplier-orders/preorders.server.ts): one card
// per product with its ship date, units ordered against the cap, how many shops, what's paid and still due, and each
// shop's order (opens it). "Stock is ready" asks first, then tells every shop with an open preorder: it ships now, or
// pay the rest when there's a deposit. "End preorders" stops new ones. Reached from Orders (the Preorders chip) and
// from a product's Preorders row.

const STAGE_TONE: Record<PreorderStage, PillTone> = { waiting: "warn", pay_balance: "org", ready: "ok", shipped: "teal", delivered: "ok", cancelled: "gray" };

export default function SupplierPreorders() {
  const t = useT("m_ui");
  const loaded = useLoad(fetchSupplierPreorders);
  const [groups, setGroups] = useState<SupplierPreorderGroup[] | null>(null);
  const [asking, setAsking] = useState<SupplierPreorderGroup | null>(null);
  const [endToo, setEndToo] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const shown = groups ?? loaded.data?.groups ?? null;
  const now = new Date();

  async function act(group: SupplierPreorderGroup, action: "ready" | "end", end?: boolean) {
    setBusy(`${action}:${group.product.id}`);
    setNotice(null);
    try {
      const result = await supplierPreorderAction(group.product.id, action, end);
      setGroups(result.groups);
      setNotice({
        tone: "success",
        text: action === "ready" ? [t("preorders.readyDone", { count: result.marked ?? 0 }), result.ended ? t("preorders.endedDone") : null].filter(Boolean).join(" ") : t("preorders.endedDone"),
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
    <Screen title={t("preorders.title")} sub={t("preorders.supplierSub")} refreshing={loaded.refreshing} onRefresh={() => { setGroups(null); void loaded.refresh(); }} fallback="/supplier/orders">
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      {loaded.loading && !shown ? <LoadingBlock /> : null}
      {loaded.error && !shown ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      {shown && !shown.length ? (
        <Card style={{ gap: 6 }}>
          <T weight="extrabold" style={{ fontSize: 17 }}>{t("preorders.emptyTitle")}</T>
          <T style={{ color: colors.inkSoft, lineHeight: 21 }}>{t("preorders.supplierEmpty")}</T>
        </Card>
      ) : null}
      {shown?.map((group) => {
        const facts = [
          group.product.shipsOn ? t("preorder.shipsOn", { date: shipDayText(group.product.shipsOn, now, t) }) : t("preorder.shipsSoon"),
          group.product.limit ? t("preorders.unitsOfCap", { units: group.units, limit: group.product.limit }) : t("preorders.units", { count: group.units }),
          t("preorders.shops", { count: group.shops }),
          group.product.depositPct ? t("preorders.depositPct", { pct: group.product.depositPct }) : null,
        ].filter(Boolean);
        return (
          <View key={group.product.id} style={{ gap: 10 }}>
            <Card style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                <Pic uri={group.product.image} size={56} />
                <View style={{ flex: 1, gap: 4 }}>
                  <T weight="extrabold" style={{ fontSize: 17 }} numberOfLines={2}>{group.product.name}</T>
                  <Pill tone={group.product.on ? "warn" : "gray"} label={group.product.on ? t("preorders.taking") : t("preorders.stopped")} />
                </View>
              </View>
              <T style={{ color: colors.inkSoft, fontSize: 14.5, lineHeight: 21 }}>{facts.join(" · ")}</T>
              {group.product.depositPct > 0 || group.paidKobo > 0 ? (
                <T weight="bold" style={{ fontSize: 14.5 }}>
                  {[t("preorders.paidSoFar", { amount: naira(group.paidKobo / 100) }), group.dueKobo > 0 ? t("preorders.stillDue", { amount: naira(group.dueKobo / 100) }) : null].filter(Boolean).join(" · ")}
                </T>
              ) : null}
              {group.waiting > 0 ? (
                <PillButton size="md" busy={busy === `ready:${group.product.id}`} disabled={Boolean(busy)} accessibilityLabel={t("preorders.stockReady")} onPress={() => setAsking(group)}>
                  <OneLine text={t("preorders.stockReady")} color="#FFFFFF" size={16} />
                </PillButton>
              ) : group.orders.length ? (
                <T style={{ color: colors.success, fontSize: 14.5 }}>{t("preorders.allReady")}</T>
              ) : null}
              {group.product.on ? (
                <PillButton size="sm" tone="white" busy={busy === `end:${group.product.id}`} disabled={Boolean(busy)} accessibilityLabel={t("preorders.end")} onPress={() => void act(group, "end")}>
                  <OneLine text={t("preorders.end")} size={15} />
                </PillButton>
              ) : null}
            </Card>
            {group.orders.length ? (
              <List>
                {group.orders.map((order) => (
                  <Row
                    key={order.id}
                    title={t("preorders.shopQty", { shop: order.shop, count: order.quantity })}
                    sub={
                      <View style={{ gap: 6 }}>
                        <T style={{ fontSize: 14, color: colors.inkSoft }}>{`${naira(order.totalKobo / 100)} · ${paidText(order, naira, t)}`}</T>
                        <Pill tone={STAGE_TONE[order.stage]} label={stageText(order.stage, t)} />
                      </View>
                    }
                    onPress={() => router.push({ pathname: "/supplier/order/[id]", params: { id: order.id, kind: "wholesale" } })}
                  />
                ))}
              </List>
            ) : (
              <T style={{ color: colors.inkSoft, fontSize: 14, paddingHorizontal: 4 }}>{t("preorders.noOrders")}</T>
            )}
          </View>
        );
      })}

      {asking ? (
        <Sheet visible onClose={() => { setAsking(null); setEndToo(false); }} title={t("preorders.confirmTitle")}>
          <T style={{ fontSize: 16, lineHeight: 23 }}>
            {asking.product.depositPct ? t("preorders.confirmDeposit", { count: asking.waiting, name: asking.product.name }) : t("preorders.confirm", { count: asking.waiting, name: asking.product.name })}
          </T>
          {asking.product.on ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <T style={{ flex: 1, fontSize: 15.5 }}>{t("preorders.endToo")}</T>
              <Toggle on={endToo} onChange={setEndToo} label={t("preorders.endToo")} />
            </View>
          ) : null}
          <PillButton busy={busy === `ready:${asking.product.id}`} accessibilityLabel={t("preorders.confirmYes")} onPress={() => void act(asking, "ready", endToo)}>
            <OneLine text={t("preorders.confirmYes")} color="#FFFFFF" />
          </PillButton>
          <PillButton tone="white" size="md" accessibilityLabel={t("preorders.notYet")} onPress={() => { setAsking(null); setEndToo(false); }}>
            <OneLine text={t("preorders.notYet")} size={16} />
          </PillButton>
        </Sheet>
      ) : null}
    </Screen>
  );
}
