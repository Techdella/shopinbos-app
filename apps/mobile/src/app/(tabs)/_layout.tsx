import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CreateSheet } from "@/components/CreateSheet";
import { AppIcon, type AppIconName } from "@/components/icons";
import { T } from "@/components/ui";
import { colors } from "@/theme";

// Four tabs and a big orange "+" in the middle (build spec 8A, "Simple app" prototype): Home, Orders, +, Chats,
// My shop. Everything else lives inside My shop. Products stays a route (My shop → My products) and /more
// redirects to My shop, so old links and notifications still land.

type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>["tabBar"]>>[0];

/** The tabs in the bar, in order. The "+" sits between Orders and Chats. */
export const TABS: { name: string; icon: AppIconName; label: string }[] = [
  { name: "home", icon: "home", label: "Home" },
  { name: "orders", icon: "bag", label: "Orders" },
  { name: "chats", icon: "chat", label: "Chats" },
  { name: "shop", icon: "store", label: "My shop" },
];

function TabButton({ label, icon, focused, onPress }: { label: string; icon: AppIconName; focused: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      style={{ flex: 1, minHeight: 58, alignItems: "center", justifyContent: "center", gap: 3 }}
    >
      <AppIcon name={icon} size={22} color={focused ? colors.ink : colors.inkSoft} strokeWidth={focused ? 2.3 : 1.9} />
      <T weight={focused ? "extrabold" : "semibold"} numberOfLines={1} style={{ fontSize: 14, color: focused ? colors.ink : colors.inkSoft }}>{label}</T>
    </Pressable>
  );
}

function TabBar({ state, navigation, descriptors }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const [creating, setCreating] = useState(false);
  // A screen hides the bar with options.tabBarStyle = { display: "none" } (Home does while it shows a full-screen loading state).
  const focusedOptions = descriptors[state.routes[state.index].key]?.options;
  if ((StyleSheet.flatten(focusedOptions?.tabBarStyle) as { display?: string } | undefined)?.display === "none") return null;
  const current = state.routes[state.index]?.name;
  // My products (a hidden tab) belongs to My shop.
  const active = current === "products" || current === "more" ? "shop" : current;

  const button = (tab: (typeof TABS)[number]) => {
    const route = state.routes.find((item) => item.name === tab.name);
    if (!route) return null;
    const focused = active === tab.name;
    return (
      <TabButton
        key={tab.name}
        label={tab.label}
        icon={tab.icon}
        focused={focused}
        onPress={() => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (current !== tab.name && !event.defaultPrevented) navigation.navigate(route.name);
        }}
      />
    );
  };

  return (
    <>
      <View accessibilityRole="tablist" style={{ position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: 8, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 8) }}>
        {TABS.slice(0, 2).map(button)}
        <View style={{ flex: 1, alignItems: "center" }}>
          <Pressable
            testID="create-button"
            accessibilityRole="button"
            accessibilityLabel="Add or sell"
            onPress={() => setCreating(true)}
            style={({ pressed }) => ({ width: 62, height: 62, borderRadius: 31, marginTop: -26, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: colors.surface, shadowColor: colors.accent, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8, opacity: pressed ? 0.85 : 1 })}
          >
            <AppIcon name="plus" color="#FFFFFF" size={28} strokeWidth={2.6} />
          </Pressable>
        </View>
        {TABS.slice(2).map(button)}
      </View>
      <CreateSheet visible={creating} onClose={() => setCreating(false)} />
    </>
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.canvas } }}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="orders" />
      <Tabs.Screen name="chats" />
      <Tabs.Screen name="shop" />
      {/* Not in the bar: My products opens from My shop; /more is the old name of My shop. */}
      <Tabs.Screen name="products" options={{ href: null }} />
      <Tabs.Screen name="more" options={{ href: null }} />
    </Tabs>
  );
}
