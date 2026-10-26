import { useState } from "react";
import { View } from "react-native";
import { naira } from "@shared/onboarding";
import { Card, Field, Label, Notice, PillButton, T } from "@/components/ui";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { useLoad } from "@/lib/useLoad";
import { ApiError } from "@/lib/api";
import { useLocale, useT } from "@/lib/i18n";
import { emailWalletTopUp, fetchWalletBalance, WALLET_ACCOUNT_IN_APP, withdrawFromWallet } from "@/lib/wallet";
import { WalletAccountNumber } from "@/components/WalletAccountNumber";
import { colors } from "@/theme";

// The prepaid wallet on the phone (twin of the web's src/components/wallet/WalletBalanceCard.tsx): the balance,
// withdraw to their bank, and what moved. Topping up happens on the website only: the balance pays for Shopinbos
// services (digital goods), which an app can't sell outside the stores' own payments (Apple 3.1.1, Google Play), so
// "Top up" emails the steps, like AI credits. Their own account number shows only in builds that allow it. Sales don't come here: they go straight to the bank.

export function WalletBalanceCard() {
  const t = useT("m_money");
  const locale = useLocale();
  const loaded = useLoad(fetchWalletBalance);
  const [withdrawing, setWithdrawing] = useState(false);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<"topup" | "withdraw" | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const view = loaded.data;
  if (loaded.loading && !view) return <LoadingBlock />;
  if (!view) return loaded.error ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null;

  const failed = (error: unknown) => setMessage({ tone: "error", text: error instanceof ApiError ? error.message : t("bal.failed") });

  const topUp = async () => {
    setBusy("topup");
    setMessage(null);
    try {
      await emailWalletTopUp();
      setMessage({ tone: "success", text: t("bal.topUpSent") });
    } catch (error) {
      failed(error);
    } finally {
      setBusy(null);
    }
  };

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
      {WALLET_ACCOUNT_IN_APP ? <WalletAccountNumber view={view} /> : null}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <PillButton size="md" title={t("bal.topUp")} busy={busy === "topup"} disabled={busy !== null} onPress={() => void topUp()} style={{ flex: 1 }} />
        <PillButton size="md" tone="white" title={t("bal.withdraw")} disabled={busy !== null || !view.ready || !view.canWithdraw || view.balanceNaira < view.limits.withdrawMin} onPress={() => setWithdrawing(!withdrawing)} style={{ flex: 1 }} />
      </View>
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
