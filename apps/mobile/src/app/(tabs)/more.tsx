import { useEffect, useState } from "react";
import { Pressable, Share, View } from "react-native";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import { AppIcon, type AppIconName } from "@/components/icons";
import { LinkRow } from "@/components/kit";
import { Card, LinkButton, T } from "@/components/ui";
import { TabScreen } from "@/components/TabScreen";
import { ApiError } from "@/lib/api";
import { signOut } from "@/lib/auth";
import { fetchSetup, patchSetup, type SetupOverview } from "@/lib/setup";
import { openWeb } from "@/lib/web";
import { colors, radii } from "@/theme";

// "app:" paths are screens in the app; the rest open that page of the web app, signed in.
type MoreLink = { label: string; icon: AppIconName; path: string; hint?: string };

const SECTIONS: Array<{ title: string; links: MoreLink[] }> = [
  {
    title: "Your shop",
    links: [
      { label: "Start here", icon: "sparkle", path: "app:/start", hint: "What's left to set up" },
      { label: "Edit your store", icon: "store", path: "/home/editor", hint: "Opens the web" },
      { label: "Store templates", icon: "grid", path: "/builder/templates", hint: "Pick a new look (opens the web)" },
      { label: "Rex Studio", icon: "sparkle", path: "app:/rex", hint: "Pictures, logos, sections, campaigns" },
      { label: "Legal pages", icon: "doc", path: "app:/legal" },
    ],
  },
  {
    title: "Sell more",
    links: [
      { label: "Find products to sell", icon: "search", path: "app:/find" },
      { label: "Reviews", icon: "star", path: "app:/reviews" },
      { label: "Marketing and discounts", icon: "megaphone", path: "app:/marketing" },
      { label: "Email templates", icon: "mail", path: "app:/marketing/templates" },
      { label: "Ads", icon: "megaphone", path: "/home/ads" },
      { label: "Affiliates", icon: "user", path: "/home/affiliates" },
      { label: "Video studio", icon: "play", path: "/home/video" },
    ],
  },
  {
    title: "Run your shop",
    links: [
      { label: "Record a sale", icon: "receipt", path: "app:/record-sale" },
      { label: "Partner messages", icon: "truck", path: "app:/partners", hint: "Suppliers and delivery partners" },
      { label: "Customers", icon: "user", path: "/home/customers" },
      { label: "Labels and print", icon: "printer", path: "/home/labels" },
      { label: "Money and payouts", icon: "coin", path: "/home/payments" },
      { label: "Delivery", icon: "truck", path: "/home/logistics" },
    ],
  },
  {
    title: "Settings",
    links: [
      { label: "Auto-replies", icon: "clock", path: "app:/inbox/auto-replies" },
      { label: "Peggy chatbot", icon: "bot", path: "app:/inbox/chatbot" },
      { label: "Peggy & Rex", icon: "sparkle", path: "/home/settings?tab=Peggy%20%26%20Rex", hint: "How they work for you (opens the web)" },
      { label: "Settings", icon: "settings", path: "/home/settings" },
    ],
  },
];

function go(path: string) {
  if (path.startsWith("app:")) router.push(path.slice(4) as never);
  else void openWeb(path);
}

export default function More() {
  const [notSeller, setNotSeller] = useState(false);
  const [store, setStore] = useState<SetupOverview["store"] | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchSetup()
      .then((overview) => setStore(overview.store))
      .catch((error) => setNotSeller(error instanceof ApiError && error.status === 403));
  }, []);

  async function share(url: string) {
    const result = await Share.share({ message: `Shop with ${store?.name ?? "us"}: ${url}` }).catch(() => null);
    // Counts towards the "Share your shop link" step on Start here.
    if (result && result.action !== Share.dismissedAction) void patchSetup({ type: "shared" }).catch(() => null);
  }

  async function copy(url: string) {
    await Clipboard.setStringAsync(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <TabScreen title="More">
      {notSeller && (
        <Card style={{ marginBottom: 12, gap: 6 }}>
          <T weight="extrabold" style={{ fontSize: 16 }}>This app is for sellers</T>
          <T style={{ color: colors.inkSoft }}>Supplier, delivery and admin portals are on the web for now.</T>
        </Card>
      )}

      {store?.url ? (
        <View style={{ backgroundColor: colors.ink, borderRadius: radii.card, padding: 16, gap: 10, marginBottom: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <AppIcon name="store" size={20} color="#FFFFFF" />
            <View style={{ flex: 1 }}>
              <T weight="extrabold" style={{ color: "#FFFFFF", fontSize: 15 }} numberOfLines={1}>{store.name}</T>
              <T style={{ color: "rgba(255,255,255,0.75)", fontSize: 12.5 }} numberOfLines={1} selectable>{store.url.replace(/^https?:\/\//, "")}</T>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {[
              { label: "Share link", onPress: () => void share(store.url!) },
              { label: copied ? "Copied" : "Copy", onPress: () => void copy(store.url!) },
              { label: "Open", onPress: () => void WebBrowser.openBrowserAsync(store.url!) },
            ].map((action, index) => (
              <Pressable key={action.label} accessibilityRole="button" onPress={action.onPress} style={{ flex: index === 0 ? 1.4 : 1, height: 40, borderRadius: radii.pill, backgroundColor: index === 0 ? colors.accent : "#2E2B3B", alignItems: "center", justifyContent: "center" }}>
                <T weight="bold" style={{ color: "#FFFFFF", fontSize: 13 }}>{action.label}</T>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {SECTIONS.map((section) => (
        <View key={section.title} style={{ marginBottom: 14 }}>
          <T weight="bold" style={{ color: colors.inkSoft, fontSize: 12.5, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6, marginLeft: 4 }}>{section.title}</T>
          <Card style={{ paddingVertical: 2 }}>
            {section.links.map((link, index) => (
              <LinkRow key={link.label} first={index === 0} icon={link.icon} label={link.label} hint={link.hint} onPress={() => go(link.path)} />
            ))}
          </Card>
        </View>
      ))}
      <View style={{ marginTop: 4 }}>
        <LinkButton title="Log out" color={colors.danger} onPress={() => void signOut().then(() => router.replace("/welcome"))} />
      </View>
    </TabScreen>
  );
}
