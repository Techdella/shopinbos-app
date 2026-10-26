import { useState } from "react";
import { View } from "react-native";
import { naira } from "@shared/onboarding";
import { Card, Field, Label, Notice, PillButton, T } from "@/components/ui";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { useLoad } from "@/lib/useLoad";
import { ApiError } from "@/lib/api";
import { useLocale, useT } from "@/lib/i18n";
import { fetchWalletBalance, withdrawFromWallet } from "@/lib/wallet";
import { colors } from "@/theme";

// The prepaid wallet on the phone (twin of the web's src/components/wallet/WalletBalanceCard.tsx): the balance,
// withdraw to their bank, and what moved. Only shown when EXPO_PUBLIC_PREPAID_BALANCE=true (off in store builds).
// Nothing here adds money, emails how to, or links to the website: the balance pays for Shopinbos services (digital
// goods), which the app can't sell or point to outside the stores' own billing (Google Play Payments, Apple 3.1.1
// and 3.1.3; docs/store-payments-audit.md). Sales don't come here: they go straight to the bank.

export function WalletBalanceCard() {
  const t = useT("m_money");
  const locale = useLocale();
  const loaded = useLoad(fetchWalletBalance);
  const [withdrawing, setWithdrawing] = useState(false);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<"withdraw" | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const view = loaded.data;
  if (loaded.loading && !view) return <LoadingBlock />;
  if (!view) return loaded.error ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null;

  const failed = (error: unknown) => setMessage({ tone: "error", text: error instanceof ApiError ? error.message : t("bal.failed") });

  const withdraw = async () => {
    setBusy("withdraw");
    setMessage(null);
    try {
      const result = await withdrawFromWallet(Number(amount.replace(/[^\d]/g, "")));
      setMessage({ tone: "success", text: result.status === "done" ? t("bal.sent") : t("bal.onItsWay") });
      setWithdrawing(false);
      setAmount("");
      void loaded.reload();
    } catch (error) {
      failed(error);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card style={{ gap: 12 }}>
      <T style={{ color: colors.inkSoft, fontSize: 13 }}>{t("bal.title")}</T>
      <T weight="extrabold" style={{ fontSize: 34 }}>{naira(view.balanceNaira)}</T>
      <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("bal.sub")}</T>
      <PillButton size="md" tone="white" title={t("bal.withdraw")} disabled={busy !== null || !view.ready || !view.canWithdraw || view.balanceNaira < view.limits.withdrawMin} onPress={() => setWithdrawing(!withdrawing)} />
      {withdrawing ? (
        <View style={{ gap: 10 }}>
          <Label>{view.bank ? t("bal.amountTo", { bank: view.bank }) : t("bal.amountToYours")}</Label>
          <Field value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder={t("bal.orMore", { amount: naira(view.limits.withdrawMin) })} accessibilityLabel={t("bal.amount")} />
          <PillButton tone="accent" title={t("bal.withdraw")} busy={busy === "withdraw"} disabled={busy !== null || !amount} onPress={() => void withdraw()} />
        </View>
      ) : null}
      {!view.canWithdraw && view.balanceNaira > 0 ? <T style={{ color: colors.inkSoft, fontSize: 13 }}>{t("bal.needBank")}</T> : null}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
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
