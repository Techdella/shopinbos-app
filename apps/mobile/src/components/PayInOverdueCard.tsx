import { useState } from "react";
import { View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { AppIcon } from "@/components/icons";
import { PillButton, T } from "@/components/ui";
import { checkPayInsAgain, type PayInOverdue } from "@/lib/logistics";
import { radii } from "@/theme";

// Calm amber card on Today and Money while a cash pay-in is late (web: src/components/logistics/PayInOverdueCard.tsx):
// how much and since when, that pay-when-it-arrives jobs are paused until they pay, their account number with Copy,
// and "I've paid. Check again", which looks for the transfer straight away.

const AMBER = "#FDF0D5";
const AMBER_INK = "#5C4100";

export function PayInOverdueCard({ overdue, onChecked }: { overdue: PayInOverdue; onChecked?: () => void }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function copy() {
    if (!overdue.account) return;
    await Clipboard.setStringAsync(overdue.account.accountNumber).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  async function checkAgain() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await checkPayInsAgain();
      setMessage(result.message);
      if (result.cleared) onChecked?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That didn't go through. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ backgroundColor: AMBER, borderRadius: radii.card, padding: 18, gap: 12 }}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.7)", alignItems: "center", justifyContent: "center" }}>
          <AppIcon name="clock" size={20} color="#8A5A00" />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <T weight="extrabold" style={{ fontSize: 20, lineHeight: 25, color: "#3D2C00" }} accessibilityRole="header">{overdue.title}</T>
          <T style={{ fontSize: 15, lineHeight: 21, color: AMBER_INK }}>{overdue.body}</T>
        </View>
      </View>
      {overdue.account ? (
        <View style={{ backgroundColor: "rgba(255,255,255,0.8)", borderRadius: 14, padding: 14, gap: 6 }}>
          <T weight="bold" style={{ fontSize: 15, color: AMBER_INK }}>Pay into your account</T>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <T weight="extrabold" selectable style={{ flex: 1, fontSize: 26, letterSpacing: 1 }} accessibilityLabel={`Account number ${overdue.account.accountNumber.split("").join(" ")}`}>
              {overdue.account.accountNumber}
            </T>
            <PillButton title={copied ? "Copied" : "Copy"} size="md" tone={copied ? "white" : undefined} onPress={() => void copy()} />
          </View>
          <T style={{ fontSize: 15, color: AMBER_INK }}>{overdue.account.bankName}{overdue.account.accountName ? ` · ${overdue.account.accountName}` : ""}</T>
        </View>
      ) : (
        <View style={{ backgroundColor: "rgba(255,255,255,0.8)", borderRadius: 14, padding: 14 }}>
          <T style={{ fontSize: 15, lineHeight: 21, color: AMBER_INK }}>Pay in the usual way, then tell us how much you paid on the web Cash page.</T>
        </View>
      )}
      <PillButton title="I've paid. Check again" tone="white" size="md" busy={busy} onPress={() => void checkAgain()} />
      {message ? (
        <T weight="bold" accessibilityLiveRegion="polite" style={{ fontSize: 15, lineHeight: 21, color: AMBER_INK }}>{message}</T>
      ) : null}
    </View>
  );
}
