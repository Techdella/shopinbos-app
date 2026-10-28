import { useRef, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { PROGRESS_STEPS, type OnboardingStep } from "@shared/onboarding";
import { T } from "@/components/ui";
import { finishOnboarding } from "@/lib/onboarding";
import { useOnboarding } from "@/components/OnboardingContext";
import { colors } from "@/theme";
import { HelpButton } from "@/components/Help";
import { useT } from "@/lib/i18n";
import { KeyboardShift, useScrollToEndOnKeyboard } from "@/components/KeyboardShift";

const NO_SCROLL = { current: null };

/** One calm step of seller onboarding ("Seller app" prototype `.scr.flow`): a round back button, "2 of 5", Help and
 * Skip on top; the step's one question in a scrolling body with 20px gaps; the main button pinned at the bottom. */
export function OnboardingFrame({
  step,
  children,
  footer,
  scroll = true,
  chat = false,
  progress,
  onBack,
  onSkip,
}: {
  step: OnboardingStep;
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  /** A conversation (Rex's chat): the newest message stays in sight as it grows and when the keyboard opens. */
  chat?: boolean;
  /** Sign-up's one question per screen ("3 of 9", shared/onboarding.ts SELLER_QUESTIONS) instead of `step`'s place. */
  progress?: { current: number; total: number };
  /** Back goes to the previous question instead of the previous route. */
  onBack?: () => void;
  /** "Skip for now" on an optional question; null hides Skip (a question that must be answered). */
  onSkip?: (() => void) | null;
}) {
  const scroller = useRef<ScrollView>(null);
  useScrollToEndOnKeyboard(chat ? scroller : NO_SCROLL);
  const { status } = useOnboarding();
  const t = useT("m_onboarding", "common");
  const index = progress ? progress.current - 1 : PROGRESS_STEPS.indexOf(step);
  const total = progress ? progress.total : PROGRESS_STEPS.length;

  async function skip() {
    await finishOnboarding(Boolean(status?.store.live)).catch(() => null);
    router.replace("/home");
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "bottom"]}>
      <KeyboardShift>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 10 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("back")}
            onPress={() => (onBack ? onBack() : router.canGoBack() ? router.back() : router.replace("/home"))}
            hitSlop={4}
            style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1 })}
          >
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M15 5l-7 7 7 7" />
            </Svg>
          </Pressable>
          <T weight="semibold" style={{ flex: 1, fontSize: 13, color: colors.inkSoft }} accessibilityLabel={index >= 0 ? t("frame.step", { current: index + 1, total }) : undefined}>
            {index >= 0 ? t("frame.step", { current: index + 1, total }) : ""}
          </T>
          <HelpButton />
          {onSkip === null ? null : (
            <Pressable accessibilityRole="button" onPress={() => (onSkip ? onSkip() : void skip())} hitSlop={10} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 4 }}>
              <T weight="bold" style={{ color: colors.inkSoft, fontSize: 15 }}>{t("skip")}</T>
            </Pressable>
          )}
        </View>
        {scroll ? (
          <ScrollView
            ref={scroller}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={chat ? () => scroller.current?.scrollToEnd({ animated: true }) : undefined}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={{ flex: 1, paddingHorizontal: 20 }}>{children}</View>
        )}
        {footer && <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, gap: 10, backgroundColor: colors.canvas }}>{footer}</View>}
      </KeyboardShift>
    </SafeAreaView>
  );
}
