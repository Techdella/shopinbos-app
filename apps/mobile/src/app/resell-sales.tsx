import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { DarkCard, List, Row, Tile } from "@/components/design";
import { Badge, EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { PillButton, T } from "@/components/ui";
import { View } from "react-native";
import { useFeature } from "@/lib/features";
import { fetchResellSales } from "@/lib/resell";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Resell sales (web /home/resell-sales; pilot "resell"): sales through resellers' links and the commission the shop
// owes each one (reseller names only). The shop pays them; Shopinbos only keeps the record.

const TONE: Record<string, { bg: string; fg: string }> = {
  pending: { bg: colors.mintTint, fg: colors.forest },
  approved: { bg: colors.dangerTint, fg: colors.accentInk },
  paid: { bg: colors.successTint, fg: colors.success },
  void: { bg: colors.canvas, fg: colors.inkSoft },
};

export default function ResellSales() {
  const on = useFeature("resell");
  const t = useT("resell");
  const loaded = useLoad(fetchResellSales);
  const data = loaded.data;

  return (
    <Screen title={t("sales.title")} sub={t("sales.sub")} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
      {!on ? <EmptyState icon="lock" title={t("notReady")} /> : null}
      {on && loaded.loading && !data ? <LoadingBlock /> : null}
      {on && loaded.error && !data ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      {on && data ? (
        <>
          <DarkCard eyebrow={t("sales.owed")} amount={naira(data.totals.owed)} line={`${t("sales.count", { count: data.totals.count })} · ${t("sales.ready")}: ${naira(data.totals.ready)}`} />
          <List>
            <Row lead={<Tile icon="coin" tone="ok" />} title={t("sales.paid")} right={<T weight="extrabold" style={{ fontSize: 16 }}>{naira(data.totals.paid)}</T>} />
          </List>
          {data.sales.length ? (
            <List>
              {data.sales.map((sale) => {
                const tone = TONE[sale.status] ?? TONE.void;
                return (
                  <Row
                    key={sale.id}
                    lead={<Tile icon="link" tone="gray" />}
                    title={sale.resellerName || t("sales.someone")}
                    sub={t("sales.line", { quantity: sale.quantity, product: sale.productName, order: sale.orderNumber ?? "" })}
                    right={
                      <View style={{ alignItems: "flex-end", gap: 4 }}>
                        <T weight="extrabold" style={{ fontSize: 15.5 }}>{naira(sale.commissionAmount)}</T>
                        <Badge label={t.dynamic(`status.${sale.status}`, sale.status)} bg={tone.bg} fg={tone.fg} />
                      </View>
                    }
                    onPress={() => router.push({ pathname: "/order/[id]", params: { id: sale.orderId } })}
                  />
                );
              })}
            </List>
          ) : (
            <EmptyState icon="link" title={t("sales.empty")}>{t("sales.emptySub")}</EmptyState>
          )}
          <PillButton title={t("sales.resellYourself")} tone="white" size="md" onPress={() => router.push("/resell")} />
        </>
      ) : null}
    </Screen>
  );
}
