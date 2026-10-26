import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import type { WalletBalance } from "@/lib/wallet";
import { colors, radii } from "@/theme";

// Their own wallet account number (a Paystack Dedicated Virtual Account), twin of the block on the web's wallet card.
// Shown only in builds with EXPO_PUBLIC_WALLET_ACCOUNT_NUMBER=true (WALLET_ACCOUNT_IN_APP): paying it tops up a
// balance spent on Shopinbos services, which store builds can't point to (Apple 3.1.1, Google Play payments).

export function WalletAccountNumber({ view }: { view: WalletBalance }) {
  const t = useT("m_money");
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const account = view.topUpAccount;
  if (!account) {
    return view.topUpAccountStatus === "setting_up" ? <T style={{ color: colors.inkSoft, fontSize: 13 }}>{t("bal.accountSettingUp")}</T> : null;
  }

  async function copy() {
    await Clipboard.setStringAsync(account!.number).catch(() => undefined);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }

  return (
    <View style={{ gap: 6, backgroundColor: colors.canvas, borderRadius: radii.field, padding: 14 }}>
      <T style={{ color: colors.inkSoft, fontSize: 13 }}>{t("bal.accountTitle")}</T>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <T selectable weight="extrabold" style={{ fontSize: 24, letterSpacing: 1, flex: 1 }}>{account.number}</T>
        <PillButton size="sm" tone="white" title={copied ? t("bal.copied") : t("bal.copy")} onPress={() => void copy()} />
      </View>
      <T style={{ color: colors.inkSoft, fontSize: 13 }}>{account.bank} · {account.name}</T>
    </View>
  );
}
