import type { ReactNode } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import type { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon, type AppIconName } from "@/components/icons";
import { Picture } from "@/components/kit";
import { T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// The bottom bar of every role ("Simple app, end to end" prototype `.tb`): white, a hairline on top, icon over label.
// Android tints a pill behind the active icon (peach for sellers, mint for suppliers, partners and riders). An optional
// orange "+" sits in the middle of the bar on iPhone and floats bottom-right on Android.

type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>["tabBar"]>>[0];

/** `avatar`: the tab shows this picture (or its initials) instead of the icon, ringed while active (the seller's
 * Menu tab, canvas board M-Menu). */
export type TabItem = { name: string; icon: AppIconName; label: string; badge?: number; avatar?: { uri: string | null; name: string } | null };

const ANDROID = Platform.OS === "android";

function TabButton({ item, focused, tint, onPress }: { item: TabItem; focused: boolean; tint: string; onPress: () => void }) {
  const t = useT("m_ui");
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={item.badge ? t("partner.tabNew", { label: item.label, count: item.badge }) : item.label}
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      style={{ flex: 1, minHeight: 54, alignItems: "center", justifyContent: "flex-start", gap: 4, paddingTop: 4 }}
    >
      <View style={{ width: 60, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: ANDROID && focused ? tint : "transparent" }}>
        {item.avatar ? (
          <View style={{ borderRadius: 14, borderWidth: 2, borderColor: focused ? colors.ink : "transparent", padding: 1 }}>
            <Picture uri={item.avatar.uri} name={item.avatar.name} size={22} />
          </View>
        ) : (
          <AppIcon name={item.icon} size={22} color={focused ? colors.ink : colors.inkSoft} strokeWidth={focused ? 2.3 : 1.9} />
        )}
        {item.badge ? (
          <View style={{ position: "absolute", top: -2, right: 10, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
            <T weight="extrabold" style={{ fontSize: 10, color: colors.ink }}>{item.badge > 9 ? "9+" : String(item.badge)}</T>
          </View>
        ) : null}
      </View>
      <T weight="bold" numberOfLines={1} style={{ fontSize: 12, color: focused ? colors.ink : colors.inkSoft }}>{item.label}</T>
    </Pressable>
  );
}

export function AppTabBar({
  state,
  navigation,
  descriptors,
  items,
  tint = colors.peach,
  activeFor,
  plus,
}: TabBarProps & {
  items: TabItem[];
  tint?: string;
  /** Maps a hidden route to the tab it belongs to (e.g. products → shop). */
  activeFor?: (route: string) => string;
  /** The orange "+" and what it opens (its sheet is rendered by the caller via `plus.sheet`). */
  plus?: { label: string; onPress: () => void; sheet?: ReactNode; testID?: string };
}) {
  const insets = useSafeAreaInsets();
  const focusedOptions = descriptors[state.routes[state.index].key]?.options;
  if ((StyleSheet.flatten(focusedOptions?.tabBarStyle) as { display?: string } | undefined)?.display === "none") return plus?.sheet ?? null;
  const current = state.routes[state.index]?.name;
  const active = activeFor ? activeFor(current) : current;

  const button = (item: TabItem) => {
    const route = state.routes.find((entry) => entry.name === item.name);
    if (!route) return null;
    const focused = active === item.name;
    return (
      <TabButton
        key={item.name}
        item={item}
        tint={tint}
        focused={focused}
        onPress={() => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (current !== item.name && !event.defaultPrevented) navigation.navigate(route.name);
        }}
      />
    );
  };

  const half = Math.ceil(items.length / 2);
  const middle = plus && !ANDROID;
  return (
    <>
      <View accessibilityRole="tablist" style={{ position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "flex-start", backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: 6, paddingTop: ANDROID ? 10 : 8, paddingBottom: Math.max(insets.bottom, ANDROID ? 12 : 8) }}>
        {(middle ? items.slice(0, half) : items).map(button)}
        {middle ? (
          <Pressable
            testID={plus.testID}
            accessibilityRole="button"
            accessibilityLabel={plus.label}
            onPress={plus.onPress}
            style={({ pressed }) => ({ width: 58, height: 58, borderRadius: 29, marginTop: -26, marginHorizontal: 4, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: colors.surface, shadowColor: colors.accent, shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 10 }, elevation: 8, opacity: pressed ? 0.85 : 1 })}
          >
            <AppIcon name="plus" color={colors.ink} size={28} strokeWidth={2.6} />
          </Pressable>
        ) : null}
        {middle ? items.slice(half).map(button) : null}
      </View>
      {plus && ANDROID ? (
        <Pressable
          testID={plus.testID}
          accessibilityRole="button"
          accessibilityLabel={plus.label}
          onPress={plus.onPress}
          style={({ pressed }) => ({ position: "absolute", right: 20, bottom: Math.max(insets.bottom, 12) + 84, width: 60, height: 60, borderRadius: 18, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", shadowColor: colors.ink, shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 9, opacity: pressed ? 0.85 : 1 })}
        >
          <AppIcon name="plus" color={colors.ink} size={28} strokeWidth={2.6} />
        </Pressable>
      ) : null}
      {plus?.sheet}
    </>
  );
}
