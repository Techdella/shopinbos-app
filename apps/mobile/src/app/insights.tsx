import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { Eyebrow } from "@/components/design";
import { ChipRow, EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Thumb } from "@/components/seller/bits";
import { Card, Chip, Mascot, T } from "@/components/ui";
import { fetchInsights } from "@/lib/grow";
import { conversionTrend, INSIGHT_RANGES, percent, trend, type InsightNumber, type InsightRange, type Insights } from "@/lib/grow-pure";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Insights (canvas board M-Insights; the web's /home/analytics, cut down): Today / 7 days / 30 days; sales, orders,
// store visits and visits that bought, each with how it moved against the period before; where visitors came from;
// the best sellers; and Peggy's line on the biggest source. Numbers come from GET /api/mobile/insights, the same
// loader as the web page.

const RANGE_LABEL: Record<InsightRange, "insights.today" | "insights.7d" | "insights.30d"> = { today: "insights.today", "7d": "insights.7d", "30d": "insights.30d" };

function Stat({ testID, label, value, line }: { testID: string; label: string; value: string; line: string }) {
  return (
    <Card style={{ flex: 1, minWidth: 0, gap: 2 }}>
      <View testID={testID}>
        <T style={{ fontSize: 13, color: colors.inkSoft }} numberOfLines={1}>{label}</T>
        <T weight="extrabold" style={{ fontSize: 22, lineHeight: 28 }} numberOfLines={1} adjustsFontSizeToFit>{value}</T>
        <T style={{ fontSize: 13, color: colors.inkSoft }} numberOfLines={2}>{line}</T>
      </View>
    </Card>
  );
}

export default function InsightsScreen() {
  const t = useT("m_grow");
  const [range, setRange] = useState<InsightRange>("7d");
  const data = useLoad(() => fetchInsights(range), range);
  const insights: Insights | null = data.data;

  /** "Up ₦94,500", "Down 6", "Same as before". */
  const moved = (number: InsightNumber, show: (n: number) => string) => {
    const way = trend(number.diff);
    if (way === "up") return t("insights.up", { amount: show(number.diff) });
    if (way === "down") return t("insights.down", { amount: show(-number.diff) });
    return t("insights.same");
  };
  const count = (n: number) => n.toLocaleString("en-NG");

  return (
    <Screen title={t("insights.title")} refreshing={data.refreshing} onRefresh={() => void data.refresh()}>
      <ChipRow>
        {INSIGHT_RANGES.map((key) => <Chip key={key} label={t(RANGE_LABEL[key])} on={range === key} onPress={() => setRange(key)} />)}
      </ChipRow>

      {data.loading && !insights ? <LoadingBlock /> : null}
      {data.error && !insights ? <ErrorState message={data.error} onRetry={() => void data.reload()} /> : null}
      {insights ? (
        <>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Stat testID="insights-sales" label={t("insights.sales")} value={naira(insights.sales.value)} line={moved(insights.sales, naira)} />
              <Stat testID="insights-orders" label={t("insights.orders")} value={count(insights.orders.value)} line={moved(insights.orders, count)} />
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Stat testID="insights-visits" label={t("insights.visits")} value={count(insights.visits.value)} line={insights.visitsCounted ? moved(insights.visits, count) : t("insights.notCounted")} />
              <Stat
                testID="insights-conversion"
                label={t("insights.conversion")}
                value={percent(insights.conversion.value)}
                line={(() => {
                  const way = conversionTrend(insights.conversion);
                  if (way === "none") return insights.conversion.value == null ? t("insights.noVisits") : t("insights.noBefore");
                  return way === "same" ? t("insights.same") : t(way === "up" ? "insights.upFrom" : "insights.downFrom", { before: percent(insights.conversion.previous) });
                })()}
              />
            </View>
          </View>

          <View style={{ gap: 10 }}>
            <Eyebrow>{t("insights.sources")}</Eyebrow>
            {insights.sources.length ? (
              <Card style={{ gap: 12 }}>
                {insights.sources.map((source) => (
                  <View key={source.key} testID={`insights-source-${source.key}`} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <T weight="semibold" style={{ width: 128, fontSize: 13.5 }} numberOfLines={1}>{source.key === "other" ? t("insights.other") : source.label}</T>
                    <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.line, overflow: "hidden" }}>
                      <View style={{ width: `${Math.max(2, Math.round(source.share * 100))}%`, height: 8, borderRadius: 4, backgroundColor: colors.inkFill }} />
                    </View>
                    <T weight="bold" style={{ width: 44, textAlign: "right", fontSize: 14 }}>{percent(source.share)}</T>
                  </View>
                ))}
              </Card>
            ) : (
              <T style={{ fontSize: 15, lineHeight: 22, color: colors.inkSoft }}>{insights.visitsCounted ? t("insights.noSources") : t("insights.notCounted")}</T>
            )}
          </View>

          <View style={{ gap: 10 }}>
            <Eyebrow>{t("insights.best")}</Eyebrow>
            {insights.bestSellers.length ? (
              <Card style={{ gap: 4, paddingVertical: 8 }}>
                {insights.bestSellers.map((product) => (
                  <Pressable
                    key={product.key}
                    accessibilityRole={product.productId ? "button" : undefined}
                    disabled={!product.productId}
                    onPress={() => (product.productId ? router.push({ pathname: "/product/[id]", params: { id: product.productId } }) : undefined)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52 }}
                  >
                    <Thumb uri={product.image} size={40} radius={12} />
                    <T weight="bold" style={{ flex: 1, fontSize: 15 }} numberOfLines={1}>{product.name}</T>
                    <T style={{ fontSize: 14, color: colors.inkSoft }}>{t("insights.sold", { count: product.quantity })}</T>
                  </Pressable>
                ))}
              </Card>
            ) : (
              <EmptyState icon="chart" title={t("insights.noSales")} />
            )}
          </View>

          {/* Peggy on the biggest source (board M-Insights). */}
          {insights.sources[0] && insights.sources[0].key !== "other" ? (
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
              <Mascot name="peggy" size={36} label="" />
              <View style={{ flex: 1, minWidth: 0, backgroundColor: colors.surface, borderRadius: 18, borderTopLeftRadius: 6, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 12 }}>
                <T style={{ fontSize: 15, lineHeight: 21 }}>{t("insights.peggy", { source: insights.sources[0].label, share: percent(insights.sources[0].share) })}</T>
              </View>
            </View>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
