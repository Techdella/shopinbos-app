import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { AppearanceRow } from "@/components/AppearancePicker";
import { Eyebrow, List, Row, Small, Sub, Tile } from "@/components/design";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { LanguageRow } from "@/components/LanguagePicker";
import { orderAmount, orderItems } from "@/components/SupplierOrderRow";
import { TabScreen } from "@/components/TabScreen";
import { MiniBars, StatCard } from "@/components/visual";
import { trailingTotals, trailingWeekdays } from "@/lib/visual-pure";
import { T, WithTip } from "@/components/ui";
import { upcomingPayout } from "@/lib/delivery-pure";
import { friendlyDay } from "@/lib/friendly";
import { useT } from "@/lib/i18n";
import { fetchSupplierOrders, fetchSupplierOverview, type SupplierOrder } from "@/lib/supplier";
import { orderKindLabel, supplierOrderStage, weekSummary } from "@/lib/supplier-pure";
import { useLoad } from "@/lib/useLoad";
import { fetchWallet, nairaFromKobo } from "@/lib/wallet";
import { colors, surfaceCard } from "@/theme";

// Supplier Money ("Familiar app" supplier prototype `money`, without withdrawing): Paystack splits each payment and
// sends the supplier's share straight to their bank, so there's no balance to withdraw. The dark "Coming to your
// bank" card (paid by shops, waiting for delivery to be confirmed) with the day the next payment lands, the mint
// "This week" total, the bank it goes to with Change, and "Recent": what Paystack paid in (wallet entries) or,
// before any, the finished orders. The Shopinbos Wallet and Account stay one tap away, and the app language.
// "To be paid": the split pays the supplier at checkout and Paystack settles it the next working day (no Friday run).
// Money taken for what the supplier owes (who pays when things go wrong) shows as its own line: "−₦14,250 deducted
// for order SB-1001: wrong or damaged item, the packing photo showed it".

export default function SupplierMoney() {
  const t = useT("m_supplier", "m_partner", "m_ui", "common");
  const f = useT("m_faults");
  const loaded = useLoad(async () => {
    const [overview, wallet, done] = await Promise.all([fetchSupplierOverview(), fetchWallet().catch(() => null), fetchSupplierOrders("done").catch(() => null)]);
    const finished = done ? ([...done.dropship, ...done.wholesale] as SupplierOrder[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];
    const allEntries = wallet?.view.entries ?? [];
    const weekOrders = finished.map((order) => ({ status: order.status, createdAt: order.createdAt, amount: orderAmount(order) }));
    const week = weekSummary(allEntries, weekOrders);
    return {
      overview,
      wallet,
      entries: allEntries.slice(0, 8),
      orders: finished.slice(0, 8),
      week,
      // The same money a day: what Paystack paid in, or before any, the delivered orders (as weekSummary counts it).
      days: trailingTotals(
        allEntries.length
          ? allEntries.filter((entry) => entry.status !== "refunded" && entry.amountKobo > 0).map((entry) => ({ at: entry.createdAt, amount: entry.amountKobo / 100 }))
          : weekOrders.filter((order) => order.status === "delivered").map((order) => ({ at: order.createdAt, amount: Number(order.amount) || 0 })),
        7,
        week.amount,
      ),
      next: upcomingPayout(wallet?.view.settlements),
    };
  });
  const data = loaded.data;
  const bank = data?.overview.bank;
  const owner = data?.wallet?.view.bank?.accountName;
  const day = data?.next?.date ? friendlyDay(data.next.date, new Date(), t) : null;
  const dayLabels = trailingWeekdays(7).map((weekday) => t(`wk.${weekday}` as "wk.0"));
  const editBank = () => router.push({ pathname: "/supplier/setup", params: { edit: "bank" } });

  return (
    <TabScreen title={t("money.title")} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
      {loaded.loading && !data ? <LoadingBlock label={t("money.loading")} /> : null}
      {loaded.error && !data ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      {data ? (
        <>
          <View accessible accessibilityLabel={`${f("money.toBePaid")} ${naira(data.overview.owed ?? 0)}. ${day ? f("money.paidOn", { day }) : f("money.paidNextDay")}`}>
            <StatCard tone="dark" icon="wallet" label={f("money.toBePaid")} value={naira(data.overview.owed ?? 0)} line={day ? f("money.paidOn", { day }) : f("money.paidNextDay")} />
          </View>

          {/* This week: the total big, and a bar a day (today lit) when the days add up to it. */}
          <View accessible accessibilityLabel={`${t("money.thisWeek")} ${naira(data.week.amount)}, ${t("money.weekOrders", { count: data.week.count })}`}>
            <StatCard
              icon="chart"
              label={t("money.thisWeek")}
              value={naira(data.week.amount)}
              line={t("money.weekOrders", { count: data.week.count })}
              chart={data.days.complete && data.week.amount > 0 ? <MiniBars values={data.days.totals} labels={dayLabels} accessibilityLabel={t("chart.lastDays", { days: data.days.totals.map((amount, index) => `${dayLabels[index]} ${naira(amount)}`).join(", ") })} /> : null}
            />
          </View>

          <List>
            <Row
              lead={<Tile icon="wallet" tone="gray" />}
              title={bank ? `${bank.bankName} ${bank.account}` : t("money.noBank")}
              sub={bank ? owner || t(bank.ready ? "money.bankReady" : "money.bankChecking2") : t("home.addBankSub")}
              right={
                <Pressable accessibilityRole="button" accessibilityLabel={bank ? t("money.changeBank") : t("home.addBank")} onPress={editBank} hitSlop={8} style={({ pressed }) => ({ minHeight: 44, minWidth: 44, paddingHorizontal: 6, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 })}>
                  <T weight="bold" style={{ fontSize: 15, color: colors.forest }}>{bank ? t("money.change") : t("money.add")}</T>
                </Pressable>
              }
              onPress={bank ? () => router.push("/supplier/wallet") : editBank}
            />
          </List>
          <WithTip title={t("moneyCard.noteTitle")} tip={{ text: t("money.howItMoves") }} style={{ marginTop: -6 }}>
            <Small>{t("money.howItMovesShort")}</Small>
          </WithTip>

          <View style={{ gap: 10 }}>
            <Eyebrow>{t("money.recent")}</Eyebrow>
            {data.entries.length ? (
              <List>
                {data.entries.map((entry) => {
                  // Taken for what the supplier owes: its own line, with why (shared/money-owed.ts deductionLine).
                  const deducted = entry.kind === "deduction";
                  return (
                    <Row
                      key={entry.id}
                      lead={<Tile icon={deducted ? "receipt" : "coin"} tone={deducted ? "peach" : "ok"} />}
                      title={deducted ? <T weight="bold" style={{ fontSize: 15, lineHeight: 20 }}>{entry.description}</T> : entry.description}
                      sub={`${friendlyDay(entry.createdAt, new Date(), t)}${deducted ? ` · ${f("money.deductedSub")}` : bank ? ` · ${t("money.paidTo", { bank: bank.bankName })}` : ""}`}
                      right={<T weight="extrabold" style={{ fontSize: 15, color: deducted ? colors.danger : entry.status === "refunded" ? colors.inkSoft : colors.success }}>{deducted ? `−${nairaFromKobo(Math.abs(entry.amountKobo))}` : `+${nairaFromKobo(entry.amountKobo)}`}</T>}
                    />
                  );
                })}
              </List>
            ) : data.orders.length ? (
              <List>
                {data.orders.map((order) => (
                  <Row
                    key={`${order.kind}-${order.id}`}
                    lead={<Tile icon="coin" tone={order.status === "delivered" ? "ok" : "gray"} />}
                    title={order.shop}
                    sub={`${orderKindLabel(order.kind, t)} · ${orderItems(order)} · ${supplierOrderStage(order.status, t)}`}
                    right={<T weight="extrabold" style={{ fontSize: 15, color: order.status === "delivered" ? colors.success : colors.inkSoft }}>{order.status === "delivered" ? "+" : ""}{naira(orderAmount(order))}</T>}
                  />
                ))}
              </List>
            ) : (
              <View style={{ ...surfaceCard(), padding: 18, gap: 4 }}>
                <T weight="bold" style={{ fontSize: 16 }}>{t("money.none")}</T>
                <Sub>{t("money.noneBody")}</Sub>
              </View>
            )}
          </View>

          <List>
            <Row lead={<Tile icon="wallet" tone="gray" />} title={t("money.openWallet")} sub={t("money.walletHint")} onPress={() => router.push("/supplier/wallet")} />
            <Row lead={<Tile icon="settings" tone="gray" />} title={t("money.account")} sub={t("money.accountHint")} onPress={() => router.push("/supplier/account")} />
          </List>
          <View style={{ ...surfaceCard(), paddingHorizontal: 16, paddingVertical: 2 }}>
            <LanguageRow first />
            <AppearanceRow />
          </View>
        </>
      ) : null}
    </TabScreen>
  );
}
