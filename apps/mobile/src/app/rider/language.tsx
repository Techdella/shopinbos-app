import { useEffect, useRef } from "react";
import { ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Choice, Title } from "@/components/design";
import { BackButton, PillButton } from "@/components/ui";
import { markRiderWelcomed, riderAction } from "@/lib/rider";
import { RIDER_LANGS, useRiderStrings, type RiderLang } from "@/lib/rider-strings";
import { colors } from "@/theme";

// Riders app, "Which language?" (E2E-Rider "rLang"): English, Pidgin, Yorùbá, Hausa or Igbo. Picking one changes the
// app at once; Start (first run) or Done (from Me) saves it for the company too and opens Today.

export default function RiderLanguage() {
  const params = useLocalSearchParams<{ id?: string; first?: string; lang?: string }>();
  const first = params.first === "1";
  const { lang, setLang, say } = useRiderStrings();
  const adopted = useRef(false);

  // A rider who picked a language on another phone starts in it here.
  useEffect(() => {
    if (adopted.current) return;
    adopted.current = true;
    const saved = RIDER_LANGS.find((item) => item.code === params.lang);
    if (first && saved && saved.code !== lang) setLang(saved.code);
  }, [first, lang, params.lang, setLang]);

  function finish() {
    // Best effort: the company sees the rider's language; the app already switched.
    void riderAction({ action: "language", language: lang }).catch(() => undefined);
    if (first) {
      if (params.id) markRiderWelcomed(String(params.id));
      router.dismissTo("/rider");
    } else if (router.canGoBack()) router.back();
    else router.replace("/rider/me");
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, gap: 20 }}>
        <View style={{ flexDirection: "row" }}>
          <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace("/rider"))} />
        </View>
        <Title>{say("lang.title")}</Title>
        <View accessibilityRole="radiogroup" style={{ gap: 10 }}>
          {RIDER_LANGS.map((item) => (
            <Choice key={item.code} title={item.label} on={lang === item.code} onPress={() => setLang(item.code as RiderLang)} />
          ))}
        </View>
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingBottom: 12, paddingTop: 10 }}>
        <PillButton tone="forest" title={first ? say("start") : say("done")} onPress={finish} />
      </View>
    </SafeAreaView>
  );
}
