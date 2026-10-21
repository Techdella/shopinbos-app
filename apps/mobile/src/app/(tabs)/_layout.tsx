import { useState } from "react";
import { Tabs } from "expo-router";
import { CreateSheet } from "@/components/CreateSheet";
import { AppTabBar, type TabItem } from "@/components/TabBar";
import type { AppIconName } from "@/components/icons";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Seller: four tabs and an orange "+" ("Simple app, end to end" prototype): Home, Orders, +, Chats, My shop. On
// Android the "+" floats bottom-right. Everything else lives inside My shop. Products stays a route
// (My shop → Products) and /more redirects to My shop, so old links and notifications still land.

type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>["tabBar"]>>[0];

/** The tabs in the bar, in order. The "+" sits between Orders and Chats on iPhone. */
export const TABS: { name: string; icon: AppIconName; label: string }[] = [
  { name: "home", icon: "home", label: "Home" },
  { name: "orders", icon: "box", label: "Orders" },
  { name: "chats", icon: "chat", label: "Chats" },
  { name: "shop", icon: "store", label: "My shop" },
];

function TabBar(props: TabBarProps) {
  const [creating, setCreating] = useState(false);
  // Labels stay English in TABS; shown in the app language (shared/i18n "nav" catalog, "tab.<name>").
  const t = useT("nav");
  const items: TabItem[] = TABS.map((tab) => ({ ...tab, label: t.dynamic(`tab.${tab.name}`, tab.label) }));
  return (
    <AppTabBar
      {...props}
      items={items}
      tint={colors.peach}
      // Products (a hidden tab) belongs to My shop.
      activeFor={(route) => (route === "products" || route === "more" ? "shop" : route)}
      plus={{ label: t("tab.create"), onPress: () => setCreating(true), testID: "create-button", sheet: <CreateSheet visible={creating} onClose={() => setCreating(false)} /> }}
    />
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.canvas } }}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="orders" />
      <Tabs.Screen name="chats" />
      <Tabs.Screen name="shop" />
      {/* Not in the bar: Products opens from My shop; /more is the old name of My shop. */}
      <Tabs.Screen name="products" options={{ href: null }} />
      <Tabs.Screen name="more" options={{ href: null }} />
    </Tabs>
  );
}
