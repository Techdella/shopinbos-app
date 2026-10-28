import { useEffect, useState } from "react";
import { Tabs } from "expo-router";
import { CreateSheet } from "@/components/CreateSheet";
import { AppTabBar, type TabItem } from "@/components/TabBar";
import type { AppIconName } from "@/components/icons";
import { latestPicture, useChangedIdentity } from "@/lib/identity";
import { fetchSetup } from "@/lib/setup";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Seller: four tabs and an orange "+" (canvas boards A-Seller-Home and M-Menu): Home, Orders, +, Chats, Menu. On
// Android the "+" floats bottom-right. Everything else lives inside Menu (the route is still /shop, it was My shop),
// whose tab shows the shop's logo or initials. Products stays a route (Menu → Products) and /more redirects to the
// Menu, so old links and notifications still land.

type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>["tabBar"]>>[0];

/** The tabs in the bar, in order. The "+" sits between Orders and Chats on iPhone. */
export const TABS: { name: string; icon: AppIconName; label: string }[] = [
  { name: "home", icon: "home", label: "Home" },
  { name: "orders", icon: "box", label: "Orders" },
  { name: "chats", icon: "chat", label: "Chats" },
  { name: "shop", icon: "store", label: "Menu" },
];

function TabBar(props: TabBarProps) {
  const [creating, setCreating] = useState(false);
  // The Menu tab's picture: the shop's logo (or its initials). The store icon until it loads.
  const [shop, setShop] = useState<{ name: string; logoUrl: string | null } | null>(null);
  const changedPictures = useChangedIdentity();
  useEffect(() => {
    fetchSetup()
      .then((setup) => setShop(setup.store ? { name: setup.store.name, logoUrl: setup.store.logoUrl ?? null } : null))
      .catch(() => null);
  }, []);
  // Labels stay English in TABS; shown in the app language (shared/i18n "nav" catalog, "tab.<name>").
  const t = useT("nav");
  const items: TabItem[] = TABS.map((tab) => ({
    ...tab,
    label: t.dynamic(`tab.${tab.name}`, tab.label),
    avatar: tab.name === "shop" && shop ? { uri: latestPicture(changedPictures, "logoUrl", shop.logoUrl), name: shop.name } : null,
  }));
  return (
    <AppTabBar
      {...props}
      items={items}
      tint={colors.peach}
      // Products (a hidden tab) belongs to the Menu.
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
      {/* Not in the bar: Products opens from the Menu; /more is the old name of the Menu. */}
      <Tabs.Screen name="products" options={{ href: null }} />
      <Tabs.Screen name="more" options={{ href: null }} />
    </Tabs>
  );
}
