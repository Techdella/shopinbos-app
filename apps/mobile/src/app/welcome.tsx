import { useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon } from "@/components/icons";
import { Chip, LinkButton, PillButton, T, Wash, Wordmark } from "@/components/ui";
import { MascotVideo } from "@/components/MascotVideo";
import { SIGNUP_ROLES, type SignupRole } from "@/lib/partner-pure";
import { colors, radii } from "@/theme";
import { HelpButton } from "@/components/Help";
import { LanguageButton } from "@/components/LanguagePicker";
import { useT } from "@/lib/i18n";

// First screen: pick what you do (like the web sign-up's "I sell / I supply shops / I deliver"), then sign up
// with a phone number or email, or log in. Riders open the private link their dispatcher sent.
// Sellers are greeted by Peggy's hello clip in a soft spotlight (Prototype 10).

// Lines are m_auth keys.
const NEXT = {
  supplier: { icon: "box", lines: ["welcome.supplier.1", "welcome.supplier.2", "welcome.supplier.3", "welcome.supplier.4"] },
  logistics_partner: { icon: "truck", lines: ["welcome.logistics.1", "welcome.logistics.2", "welcome.logistics.3", "welcome.logistics.4"] },
} as const satisfies Record<Exclude<SignupRole, "seller">, { icon: "box" | "truck"; lines: readonly string[] }>;

export default function Welcome() {
  const t = useT("m_auth");
  const [role, setRole] = useState<SignupRole>("seller");
  const copy = SIGNUP_ROLES.find((item) => item.role === role) ?? SIGNUP_ROLES[0];
  const { width, height } = useWindowDimensions();
  // Big on most phones, smaller on short ones so the buttons stay on screen.
  const spot = Math.round(Math.min(230, width * 0.58, height * 0.28));

  return (
    <View style={{ flex: 1 }}>
      <Wash />
      <SafeAreaView style={{ flex: 1, paddingHorizontal: 22, paddingBottom: 12 }}>
        <View style={{ paddingTop: 10, gap: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Wordmark />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <LanguageButton />
              <HelpButton />
            </View>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel={t("form.whatDoYouDo")}>
            {SIGNUP_ROLES.map((item) => <Chip key={item.role} label={t.dynamic(`role.${item.role}.tab`, item.tab)} on={role === item.role} onPress={() => setRole(item.role)} />)}
          </View>
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          {role === "seller" ? (
            <>
              <MascotVideo clip="peggy-hello" size={spot} decorative />
              <View style={{ position: "absolute", top: 18, right: 0, maxWidth: 210, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 10, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 4, shadowColor: colors.ink, shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 3 }}>
                <T weight="bold">{t("welcome.peggyHi")}</T>
              </View>
            </>
          ) : (
            <View style={{ alignSelf: "stretch", backgroundColor: colors.surface, borderRadius: radii.card, padding: 18, gap: 12, shadowColor: colors.ink, shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 2 }}>
              <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.peach, alignItems: "center", justifyContent: "center" }}>
                <AppIcon name={NEXT[role].icon} color={colors.accentInk} size={24} />
              </View>
              {NEXT[role].lines.map((line, index) => (
                <View key={line} style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.mintTint, alignItems: "center", justifyContent: "center" }}>
                    <T weight="extrabold" style={{ fontSize: 13.5, color: colors.forest }}>{index + 1}</T>
                  </View>
                  <T weight="semibold" style={{ flex: 1, fontSize: 14.5 }}>{t(line)}</T>
                </View>
              ))}
            </View>
          )}
        </View>
        <T weight="extrabold" style={{ fontSize: 34, lineHeight: 36, letterSpacing: -1 }} accessibilityRole="header">
          {t.dynamic(`role.${copy.role}.title`, copy.title)}
        </T>
        <T style={{ color: colors.inkSoft, marginTop: 10, marginBottom: 20, lineHeight: 21 }}>{t.dynamic(`role.${copy.role}.sub`, copy.sub)}</T>
        <PillButton title={t("welcome.startPhone")} onPress={() => router.push({ pathname: "/signup", params: { method: "phone", role } })} />
        <PillButton title={t("form.useEmail")} tone="white" size="md" style={{ marginTop: 10 }} onPress={() => router.push({ pathname: "/signup", params: { method: "email", role } })} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 18 }}>
          <LinkButton title={role === "seller" ? t("welcome.haveShop") : t("welcome.haveAccount")} style={{ marginTop: 6 }} onPress={() => router.push("/login")} />
          {role === "logistics_partner" ? <LinkButton title={t("welcome.rider")} color={colors.inkSoft} style={{ marginTop: 6 }} onPress={() => router.push("/rider/link")} /> : null}
        </View>
      </SafeAreaView>
    </View>
  );
}
