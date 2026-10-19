import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { AppIcon } from "@/components/icons";
import { PillButton, T } from "@/components/ui";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { colors, radii } from "@/theme";

// The seller's "Let's verify you" card (web: the strip under the top bar, VerifyYouBar). Shown until their ID passes
// the Shopinbos Wallet check (NIN or BVN); optional, so "Later" hides it until the app is opened again.

let hiddenThisSession = false;

export function VerifyYouCard() {
  const t = useT("m_money");
  const [show, setShow] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (hiddenThisSession) return;
      let alive = true;
      api<{ idCheck?: { verified: boolean; checksReady: boolean } | null }>("/api/app/shell-counts")
        .then((counts) => alive && setShow(Boolean(counts.idCheck && counts.idCheck.checksReady && !counts.idCheck.verified)))
        .catch(() => null);
      return () => {
        alive = false;
      };
    }, []),
  );

  if (!show) return null;
  return (
    <View style={{ marginTop: 14, backgroundColor: colors.mintTint, borderRadius: radii.card, padding: 16, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <AppIcon name="shield" size={20} />
        <T weight="extrabold" style={{ flex: 1, fontSize: 16 }} accessibilityRole="header">{t("w.verifyTitle")}</T>
        <Pressable accessibilityRole="button" accessibilityLabel={t("w.later")} hitSlop={8} onPress={() => { hiddenThisSession = true; setShow(false); }}>
          <T weight="bold" style={{ color: colors.inkSoft, fontSize: 14 }}>{t("w.later")}</T>
        </Pressable>
      </View>
      <T style={{ fontSize: 15, lineHeight: 21 }}>{t("w.verifySub")}</T>
      <PillButton title={t("w.verifyNow")} size="sm" style={{ alignSelf: "flex-start" }} onPress={() => router.push("/wallet")} />
    </View>
  );
}
