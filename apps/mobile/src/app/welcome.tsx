import { Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import { Sub, Title, TILE, type TileTone } from "@/components/design";
import { HelpButton } from "@/components/Help";
import { AppIcon } from "@/components/icons";
import { LanguageButton } from "@/components/LanguagePicker";
import { Mascot } from "@/components/Mascot";
import { BackButton, PillButton, T } from "@/components/ui";
import { ROLE_ICON, SIGNUP_ROLES, type SignupRole } from "@/lib/partner-pure";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// First screen ("Simple app, end to end" prototype, E2E-Start): Rex, "Shopinbos" and one line, then "Get started"
// or "I already have an account". Get started is sign up, one question per screen (Shopinbos Onboarding —
// Simplified): name → phone → code → "What brings you to Shopinbos?" (AuthForm, verify). Riders have no account:
// "I'm a rider" opens their own sign-in. /welcome?step=role (older links) still shows the cards, and a card there
// goes to sign up with that role, so it isn't asked again. Returning people go straight to their phone (/login).

const TONE: Record<SignupRole, TileTone> = { seller: "peach", supplier: "blue", logistics_partner: "mint" };

/** The prototype's motorbike, for "I'm a rider" (no app icon for it). */
function BikeIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={5.5} cy={17} r={3} />
      <Circle cx={18.5} cy={17} r={3} />
      <Path d="M5.5 17l4-8h5l4 8" />
      <Path d="M9 9H7" />
    </Svg>
  );
}

function RoleCard({ title, line, tone, icon, onPress }: { title: string; line: string; tone: TileTone; icon: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${line}`}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 80, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 20, borderWidth: 1.5, borderColor: pressed ? colors.ink : colors.line, backgroundColor: colors.surface })}
    >
      <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: TILE[tone].bg, alignItems: "center", justifyContent: "center" }}>{icon}</View>
      <View style={{ flex: 1, gap: 3 }}>
        <T weight="bold" style={{ fontSize: 18 }}>{title}</T>
        <T style={{ fontSize: 14, lineHeight: 19, color: colors.inkSoft }}>{line}</T>
      </View>
      <AppIcon name="chevron" size={20} color={colors.inkFaint} />
    </Pressable>
  );
}

export default function Welcome() {
  const t = useT("m_auth");
  // phone / email: typed on the log-in screen before "Sign up now"; carried on to the sign-up form.
  const { step, phone, email } = useLocalSearchParams<{ step?: string; phone?: string; email?: string }>();

  function pick(role: SignupRole) {
    const carried = phone ? { phone } : email ? { email } : {};
    router.push({ pathname: "/signup", params: { method: email && !phone ? "email" : "phone", role, ...carried } });
  }

  const corner = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <LanguageButton />
      <HelpButton />
    </View>
  );

  if (step === "role") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32, gap: 20 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace("/welcome"))} />
            {corner}
          </View>
          <View style={{ gap: 12 }}>
            <Title>{t("pick.title")}</Title>
            <Sub>{t("choose.sub")}</Sub>
          </View>
          <View style={{ gap: 12 }}>
            {SIGNUP_ROLES.map(({ role }) => (
              <RoleCard
                key={role}
                title={t(`pick.${role}.title`)}
                line={t(`pick.${role}.line`)}
                tone={TONE[role]}
                icon={<AppIcon name={ROLE_ICON[role]} size={22} color={TILE[TONE[role]].fg} />}
                onPress={() => pick(role)}
              />
            ))}
            <RoleCard title={t("pick.rider.title")} line={t("pick.rider.line")} tone="gray" icon={<BikeIcon color={TILE.gray.fg} />} onPress={() => router.push("/rider/sign-in")} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View style={{ flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 20, paddingTop: 12 }}>{corner}</View>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 20, paddingBottom: 24 }}>
        <View style={{ alignItems: "center", gap: 18 }}>
          <View style={{ width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: colors.forest, backgroundColor: colors.mintTint, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
            <Mascot who="rex" size={68} decorative />
          </View>
          <Title size={40} style={{ textAlign: "center" }}>Shopinbos</Title>
          <Sub style={{ textAlign: "center" }}>{t("start.tagline")}</Sub>
        </View>
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, gap: 10 }}>
        <PillButton tone="accent" title={t("start.getStarted")} onPress={() => router.push("/signup")} testID="welcome-start" />
        <PillButton tone="white" title={t("welcome.haveAccount")} onPress={() => router.push("/login")} />
        <Pressable accessibilityRole="button" onPress={() => router.push("/rider/sign-in")} style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }} testID="welcome-rider">
          <T weight="bold" style={{ color: colors.inkSoft, fontSize: 15 }}>{t("welcome.rider")}</T>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
