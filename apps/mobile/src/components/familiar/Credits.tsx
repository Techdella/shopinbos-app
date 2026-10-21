import { useState } from "react";
import { Pressable, View } from "react-native";
import { AppIcon } from "@/components/icons";
import { Mascot, T } from "@/components/ui";
import { emailTopUp } from "@/lib/familiar";
import { useT } from "@/lib/i18n";
import { colors, radii } from "@/theme";

// "120 credits · Top up" for Rex and Peggy (decision 2: AI credits are never sold in the app). Top up emails how to
// top up on the website and says so here. No prices, no pay button. Hidden when the balance isn't known.

export function CreditsLine({ balance, who = "rex" }: { balance: number | null | undefined; who?: "rex" | "peggy" }) {
  const t = useT("m_familiar");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  if (balance == null) return null;

  const topUp = async () => {
    if (state === "sending") return;
    setState("sending");
    const ok = await emailTopUp().then(() => true, () => false);
    setState(ok ? "sent" : "failed");
  };

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View accessible accessibilityLabel={t("credits.count", { count: balance })} style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.grayTint, borderRadius: radii.pill, paddingLeft: 4, paddingRight: 12, minHeight: 36 }}>
          <Mascot who={who} size={28} label="" />
          <T weight="bold" style={{ fontSize: 14 }}>{t("credits.count", { count: balance })}</T>
        </View>
        <View style={{ flex: 1 }} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("credits.topUpLabel")}
          accessibilityState={{ busy: state === "sending" }}
          onPress={() => void topUp()}
          hitSlop={6}
          style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 14, borderRadius: radii.pill, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed || state === "sending" ? 0.7 : 1 })}
        >
          <AppIcon name="mail" size={16} />
          <T weight="bold" style={{ fontSize: 14 }}>{t("credits.topUp")}</T>
        </Pressable>
      </View>
      {state === "sent" ? (
        <T accessibilityLiveRegion="polite" style={{ fontSize: 14, lineHeight: 20, color: colors.forest }}>{t("credits.emailed")}</T>
      ) : state === "failed" ? (
        <T accessibilityLiveRegion="polite" style={{ fontSize: 14, lineHeight: 20, color: colors.inkSoft }}>{t("credits.emailFailed")}</T>
      ) : null}
    </View>
  );
}
