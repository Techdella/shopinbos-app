import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinkButton, T } from "@/components/ui";
import { MascotVideo } from "@/components/MascotVideo";
import { useReduceMotion } from "@/components/Mascot";
import { HelpButton } from "@/components/Help";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

/** How long the welcome stays before Rex's first run starts. */
export const ONBOARDING_WELCOME_MS = 3200;

// Shown once per app run, so coming back to the chat later does not replay it.
let seen = false;
export function onboardingWelcomeSeen() {
  return seen;
}

/**
 * The welcome before Rex's first run (Prototype 10): Rex's hello clip in a spotlight, "Welcome to Shopinbos, {name}",
 * "Rex is getting ready to build your shop with you" and a bar that fills, then `onDone` opens the chat.
 */
export function OnboardingWelcome({ name, onDone }: { name?: string | null; onDone: () => void }) {
  const t = useT("m_onboarding");
  const reduceMotion = useReduceMotion();
  const { width, height } = useWindowDimensions();
  const spot = Math.round(Math.min(240, width * 0.62, height * 0.32));
  const [progress] = useState(() => new Animated.Value(0));
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    seen = true;
    const finish = () => doneRef.current();
    if (reduceMotion) {
      progress.setValue(1);
      const timer = setTimeout(finish, ONBOARDING_WELCOME_MS);
      return () => clearTimeout(timer);
    }
    // Reduce Motion is read asynchronously (it starts on), so start the bar from empty each time.
    progress.setValue(0);
    const run = Animated.timing(progress, { toValue: 1, duration: ONBOARDING_WELCOME_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== "web" });
    run.start(({ finished }) => finished && finish());
    return () => run.stop();
  }, [progress, reduceMotion]);

  const first = name?.trim().split(/\s+/)[0];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas, paddingHorizontal: 22 }} edges={["top", "bottom"]}>
      <View style={{ alignItems: "flex-end", paddingTop: 8 }}>
        <HelpButton />
      </View>
      <View style={{ flex: 1, justifyContent: "center" }}>
        <MascotVideo clip="rex-hello" size={spot} decorative fadeTo={colors.canvas} style={{ alignSelf: "center", marginBottom: 18 }} />
        <T weight="extrabold" style={{ fontSize: 30, lineHeight: 33, letterSpacing: -0.7 }} accessibilityRole="header">
          {first ? t("welcome.title", { name: first }) : t("welcome.titleNoName")}
        </T>
        <T style={{ color: colors.inkSoft, fontSize: 16, lineHeight: 22, marginTop: 8 }}>{t("welcome.sub")}</T>
        <View
          style={{ height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: "hidden", marginTop: 22 }}
          accessibilityRole="progressbar"
          accessibilityLabel={t("welcome.progress")}
        >
          {/* scaleX from the left edge: grows with the native driver (width cannot). */}
          <Animated.View
            style={{
              height: 6,
              width: "100%",
              borderRadius: 3,
              backgroundColor: colors.inkFill,
              transformOrigin: "left",
              transform: [{ scaleX: progress }],
            }}
          />
        </View>
        <LinkButton title={t("welcome.start")} color={colors.inkSoft} style={{ alignSelf: "flex-start", marginTop: 10 }} onPress={() => doneRef.current()} />
      </View>
    </SafeAreaView>
  );
}
