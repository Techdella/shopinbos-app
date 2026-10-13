import { View } from "react-native";
import { naira } from "@shared/onboarding";
import { HelpButton } from "@/components/Help";
import { LanguageRow } from "@/components/LanguagePicker";
import { EmptyState, ErrorState, LinkRow, LoadingBlock } from "@/components/kit";
import { confirmSignOut, Thumb } from "@/components/partner";
import { TabScreen } from "@/components/TabScreen";
import { Card, LinkButton, PillButton, T } from "@/components/ui";
import { router } from "expo-router";
import { capitalise } from "@/lib/friendly";
import { useT } from "@/lib/i18n";
import { dayWord } from "@/lib/partner-pure";
import { fetchSupplierOrders, fetchSupplierOverview, type SupplierOrder } from "@/lib/supplier";
import { supplierOrderStage } from "@/lib/supplier-pure";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors } from "@/theme";

// Supplier Money (build spec 8A): what's coming to the bank, where it goes, recent orders, and the rows that used to
// be on More (verification, quotes, profile, team, settings). The bank form itself is on the web for now.

function orderTitle(order: SupplierOrder) {
  return order.kind === "dropship" ? order.items.map((item) => (item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name)).join(", ") : `${order.product.name} ×${order.quantity.toLocaleString("en-NG")}`;
}

export default function SupplierMoney() {
  const t = useT("m_supplier", "m_partner", "common");
  const loaded = useLoad(async () => {
    const [overview, done] = await Promise.all([fetchSupplierOverview(), fetchSupplierOrders("done").catch(() => null)]);
    return { overview, recent: done ? [...done.dropship, ...done.wholesale].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8) : [] };
  });
  const data = loaded.data;

  return (
    <TabScreen title={t("money.title")} action={<HelpButton />} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
      {loaded.loading && !data ? <LoadingBlock label={t("money.loading")} /> : null}
      {loaded.error && !data ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      {data ? (
        <View style={{ gap: 14 }}>
          <Card style={{ gap: 8 }}>
            <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t("earned")}</T>
            <T weight="extrabold" style={{ fontSize: 34, letterSpacing: -0.8 }}>{naira(data.overview.earned)}</T>
            <T style={{ fontSize: 15, lineHeight: 21, color: colors.inkSoft }}>
              {data.overview.bank
                ? t(data.overview.bank.ready ? "money.payoutsTo" : "money.payoutsToChecking", { bank: data.overview.bank.bankName, account: data.overview.bank.account })
                : t("money.addBankFirst")}
            </T>
            <T style={{ fontSize: 15, lineHeight: 21 }}>{t("escrow")}</T>
            <PillButton title={data.overview.bank ? t("money.seePayouts") : t("money.addBank")} tone={data.overview.bank ? "white" : "ink"} style={{ marginTop: 6 }} onPress={() => void openWeb("/supplier/payouts")} />
            <T style={{ color: colors.inkSoft, fontSize: 14, textAlign: "center" }}>{t("opensInBrowser")}</T>
          </Card>

          <T weight="extrabold" style={{ fontSize: 17 }} accessibilityRole="header">{t("money.recent")}</T>
          {data.recent.length ? (
            <Card style={{ paddingVertical: 4 }}>
              {data.recent.map((order, index) => (
                <View key={order.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
                  <Thumb uri={order.kind === "dropship" ? order.items[0]?.image : order.product.image} size={40} />
                  <View style={{ flex: 1 }}>
                    <T weight="bold" style={{ fontSize: 15 }} numberOfLines={1}>{orderTitle(order)}</T>
                    <T style={{ color: colors.inkSoft, fontSize: 14.5 }} numberOfLines={1}>{order.shop} · {supplierOrderStage(order.status, t).toLowerCase()} · {capitalise(dayWord(order.createdAt, undefined, t))}</T>
                  </View>
                  <T weight="extrabold" style={{ fontSize: 15 }}>{naira(order.kind === "dropship" ? order.yourTotal : order.total)}</T>
                </View>
              ))}
            </Card>
          ) : (
            <EmptyState icon="coin" title={t("money.none")}>{t("money.noneBody")}</EmptyState>
          )}

          <T weight="extrabold" style={{ fontSize: 17 }} accessibilityRole="header">{t("money.business")}</T>
          <Card style={{ paddingVertical: 2 }}>
            <LinkRow first icon="shield" label={t("money.verification")} hint={t("money.verificationHint")} onPress={() => router.push("/supplier/verification")} />
            <LinkRow icon="chat" label={t("messagesWithShops")} onPress={() => router.push("/supplier/messages")} />
            <LinkRow icon="tag" label={t("money.quotes")} hint={t("money.quotesHint")} onPress={() => router.push("/supplier/quotes")} />
            <LinkRow icon="coin" label={t("money.tiers")} hint={t("opensInBrowser")} onPress={() => void openWeb("/supplier/wholesale")} />
            <LinkRow icon="store" label={t("money.profile")} hint={t("money.profileHint")} onPress={() => void openWeb("/supplier/profile")} />
            <LinkRow icon="users" label={t("money.team")} hint={t("money.teamHint")} onPress={() => void openWeb("/supplier/team")} />
            <LinkRow icon="settings" label={t("settings")} hint={t("money.settingsHint")} onPress={() => void openWeb("/supplier/settings")} />
            <LanguageRow />
            <LinkRow icon="help" label={t("help")} hint={t("money.helpHint")} onPress={() => router.push("/help")} />
          </Card>
          <LinkButton title={t("logOut")} color={colors.danger} onPress={() => confirmSignOut()} />
        </View>
      ) : null}
    </TabScreen>
  );
}
