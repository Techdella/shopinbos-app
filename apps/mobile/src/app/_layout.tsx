import { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useFonts, PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold } from "@expo-google-fonts/plus-jakarta-sans";
import { BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from "@expo-google-fonts/bricolage-grotesque";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { RoleGuard } from "@/components/RoleGuard";
import { SessionGuard } from "@/components/SessionGuard";
import { LearnHost } from "@/components/learn/LearnHost";
import { PushManager } from "@/components/PushManager";
import { CallSpace, PeggyCallHost } from "@/components/peggy/PeggyCallHost";
import { useIntroAudioGuard } from "@/lib/intro-audio";
import { SessionProvider, useSession } from "@/lib/session";
import { I18nProvider } from "@/lib/i18n";
import { colors } from "@/theme";

// Keep the native launch screen (app.json → expo-splash-screen) up until fonts and the saved session are ready.
void SplashScreen.preventAutoHideAsync().catch(() => null);
SplashScreen.setOptions({ duration: 250, fade: true });

/** Never hold the native splash longer than this (e.g. a session refresh stuck on a bad network). The JS launch screen looks the same. */
const SPLASH_MAX_MS = 3000;

function SplashHandover() {
  const { loading } = useSession();
  useEffect(() => {
    if (!loading) SplashScreen.hide();
  }, [loading]);
  useEffect(() => {
    const timer = setTimeout(() => SplashScreen.hide(), SPLASH_MAX_MS);
    return () => clearTimeout(timer);
  }, []);
  return null;
}

/** Stops every tip's sound when the app goes to the background or a Peggy call starts (lib/intro-audio.ts). */
function IntroAudioGuard() {
  useIntroAudioGuard();
  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold });
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <SessionProvider>
        {/* App language (shared/i18n): the phone's saved choice, the account's, else the phone's language. */}
        <I18nProvider>
          <SplashHandover />
          <RoleGuard />
          <IntroAudioGuard />
          <StatusBar style="dark" />
          {/* While a call is minimized the screens end above its bar, so the bar never covers them. */}
          <CallSpace>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas }, animation: "slide_from_right" }} />
          </CallSpace>
          <PushManager />
          {/* "Call Peggy": the in-app call, full screen or minimized to a bar across the app. */}
          <PeggyCallHost />
          {/* Locks the app after a few minutes away (Face ID, fingerprint or PIN), ends old sessions, asks 18+ once. */}
          <SessionGuard />
          {/* 60-second feature intros: a small Tips button on screens that have one, after setup; never during a call. */}
          <LearnHost />
        </I18nProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
