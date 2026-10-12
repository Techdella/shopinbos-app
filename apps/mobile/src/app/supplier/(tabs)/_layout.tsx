import { Tabs } from "expo-router";
import { PartnerTabBar } from "@/components/partner";
import type { AppIconName } from "@/components/icons";
import { colors } from "@/theme";

// Supplier tabs (build spec 8A): Home, Orders, Products, Money. Bulk requests from shops live in Orders, chats open
// from Home, and the old More tab's rows are on Money. Those routes stay so links and notifications still land.

export const SUPPLIER_TABS: Record<string, { icon: AppIconName; label: string }> = {
  home: { icon: "home", label: "Home" },
  orders: { icon: "bag", label: "Orders" },
  products: { icon: "box", label: "Products" },
  money: { icon: "wallet", label: "Money" },
};

export default function SupplierTabs() {
  return (
    <Tabs tabBar={(props) => <PartnerTabBar {...props} items={SUPPLIER_TABS} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.canvas } }}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="orders" />
      <Tabs.Screen name="products" />
      <Tabs.Screen name="money" />
      <Tabs.Screen name="quotes" options={{ href: null }} />
      <Tabs.Screen name="messages" options={{ href: null }} />
      <Tabs.Screen name="more" options={{ href: null }} />
    </Tabs>
  );
}
