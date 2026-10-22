import { useState } from "react";
import { View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { naira } from "@shared/onboarding";
import { Card, Field, Label, Notice, PillButton, T } from "@/components/ui";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { useLoad } from "@/lib/useLoad";
import { ApiError } from "@/lib/api";
import { fetchWalletBalance, topUpWallet, withdrawFromWallet } from "@/lib/wallet";
import { colors } from "@/theme";

// The prepaid wallet on the phone (twin of the web's src/components/wallet/WalletBalanceCard.tsx): the balance,
// top up (transfer to their own account number, or card/bank on Paystack's page), withdraw to their bank, and
// what moved. Sales don't come here: they go straight to the bank.

export function WalletBalanceCard() {
  const loaded = useLoad(fetchWalletBalance);
  const [mode, setMode] = useState<"topup" | "withdraw" | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const view = loaded.data;
  if (loaded.loading && !view) return <LoadingBlock />;
  if (!view) return loaded.error ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null;

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    const value = Number(amount.replace(/[^\d]/g, ""));
    try {
      if (mode === "topup") {
        await topUpWallet(value);
        setMessage({ tone: "success", text: "If you paid, your balance updates in a moment." });
      } else {
        const result = await withdrawFromWallet(value);
        setMessage({ tone: "success", text: result.status === "done" ? "Sent to your bank." : "On its way to your bank. It usually arrives within minutes." });
      }
      setMode(null);
      setAmount("");
      void loaded.reload();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof ApiError ? error.message : "That didn't work. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: 12 }}>
      <T style={{ color: colors.inkSoft, fontSize: 13 }}>Wallet balance</T>
      <T weight="extrabold" style={{ fontSize: 34 }}>{naira(view.balanceNaira)}</T>
      <T style={{ color: colors.inkSoft, fontSize: 14 }}>Top up to pay for AI credits and other Shopinbos services. Sales still go straight to your bank.</T>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <PillButton size="md" title="Top up" disabled={!view.ready} onPress={() => setMode(mode === "topup" ? null : "topup")} style={{ flex: 1 }} />
        <PillButton size="md" tone="white" title="Withdraw" disabled={!view.ready || !view.canWithdraw || view.balanceNaira < view.limits.withdrawMin} onPress={() => setMode(mode === "withdraw" ? null : "withdraw")} style={{ flex: 1 }} />
      </View>
      {mode === "topup" && view.topUpAccount ? (
        <View style={{ backgroundColor: colors.canvas, borderRadius: 14, padding: 12, gap: 4 }}>
          <T style={{ color: colors.inkSoft, fontSize: 13 }}>Transfer to your own top-up account:</T>
          <T weight="extrabold" style={{ fontSize: 24, letterSpacing: 1 }} onPress={() => void Clipboard.setStringAsync(view.topUpAccount!.number)}>{view.topUpAccount.number}</T>
          <T style={{ color: colors.inkSoft, fontSize: 13 }}>{view.topUpAccount.bank} · {view.topUpAccount.name} · tap the number to copy</T>
        </View>
      ) : null}
      {mode ? (
        <View style={{ gap: 10 }}>
          <Label>{mode === "topup" ? "Or pay by card or bank (amount)" : `Amount to send to ${view.bank ?? "your bank"}`}</Label>
          <Field value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder={mode === "topup" ? `${naira(view.limits.topUpMin)} or more` : `${naira(view.limits.withdrawMin)} or more`} accessibilityLabel="Amount" />
          <PillButton tone="accent" title={mode === "topup" ? "Continue to pay" : "Withdraw"} busy={busy} disabled={busy || !amount} onPress={() => void submit()} />
        </View>
      ) : null}
      {!view.canWithdraw && view.balanceNaira > 0 ? <T style={{ color: colors.inkSoft, fontSize: 13 }}>To withdraw, add and check your bank account first.</T> : null}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      {view.transactions.slice(0, 10).map((tx) => (
        <View key={tx.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 }}>
          <View style={{ flex: 1 }}>
            <T weight="bold" style={{ fontSize: 14 }} numberOfLines={1}>{tx.description}</T>
            <T style={{ color: colors.inkSoft, fontSize: 12 }}>{new Date(tx.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}{tx.status === "pending" ? " · on its way" : tx.status === "failed" ? " · didn't go through" : ""}</T>
          </View>
          <T weight="extrabold" style={{ color: tx.naira > 0 ? colors.success : colors.ink }}>{tx.naira > 0 ? "+" : "−"}{naira(Math.abs(tx.naira))}</T>
        </View>
      ))}
    </Card>
  );
}
