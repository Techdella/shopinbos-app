import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { BackButton, T } from "@/components/ui";
import { colors } from "@/theme";

/** A pushed screen: back button, big title, scrolling body and an optional pinned footer. */
export function Screen({
  title,
  sub,
  footer,
  children,
  refreshing,
  onRefresh,
}: {
  title: string;
  sub?: string;
  footer?: ReactNode;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ paddingHorizontal: 18, paddingVertical: 10 }}>
          <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace("/home"))} />
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 28 }}
          refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} /> : undefined}
        >
          <T weight="extrabold" style={{ fontSize: 28, letterSpacing: -0.6, lineHeight: 32 }} accessibilityRole="header">{title}</T>
          {sub ? <T style={{ color: colors.inkSoft, marginTop: 6, lineHeight: 21 }}>{sub}</T> : null}
          <View style={{ marginTop: 16, gap: 12 }}>{children}</View>
        </ScrollView>
        {footer ? <View style={{ paddingHorizontal: 18, paddingBottom: 10, paddingTop: 8 }}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
