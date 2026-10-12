import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { PROGRESS_STEPS, type OnboardingStep } from "@shared/onboarding";
import { BackButton, ProgressBars, T } from "@/components/ui";
import { finishOnboarding } from "@/lib/onboarding";
import { useOnboarding } from "@/components/OnboardingContext";
import { colors } from "@/theme";
import { HelpButton } from "@/components/Help";

/** Header with back, five progress bars and Skip; scrollable body; pinned footer. */
export function OnboardingFrame({ step, children, footer, scroll = true }: { step: OnboardingStep; children: ReactNode; footer?: ReactNode; scroll?: boolean }) {
  const { status } = useOnboarding();
  const index = PROGRESS_STEPS.indexOf(step);

  async function skip() {
    await finishOnboarding(Boolean(status?.store.live)).catch(() => null);
    router.replace("/home");
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 18, paddingVertical: 10 }}>
          <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace("/home"))} />
          <ProgressBars total={PROGRESS_STEPS.length} current={index} />
          <HelpButton />
          <Pressable accessibilityRole="button" onPress={() => void skip()} hitSlop={10} style={{ minHeight: 44, justifyContent: "center" }}>
            <T weight="bold" style={{ color: colors.inkSoft }}>Skip</T>
          </Pressable>
        </View>
        {scroll ? (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        ) : (
          <View style={{ flex: 1, paddingHorizontal: 18 }}>{children}</View>
        )}
        {footer && <View style={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: 10 }}>{footer}</View>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
