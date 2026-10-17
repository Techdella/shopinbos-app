import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon } from "@/components/icons";
import { LinkButton, T, Wash, Wordmark } from "@/components/ui";
import { MascotVideo } from "@/components/MascotVideo";
import { ROLE_ICON, SIGNUP_ROLES, type SignupRole } from "@/lib/partner-pure";
import { colors, radii } from "@/theme";
import { HelpButton } from "@/components/Help";
import { LanguageButton } from "@/components/LanguagePicker";
import { useT } from "@/lib/i18n";

// First screen: "What do you do?" with three big cards (seller, supplier, delivery partner), like the web's
// /signup. Tapping one opens that role's sign-up form ("Sign up as a supplier"). One account is one role, so
// picking first keeps sign-ups from getting mixed up. "I already have an account" logs in (the app then opens the
// right tabs for the account). Riders open the private link their dispatcher sent.
// Peggy says hello in a soft spotlight (Prototype 10).

export default function Welcome() {
  const t = useT("m_auth");
  const { width, height } = useWindowDimensions();
  // Smaller on short phones so all three cards stay in view.
  const spot = Math.round(Math.min(150, width * 0.38, height * 0.17));

  function pick(role: SignupRole) {
    router.push({ pathname: "/signup", params: { method: "phone", role } });
  }

  return (
    <View style={{ flex: 1 }}>
      <Wash />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 22, paddingTop: 10, paddingBottom: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Wordmark />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <LanguageButton />
              <HelpButton />
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
            <MascotVideo clip="peggy-hello" size={spot} decorative />
            <View style={{ flex: 1, marginLeft: 4, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 10, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: 4, borderBottomRightRadius: 20, shadowColor: colors.ink, shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 3 }}>
              <T weight="bold">{t("welcome.peggyHi")}</T>
            </View>
          </View>
          <T weight="extrabold" style={{ fontSize: 32, lineHeight: 35, letterSpacing: -1, marginTop: 12 }} accessibilityRole="header">
            {t("choose.title")}
          </T>
          <T style={{ color: colors.inkSoft, marginTop: 8, marginBottom: 18, lineHeight: 21 }}>{t("choose.sub")}</T>
          <View style={{ gap: 12 }}>
            {SIGNUP_ROLES.map(({ role }) => (
              <Pressable
                key={role}
                accessibilityRole="button"
                accessibilityLabel={`${t(`card.${role}.title`)}. ${t(`card.${role}.line`)}`}
                onPress={() => pick(role)}
                style={({ pressed }) => ({
                  minHeight: 92,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 14,
                  padding: 16,
                  borderRadius: radii.card,
                  borderWidth: 1,
                  borderColor: pressed ? colors.ink : colors.line,
                  backgroundColor: colors.surface,
                  shadowColor: colors.ink,
                  shadowOpacity: 0.06,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 6 },
                  elevation: 1,
                })}
              >
                <View style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: colors.peach, alignItems: "center", justifyContent: "center" }}>
                  <AppIcon name={ROLE_ICON[role]} color={colors.accentInk} size={26} />
                </View>
                <View style={{ flex: 1 }}>
                  <T weight="extrabold" style={{ fontSize: 18 }}>{t(`card.${role}.title`)}</T>
                  <T style={{ color: colors.inkSoft, fontSize: 14.5, lineHeight: 20, marginTop: 2 }}>{t(`card.${role}.line`)}</T>
                </View>
                <AppIcon name="chevron" color={colors.inkSoft} size={20} />
              </Pressable>
            ))}
          </View>
          <View style={{ flex: 1, minHeight: 12 }} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 18, marginTop: 8 }}>
            <LinkButton title={t("welcome.haveAccount")} onPress={() => router.push("/login")} />
            <LinkButton title={t("welcome.rider")} color={colors.inkSoft} onPress={() => router.push("/rider/link")} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
