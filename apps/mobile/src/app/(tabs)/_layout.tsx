import { Pressable, StyleSheet, View } from "react-native";
import { router, Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon, type AppIconName } from "@/components/icons";
import { colors } from "@/theme";

// Floating pill tab bar with the orange "create" button, from the Seller app (iOS and Android) mockup.

type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>["tabBar"]>>[0];

const ICONS: Record<string, { icon: AppIconName; label: string }> = {
  home: { icon: "home", label: "Home" },
  products: { icon: "box", label: "Products" },
  chats: { icon: "chat", label: "Chats" },
  orders: { icon: "bag", label: "Orders" },
  more: { icon: "grid", label: "More" },
};

function TabBar({ state, navigation, descriptors }: TabBarProps) {
  const insets = useSafeAreaInsets();
  // A screen hides the bar with options.tabBarStyle = { display: "none" } (Home does while it shows a full-screen loading state).
  const focusedOptions = descriptors[state.routes[state.index].key]?.options;
  if ((StyleSheet.flatten(focusedOptions?.tabBarStyle) as { display?: string } | undefined)?.display === "none") return null;
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 14, right: 14, bottom: Math.max(insets.bottom, 12), flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View style={{ flex: 1, flexDirection: "row", justifyContent: "space-between", backgroundColor: colors.surface, borderRadius: 999, padding: 6, shadowColor: colors.ink, shadowOpacity: 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}>
        {state.routes.map((route, index) => {
          const meta = ICONS[route.name];
          if (!meta) return null;
          const focused = state.index === index;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={meta.label}
              accessibilityState={{ selected: focused }}
              onPress={() => {
                const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
              }}
              style={{ width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: focused ? colors.ink : "transparent" }}
            >
              <AppIcon name={meta.icon} color={focused ? "#FFFFFF" : colors.ink} />
            </Pressable>
          );
        })}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add products"
        onPress={() => router.push("/add-products")}
        style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", shadowColor: colors.accent, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}
      >
        <AppIcon name="plus" color="#FFFFFF" size={26} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.canvas } }}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="products" />
      <Tabs.Screen name="chats" />
      <Tabs.Screen name="orders" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}
