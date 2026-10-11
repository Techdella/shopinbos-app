import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { AppIcon, type AppIconName } from "@/components/icons";
import { Card, LinkButton, T } from "@/components/ui";
import { TabScreen } from "@/components/TabScreen";
import { api, ApiError } from "@/lib/api";
import { signOut } from "@/lib/auth";
import { openWeb } from "@/lib/web";
import { colors } from "@/theme";

const LINKS: Array<{ label: string; icon: AppIconName; path: string }> = [
  { label: "Finish setting up", icon: "sparkle", path: "app:/onboarding/checklist" },
  { label: "Your store", icon: "store", path: "/home/editor" },
  { label: "Find products to sell", icon: "search", path: "/marketplace" },
  { label: "Record a sale", icon: "receipt", path: "app:/record-sale" },
  { label: "Customers", icon: "user", path: "/home/customers" },
  { label: "Labels and print", icon: "printer", path: "/home/labels" },
  { label: "Video studio", icon: "play", path: "/home/video" },
  { label: "Ads", icon: "megaphone", path: "/home/ads" },
  { label: "Affiliates", icon: "user", path: "/home/affiliates" },
  { label: "Money and payouts", icon: "coin", path: "/home/payments" },
  { label: "Delivery", icon: "truck", path: "/home/logistics" },
  { label: "Marketing", icon: "megaphone", path: "/home/marketing" },
  { label: "Settings", icon: "grid", path: "/home/settings" },
];

export default function More() {
  const [notSeller, setNotSeller] = useState(false);

  useEffect(() => {
    api("/api/app/onboarding").catch((error) => setNotSeller(error instanceof ApiError && error.status === 403));
  }, []);

  return (
    <TabScreen title="More">
      {notSeller && (
        <Card style={{ marginBottom: 12, gap: 6 }}>
          <T weight="extrabold" style={{ fontSize: 16 }}>This app is for sellers</T>
          <T style={{ color: colors.inkSoft }}>Supplier, delivery and admin portals are on the web for now.</T>
        </Card>
      )}
      <Card style={{ paddingVertical: 4 }}>
        {LINKS.map((link, index) => (
          <Pressable
            key={link.label}
            accessibilityRole="button"
            onPress={() => (link.path.startsWith("app:") ? router.push(link.path.slice(4) as never) : void openWeb(link.path))}
            style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 15, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}
          >
            <AppIcon name={link.icon} size={20} />
            <T weight="semibold" style={{ flex: 1, fontSize: 15 }}>{link.label}</T>
            <AppIcon name="chevron" size={18} color={colors.inkSoft} />
          </Pressable>
        ))}
      </Card>
      <View style={{ marginTop: 16 }}>
        <LinkButton title="Log out" color={colors.danger} onPress={() => void signOut().then(() => router.replace("/welcome"))} />
      </View>
    </TabScreen>
  );
}
