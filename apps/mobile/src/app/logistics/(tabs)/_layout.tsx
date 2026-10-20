import { Tabs } from "expo-router";
import type { AppIconName } from "@/components/icons";
import { AppTabBar, type TabItem } from "@/components/TabBar";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Delivery partner tabs ("Delivery partner app" prototype): Jobs, Chats, Money, Business. Business is the old "more"
// route (it was the menu), so old links still land. Today ("home") opens Jobs, or set-up while the company isn't set
// up; Riders lives under Business, and its old tab route opens that list.

const ITEMS: { name: string; icon: AppIconName; label: string; nav?: string }[] = [
  { name: "jobs", icon: "route", label: "Jobs", nav: "tab.logistics.jobs" },
  { name: "messages", icon: "chat", label: "Chats" },
  { name: "earnings", icon: "wallet", label: "Money", nav: "tab.logistics.earnings" },
  { name: "more", icon: "truck", label: "Business" },
];

type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>["tabBar"]>>[0];

function PartnerTabs(props: TabBarProps) {
  // Jobs and Money read the "nav" catalog ("tab.logistics.<name>"); Chats and Business are partner words.
  const nav = useT("nav");
  const t = useT("m_partner");
  const items: TabItem[] = ITEMS.map((item) => ({ name: item.name, icon: item.icon, label: item.nav ? nav.dynamic(item.nav, item.label) : t.dynamic(`tab.${item.name}`, item.label) }));
  return <AppTabBar {...props} items={items} tint={colors.mintTint} activeFor={(route) => (route === "home" ? "jobs" : route === "riders" ? "more" : route)} />;
}

export default function LogisticsTabs() {
  return (
    <Tabs tabBar={(props) => <PartnerTabs {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.canvas } }}>
      <Tabs.Screen name="jobs" />
      <Tabs.Screen name="messages" />
      <Tabs.Screen name="earnings" />
      <Tabs.Screen name="more" />
      {/* Not in the bar: the old Today and Riders tabs. */}
      <Tabs.Screen name="home" options={{ href: null }} />
      <Tabs.Screen name="riders" options={{ href: null }} />
    </Tabs>
  );
}
