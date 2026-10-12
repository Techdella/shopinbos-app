import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { HelpButton } from "@/components/Help";
import { BackButton, T } from "@/components/ui";
import { colors } from "@/theme";

/** A pushed screen: back button, Help, big title, scrolling body and an optional pinned footer (the one main button). */
export function Screen({
  title,
  sub,
  footer,
  children,
  refreshing,
  onRefresh,
  help = true,
}: {
  title: string;
  sub?: string;
  footer?: ReactNode;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Help in the top corner (build spec 8A: every screen has Help). */
  help?: boolean;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ paddingHorizontal: 18, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace("/home"))} />
          {help ? <HelpButton /> : null}
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 28 }}
          refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} /> : undefined}
        >
          <T weight="extrabold" style={{ fontSize: 26, letterSpacing: -0.5, lineHeight: 31 }} accessibilityRole="header">{title}</T>
          {sub ? <T style={{ color: colors.inkSoft, marginTop: 6, fontSize: 15, lineHeight: 22 }}>{sub}</T> : null}
          <View style={{ marginTop: 16, gap: 12 }}>{children}</View>
        </ScrollView>
        {footer ? <View style={{ paddingHorizontal: 18, paddingBottom: 10, paddingTop: 8 }}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
