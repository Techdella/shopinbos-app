import { View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { DarkCard, Eyebrow, List, Row, Small, Sub, Tile } from "@/components/design";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { LanguageRow } from "@/components/LanguagePicker";
import { orderAmount, orderItems } from "@/components/SupplierOrderRow";
import { TabScreen } from "@/components/TabScreen";
import { T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { fetchSupplierOrders, fetchSupplierOverview, type SupplierOrder } from "@/lib/supplier";
import { orderKindLabel, supplierOrderStage } from "@/lib/supplier-pure";
import { useLoad } from "@/lib/useLoad";
import { fetchWallet, nairaFromKobo } from "@/lib/wallet";
import { colors } from "@/theme";

// Supplier Money ("Simple app, end to end" supplier prototype): the dark "Coming to your bank" card (paid by shops,
// waiting for delivery to be confirmed) with the bank it goes to, a line on how the money moves, and "Recent":
// what Paystack paid into the bank (wallet entries) or, before any, the finished orders. The Shopinbos Wallet
// (bank, payouts, money owed between businesses) opens from here; business settings moved to Account (gear on Home).

export default function SupplierMoney() {
  const t = useT("m_supplier", "m_partner", "common");
  const loaded = useLoad(async () => {
    const [overview, wallet, done] = await Promise.all([fetchSupplierOverview(), fetchWallet().catch(() => null), fetchSupplierOrders("done").catch(() => null)]);
    const orders = done ? ([...done.dropship, ...done.wholesale] as SupplierOrder[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8) : [];
    return { overview, entries: wallet?.view.entries.slice(0, 8) ?? [], orders };
  });
  const data = loaded.data;
  const bank = data?.overview.bank;

  return (
    <TabScreen title={t("money.title")} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
      {loaded.loading && !data ? <LoadingBlock label={t("money.loading")} /> : null}
      {loaded.error && !data ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      {data ? (
        <>
          <DarkCard
            eyebrow={t("home.coming")}
            amount={naira(data.overview.owed ?? 0)}
            line={bank ? t(bank.ready ? "money.bankLine" : "money.bankChecking", { bank: bank.bankName, account: bank.account }) : t("money.noBank")}
            onPress={() => router.push(bank ? "/supplier/wallet" : { pathname: "/supplier/setup", params: { edit: "bank" } })}
          />
          <Small style={{ marginTop: -6 }}>{t("money.howItMoves")}</Small>

          <View style={{ gap: 10 }}>
            <Eyebrow>{t("money.recent")}</Eyebrow>
            {data.entries.length ? (
              <List>
                {data.entries.map((entry) => (
                  <Row
                    key={entry.id}
                    lead={<Tile icon="coin" tone="ok" />}
                    title={entry.description}
                    sub={`${new Date(entry.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}${bank ? ` · ${t("money.paidTo", { bank: bank.bankName })}` : ""}`}
                    right={<T weight="extrabold" style={{ fontSize: 15, color: entry.status === "refunded" ? colors.inkSoft : colors.success }}>+{nairaFromKobo(entry.amountKobo)}</T>}
                  />
                ))}
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
              <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 18, gap: 4 }}>
                <T weight="bold" style={{ fontSize: 16 }}>{t("money.none")}</T>
                <Sub>{t("money.noneBody")}</Sub>
              </View>
            )}
          </View>

          <List>
            <Row lead={<Tile icon="wallet" tone="gray" />} title={t("money.openWallet")} sub={t("money.walletHint")} onPress={() => router.push("/supplier/wallet")} />
            <Row lead={<Tile icon="settings" tone="gray" />} title={t("money.account")} sub={t("money.accountHint")} onPress={() => router.push("/supplier/account")} />
          </List>
          <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 16, paddingVertical: 2 }}>
            <LanguageRow first />
          </View>
        </>
      ) : null}
    </TabScreen>
  );
}
