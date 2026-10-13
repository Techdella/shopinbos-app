import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { HelpButton } from "@/components/Help";
import { LanguageRow } from "@/components/LanguagePicker";
import { AppIcon, type AppIconName } from "@/components/icons";
import { LinkRow } from "@/components/kit";
import { Card, LinkButton, PillButton, T } from "@/components/ui";
import { TabScreen } from "@/components/TabScreen";
import { ApiError } from "@/lib/api";
import { signOut } from "@/lib/auth";
import { fetchSetup, type SetupOverview } from "@/lib/setup";
import { openShop, shareShop } from "@/lib/share";
import { openWeb } from "@/lib/web";
import { colors, radii } from "@/theme";

// My shop (build spec 8A): everything that isn't Home, Orders or Chats, grouped by goal. "app:" paths are
// screens in the app; "web:" opens that page of the web app, signed in. Technical jobs (domain, connecting
// WhatsApp and Instagram) go to "Ask us", where the Shopinbos team sets them up.
type ShopLink = { label: string; icon: AppIconName; path: string; hint?: string };

export const SHOP_GROUPS: { title: string; links: ShopLink[] }[] = [
  {
    title: "Sell",
    links: [
      { label: "My products", icon: "box", path: "app:/products", hint: "Prices, photos, inventory" },
      { label: "Dropship", icon: "truck", path: "app:/dropship", hint: "Sell products a supplier sends for you" },
      { label: "Find products to sell", icon: "search", path: "app:/find", hint: "From suppliers in Nigeria and China" },
      { label: "Themes", icon: "image", path: "app:/web-only?what=look", hint: "How your shop looks: colours, logo and pictures" },
      { label: "Connect WhatsApp, Instagram, TikTok", icon: "chat", path: "app:/ask-us?what=channels", hint: "We set it up for you" },
    ],
  },
  {
    title: "Get paid and deliver",
    links: [
      { label: "Payments and payouts", icon: "coin", path: "web:/home/payments", hint: "Money sent to your bank. Opens in your browser" },
      { label: "Delivery", icon: "truck", path: "web:/home/logistics", hint: "Where you deliver and the price. Opens in your browser" },
      { label: "Partner messages", icon: "users", path: "app:/partners", hint: "Suppliers and delivery partners" },
    ],
  },
  {
    title: "Grow",
    links: [
      { label: "Marketing", icon: "megaphone", path: "app:/marketing", hint: "Campaigns, discount codes and ads" },
      { label: "Reviews", icon: "star", path: "app:/reviews", hint: "What customers say, and asking for more" },
      { label: "Rex Studio", icon: "sparkle", path: "app:/rex", hint: "Pictures, logo and words for your shop" },
      { label: "Domain", icon: "store", path: "app:/ask-us?what=web-address", hint: "Your own name like yourshop.com. We set it up for you" },
    ],
  },
  {
    title: "Settings and help",
    links: [
      { label: "Auto-replies", icon: "clock", path: "app:/inbox/auto-replies", hint: "Away message and opening hours" },
      { label: "Peggy chatbot", icon: "bot", path: "app:/inbox/chatbot", hint: "Answers shoppers on your shop's chat, day and night" },
      { label: "Notifications", icon: "bell", path: "app:/notifications", hint: "Orders, payments and messages, and what buzzes your phone" },
      { label: "Settings", icon: "settings", path: "web:/home/settings", hint: "Your details, team, notifications. Opens in your browser" },
      { label: "Legal pages", icon: "doc", path: "app:/legal", hint: "Refunds, delivery, privacy" },
      { label: "Help", icon: "help", path: "app:/help", hint: "A person, or Peggy" },
    ],
  },
];

function go(path: string) {
  if (path.startsWith("app:")) router.push(path.slice(4) as never);
  else void openWeb(path.replace(/^web:/, ""));
}

export default function MyShop() {
  const [notSeller, setNotSeller] = useState(false);
  const [setup, setSetup] = useState<SetupOverview | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchSetup()
        .then(setSetup)
        .catch((error) => setNotSeller(error instanceof ApiError && error.status === 403));
    }, []),
  );

  const store = setup?.store ?? null;
  const checklist = setup?.checklist;

  async function share() {
    setShareNote(null);
    if ((await shareShop().catch(() => "no-link" as const)) === "no-link") setShareNote("Your shop link isn't ready yet. Finish setting up first.");
  }

  return (
    <TabScreen title="My shop" action={<HelpButton />}>
      {notSeller && (
        <Card style={{ marginBottom: 12, gap: 6 }}>
          <T weight="extrabold" style={{ fontSize: 17 }}>This part of the app is for sellers</T>
          <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>Log out and log in with your supplier or delivery account to see your own screens.</T>
        </Card>
      )}

      {store ? (
        <Card style={{ gap: 12, marginBottom: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: colors.peach, alignItems: "center", justifyContent: "center" }}>
              <AppIcon name="store" size={22} color={colors.accentInk} />
            </View>
            <View style={{ flex: 1 }}>
              <T weight="extrabold" style={{ fontSize: 18 }} numberOfLines={1}>{store.name}</T>
              {store.url ? <T style={{ color: colors.inkSoft, fontSize: 15 }} numberOfLines={1} selectable>{store.url.replace(/^https?:\/\//, "")}</T> : <T style={{ color: colors.inkSoft, fontSize: 15 }}>Your shop link comes when you finish setting up</T>}
            </View>
          </View>
          {store.url ? (
            <>
              <PillButton testID="share-shop" title="Share my shop" tone="accent" onPress={() => void share()}>
                <AppIcon name="share" size={20} color="#FFFFFF" />
                <T weight="extrabold" style={{ color: "#FFFFFF", fontSize: 16 }}>Share my shop</T>
              </PillButton>
              <LinkButton title="See my shop" onPress={() => void openShop(store.url!)} />
            </>
          ) : null}
          {shareNote ? <T style={{ color: colors.danger, fontSize: 15 }}>{shareNote}</T> : null}
        </Card>
      ) : null}

      {checklist?.showStart && !checklist.complete ? (
        <Pressable accessibilityRole="button" onPress={() => router.push("/start")} style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 16, gap: 10, marginBottom: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <AppIcon name="sparkle" size={20} color={colors.accentInk} />
            <T weight="extrabold" style={{ flex: 1, fontSize: 17 }}>Finish setting up</T>
            <T style={{ color: colors.inkSoft, fontSize: 15 }}>{checklist.done} of {checklist.total} done</T>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.canvas, overflow: "hidden" }}>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.success, width: `${checklist.percent}%` }} />
          </View>
        </Pressable>
      ) : null}

      {SHOP_GROUPS.map((group) => (
        <View key={group.title} style={{ marginBottom: 14 }}>
          <T weight="extrabold" style={{ fontSize: 17, marginBottom: 6, marginLeft: 4 }} accessibilityRole="header">{group.title}</T>
          <Card style={{ paddingVertical: 2 }}>
            {group.links.map((link, index) => (
              <LinkRow key={link.label} first={index === 0} icon={link.icon} label={link.label} hint={link.hint} onPress={() => go(link.path)} />
            ))}
          </Card>
        </View>
      ))}
      <Card style={{ paddingVertical: 2, marginBottom: 14 }}>
        <LanguageRow first />
      </Card>
      <View style={{ marginTop: 4 }}>
        <LinkButton title="Log out" color={colors.danger} onPress={() => void signOut().then(() => router.replace("/welcome"))} />
      </View>
    </TabScreen>
  );
}
