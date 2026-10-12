import { Tabs } from "expo-router";
import { PartnerTabBar } from "@/components/partner";
import type { AppIconName } from "@/components/icons";
import { colors } from "@/theme";

// Delivery partner tabs (spec 8A "Simple supplier, delivery and rider apps"): Today, Jobs, Riders, Money.
// Messages and More (the menu) keep their routes but have no tab: they open from the "Messages" and "Menu" buttons
// on Today.

const ITEMS: Record<string, { icon: AppIconName; label: string }> = {
  home: { icon: "home", label: "Today" },
  jobs: { icon: "box", label: "Jobs" },
  riders: { icon: "truck", label: "Riders" },
  earnings: { icon: "wallet", label: "Money" },
};

export default function LogisticsTabs() {
  return (
    <Tabs tabBar={(props) => <PartnerTabBar {...props} items={ITEMS} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.canvas } }}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="jobs" />
      <Tabs.Screen name="riders" />
      <Tabs.Screen name="earnings" />
      <Tabs.Screen name="messages" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}
