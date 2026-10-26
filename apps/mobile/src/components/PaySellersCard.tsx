import { useState } from "react";
import { View } from "react-native";
import { naira } from "@shared/onboarding";
import { Card, Notice, PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { useLoad } from "@/lib/useLoad";
import { fetchSellersCash, paySellerCash } from "@/lib/wallet";
import { colors } from "@/theme";

// Cash on delivery belongs to the seller, never to Shopinbos: the partner pays each seller here, by card or
// transfer through Paystack straight to the seller's bank (when the seller's Shopinbos Wallet is set up), or hands
// it over and the seller confirms it in their app (web: /logistics/cash, PaySellerList).

export function PaySellersCard({ onPaid }: { onPaid: () => void }) {
  const t = useT("m_partner", "m_money", "common");
  const loaded = useLoad(fetchSellersCash);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);
  const sellers = loaded.data?.sellers ?? [];
  if (!sellers.length) return null;

  async function pay(sellerId: string, sellerName: string) {
    setBusy(sellerId);
    setMessage(null);
    try {
      const result = await paySellerCash(sellerId);
      // Paid, a transfer still on its way (the webhook settles it), or closed before paying.
      setMessage(
        result.outcome === "paid"
          ? { tone: "success", text: t("money.paidSeller", { name: sellerName }) }
          : result.outcome === "pending"
            ? { tone: "info", text: t("pay.pending") }
            : { tone: "error", text: t("pay.cancelled") },
      );
      await loaded.reload();
      onPaid();
    } catch (failure) {
      setMessage({ tone: "error", text: failure instanceof Error ? failure.message : t("money.notSeenYet") });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card style={{ gap: 10, padding: 18 }}>
      <T weight="extrabold" style={{ fontSize: 17 }} accessibilityRole="header">{t("money.paySellers")}</T>
      <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>{t("money.paySellersSub")}</T>
      {sellers.map((row) => (
        <View key={row.sellerId} style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <T weight="bold" style={{ fontSize: 15 }} numberOfLines={1}>{row.sellerName}</T>
              <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("money.jobs", { count: row.jobs })}</T>
            </View>
            <T weight="extrabold" style={{ fontSize: 16 }}>{naira(row.amount)}</T>
          </View>
          {row.payable ? (
            <PillButton title={t("money.paySeller", { amount: naira(row.amount) })} size="sm" busy={busy === row.sellerId} disabled={busy !== null} onPress={() => void pay(row.sellerId, row.sellerName)} />
          ) : (
            <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("money.handOver", { name: row.sellerName })}</T>
          )}
        </View>
      ))}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
    </Card>
  );
}
