import { Redirect, Tabs } from "expo-router";
import { AppTabBar, type TabItem } from "@/components/TabBar";
import { riderToken } from "@/lib/rider";
import { useRiderStrings } from "@/lib/rider-strings";
import { colors } from "@/theme";

// Shopinbos Riders ("Simple app, end to end" prototype, E2E-Rider): three tabs, Today, Earnings and Me, with the
// mint pill behind the active icon on Android. A job's steps (pickup, codes, cash, delivered, help) are pushed
// over the tabs from app/rider/job.tsx. Riders have no account: no saved key means signing in (phone and code, or the link).

export default function RiderTabs() {
  const { say } = useRiderStrings();
  if (!riderToken()) return <Redirect href="/rider/sign-in" />;
  const items: TabItem[] = [
    { name: "index", icon: "home", label: say("tab.today") },
    { name: "earnings", icon: "coin", label: say("tab.earnings") },
    { name: "me", icon: "user", label: say("tab.me") },
  ];
  return (
    <Tabs tabBar={(props) => <AppTabBar {...props} items={items} tint={colors.mintTint} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.canvas } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="earnings" />
      <Tabs.Screen name="me" />
    </Tabs>
  );
}
