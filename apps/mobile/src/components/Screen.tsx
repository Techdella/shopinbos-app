import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { router, usePathname } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { HelpButton } from "@/components/Help";
import { Sub, Title } from "@/components/design";
import { T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

const IOS = Platform.OS === "ios";

function goBack(fallback: string) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback as never);
}

/** The one Back button of every pushed screen: "‹ Back" on iPhone (just "‹" without `label`), an arrow on Android.
 * Sits 20px from the left edge in a header with `paddingLeft: 12`. */
export function HeaderBack({ onPress, label = false }: { onPress: () => void; label?: boolean }) {
  const t = useT("common");
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t("back")} onPress={onPress} hitSlop={6} style={{ minHeight: 44, minWidth: 44, flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 8, zIndex: 1 }}>
      <Svg width={IOS ? 22 : 24} height={IOS ? 22 : 24} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <Path d={IOS ? "M15 5l-7 7 7 7" : "M20 12H5M11 5l-7 7 7 7"} />
      </Svg>
      {IOS && label ? <T weight="semibold" style={{ fontSize: 17 }}>{t("back")}</T> : null}
    </Pressable>
  );
}

/** The bar on a pushed screen ("Simple app, end to end" prototype `.hd`): iPhone shows "‹ Back" and a centred title,
 * Android an arrow and the title on the left. Help sits on the right, 20px from the edge like the tab screens. */
export function ScreenHeader({ title, onBack, right, help = true, fallback = "/home" }: { title?: string; onBack?: () => void; right?: ReactNode; help?: boolean; fallback?: string }) {
  const back = onBack ?? (() => goBack(fallback));
  // Help itself (and its chats) never shows a Help button.
  const onHelp = usePathname().startsWith("/help");
  return (
    <View style={{ minHeight: 54, paddingLeft: 12, paddingRight: 20, flexDirection: "row", alignItems: "center", gap: 4 }}>
      <HeaderBack onPress={back} label />
      {title ? (
        IOS ? (
          <View pointerEvents="none" style={{ position: "absolute", left: right ? 116 : 96, right: right ? 116 : 96, alignItems: "center" }}>
            <T weight="extrabold" numberOfLines={1} style={{ fontSize: 17 }} accessibilityRole="header">{title}</T>
          </View>
        ) : (
          <T weight="bold" numberOfLines={1} style={{ flex: 1, fontSize: 20, paddingLeft: 4 }} accessibilityRole="header">{title}</T>
        )
      ) : null}
      <View style={{ flex: IOS || !title ? 1 : 0 }} />
      {right}
      {/* With another button beside it, Help is the round icon, so the title still fits on a 360px phone. */}
      {help && !onHelp ? (right ? <HelpButton compact /> : <HelpButton />) : null}
    </View>
  );
}

/** A pushed screen: the header bar, an optional big heading and grey line, a scrolling body and an optional pinned
 * footer (the one main button, or two stacked). */
export function Screen({
  title,
  heading,
  sub,
  footer,
  children,
  refreshing,
  onRefresh,
  help = true,
  onBack,
  headerRight,
  fallback,
}: {
  /** Short title in the header bar. */
  title: string;
  /** A big title at the top of the body (flows and set-up steps). */
  heading?: string;
  sub?: string;
  footer?: ReactNode;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Help in the top corner (build spec 8A: every screen has Help). */
  help?: boolean;
  onBack?: () => void;
  headerRight?: ReactNode;
  /** Where Back goes when there's nothing to go back to. */
  fallback?: string;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={IOS ? "padding" : undefined}>
        <ScreenHeader title={title} help={help} onBack={onBack} right={headerRight} fallback={fallback} />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32, gap: 20 }}
          refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} /> : undefined}
        >
          {heading || sub ? (
            <View style={{ gap: 8 }}>
              {heading ? <Title>{heading}</Title> : null}
              {sub ? <Sub>{sub}</Sub> : null}
            </View>
          ) : null}
          {children}
        </ScrollView>
        {footer ? <View style={{ paddingHorizontal: 20, paddingBottom: 12, paddingTop: 10, gap: 10, backgroundColor: colors.canvas }}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
