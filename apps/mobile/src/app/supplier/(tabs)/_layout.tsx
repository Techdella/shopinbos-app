import { Tabs } from "expo-router";
import { PartnerTabBar } from "@/components/partner";
import type { AppIconName } from "@/components/icons";
import { colors } from "@/theme";

// Supplier tabs: Home, Orders, Products, Quotes, Messages, More.

const ITEMS: Record<string, { icon: AppIconName; label: string }> = {
  home: { icon: "home", label: "Home" },
  orders: { icon: "bag", label: "Orders" },
  products: { icon: "box", label: "Products" },
  quotes: { icon: "tag", label: "Quotes" },
  messages: { icon: "chat", label: "Messages" },
  more: { icon: "grid", label: "More" },
};

export default function SupplierTabs() {
  return (
    <Tabs tabBar={(props) => <PartnerTabBar {...props} items={ITEMS} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.canvas } }}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="orders" />
      <Tabs.Screen name="products" />
      <Tabs.Screen name="quotes" />
      <Tabs.Screen name="messages" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}
