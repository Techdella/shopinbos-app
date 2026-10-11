import { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useFonts, PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold } from "@expo-google-fonts/plus-jakarta-sans";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "@/lib/session";
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

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold });
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <SessionProvider>
        <SplashHandover />
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas }, animation: "slide_from_right" }} />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
