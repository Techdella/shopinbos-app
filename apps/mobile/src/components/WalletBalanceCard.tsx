import { View } from "react-native";
import { naira } from "@shared/onboarding";
import { Card, T } from "@/components/ui";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { useLoad } from "@/lib/useLoad";
import { useLocale, useT } from "@/lib/i18n";
import { fetchWalletBalance, WALLET_ACCOUNT_IN_APP } from "@/lib/wallet";
import { WalletAccountNumber } from "@/components/WalletAccountNumber";
import { colors } from "@/theme";

// The prepaid wallet on the phone (twin of the web's src/components/wallet/WalletBalanceCard.tsx): the balance and
// what moved. Spend-only: it pays for Shopinbos services and is never withdrawn. Only shown when
// EXPO_PUBLIC_PREPAID_BALANCE=true (off in store builds).
// Nothing here adds money, emails how to, or links to the website: the balance pays for Shopinbos services (digital
// goods), which the app can't sell or point to outside the stores' own billing (Google Play Payments, Apple 3.1.1
// and 3.1.3; docs/store-payments-audit.md). Sales don't come here: they go straight to the bank.

export function WalletBalanceCard() {
  const t = useT("m_money");
  const locale = useLocale();
  const loaded = useLoad(fetchWalletBalance);
  const view = loaded.data;
  if (loaded.loading && !view) return <LoadingBlock />;
  if (!view) return loaded.error ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null;

  return (
    <Card style={{ gap: 12 }}>
      <T style={{ color: colors.inkSoft, fontSize: 13 }}>{t("bal.title")}</T>
      <T weight="extrabold" style={{ fontSize: 34 }}>{naira(view.balanceNaira)}</T>
      <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("bal.sub")}</T>
      {WALLET_ACCOUNT_IN_APP ? <WalletAccountNumber view={view} /> : null}
      {view.transactions.slice(0, 10).map((tx) => (
        <View key={tx.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 }}>
          <View style={{ flex: 1 }}>
            <T weight="bold" style={{ fontSize: 14 }} numberOfLines={1}>{tx.description}</T>
            <T style={{ color: colors.inkSoft, fontSize: 12 }}>{new Date(tx.at).toLocaleDateString(locale === "en" ? "en-GB" : locale, { day: "numeric", month: "short" })}{tx.status === "pending" ? ` · ${t("bal.pending")}` : tx.status === "failed" ? ` · ${t("bal.didntGo")}` : ""}</T>
          </View>
          <T weight="extrabold" style={{ color: tx.naira > 0 ? colors.success : colors.ink }}>{tx.naira > 0 ? "+" : "−"}{naira(Math.abs(tx.naira))}</T>
        </View>
      ))}
    </Card>
  );
}
