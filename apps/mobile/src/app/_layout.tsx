import { useEffect } from "react";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from "expo-router";
import { Platform } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useFonts, PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold } from "@expo-google-fonts/plus-jakarta-sans";
import { BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from "@expo-google-fonts/bricolage-grotesque";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { RoleGuard } from "@/components/RoleGuard";
import { LearnHost } from "@/components/learn/LearnHost";
import { PushManager } from "@/components/PushManager";
import { UpdatePrompt } from "@/components/UpdatePrompt";
import { CallSpace, PeggyCallHost } from "@/components/peggy/PeggyCallHost";
import { useIntroAudioGuard } from "@/lib/intro-audio";
import { SessionProvider, useSession } from "@/lib/session";
import { I18nProvider } from "@/lib/i18n";
import { AppearanceProvider, useScheme } from "@/lib/appearance";
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

/** React Navigation's colours (the background behind screen transitions, cards) from the live palette. */
function navigationTheme(dark: boolean): Theme {
  const base = dark ? DarkTheme : DefaultTheme;
  return { ...base, dark, colors: { ...base.colors, primary: colors.accent, background: colors.canvas, card: colors.surface, text: colors.ink, border: colors.line, notification: colors.accent } };
}

/**
 * Everything under the appearance. The screens are keyed on the scheme, so after a switch (Settings > Appearance, or
 * the phone's own setting on Auto) every screen draws again from the swapped `colors`; the navigation history stays.
 */
function ThemedApp() {
  const scheme = useScheme();
  const dark = scheme === "dark";
  useEffect(() => {
    // The page behind the app on the web (overscroll, the sides of a wide window).
    if (Platform.OS === "web" && typeof document !== "undefined") document.body.style.backgroundColor = colors.canvas;
  }, [scheme]);
  return (
    <ThemeProvider value={navigationTheme(dark)}>
      <SplashHandover />
      <RoleGuard />
      <IntroAudioGuard />
      <StatusBar style={dark ? "light" : "dark"} />
      {/* While a call is minimized the screens end above its bar, so the bar never covers them. */}
      <CallSpace>
        <Stack key={scheme} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas }, animation: "slide_from_right" }} />
      </CallSpace>
      <PushManager />
      {/* "A new version of Shopinbos is ready" (Admin › App updates): after the launch screen, never during a call. */}
      <UpdatePrompt />
      {/* "Call Peggy": the in-app call, full screen or minimized to a bar across the app. */}
      <PeggyCallHost />
      {/* 60-second feature intros: a small Tips button on screens that have one, after setup; never during a call. */}
      <LearnHost />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold });
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <SessionProvider>
        {/* App language (shared/i18n): the phone's saved choice, the account's, else the phone's language. */}
        <I18nProvider>
          {/* Light, dark or the phone's setting (Settings > Appearance, lib/appearance.tsx). */}
          <AppearanceProvider>
            <ThemedApp />
          </AppearanceProvider>
        </I18nProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
