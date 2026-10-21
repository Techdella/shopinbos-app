import { Tabs } from "expo-router";
import { AppTabBar, type TabItem } from "@/components/TabBar";
import type { AppIconName } from "@/components/icons";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Supplier tabs ("Simple app, end to end" supplier prototype): Home, Orders, Products, Chats, Money. Price requests
// from shops are the Orders tab's "Prices"; the old Quote requests list and More stay as routes (Account opens the
// list, /supplier/more redirects) so links and notifications still land. Chats is the "messages" route.

type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>["tabBar"]>>[0];

/** The tabs in the bar, in order. Labels stay English here and come from the "nav" catalog ("tab.supplier.<name>"). */
export const SUPPLIER_TABS: { name: string; icon: AppIconName; label: string; key: string }[] = [
  { name: "home", icon: "home", label: "Home", key: "tab.supplier.home" },
  { name: "orders", icon: "box", label: "Orders", key: "tab.supplier.orders" },
  { name: "products", icon: "tag", label: "Products", key: "tab.supplier.products" },
  { name: "messages", icon: "chat", label: "Chats", key: "tab.chats" },
  { name: "money", icon: "wallet", label: "Money", key: "tab.supplier.money" },
];

function SupplierTabBar(props: TabBarProps) {
  const t = useT("nav");
  const items: TabItem[] = SUPPLIER_TABS.map((tab) => ({ name: tab.name, icon: tab.icon, label: t.dynamic(tab.key, tab.label) }));
  return <AppTabBar {...props} items={items} tint={colors.mintTint} activeFor={(route) => (route === "quotes" ? "orders" : route === "more" ? "money" : route)} />;
}

export default function SupplierTabs() {
  return (
    <Tabs tabBar={(props) => <SupplierTabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.canvas } }}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="orders" />
      <Tabs.Screen name="products" />
      <Tabs.Screen name="messages" />
      <Tabs.Screen name="money" />
      <Tabs.Screen name="quotes" options={{ href: null }} />
      <Tabs.Screen name="more" options={{ href: null }} />
    </Tabs>
  );
}
