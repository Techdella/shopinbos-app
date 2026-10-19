import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { HelpButton } from "@/components/Help";
import { LanguageRow } from "@/components/LanguagePicker";
import { AppIcon, type AppIconName } from "@/components/icons";
import { LinkRow, Picture } from "@/components/kit";
import { Card, LinkButton, PillButton, T } from "@/components/ui";
import { TabScreen } from "@/components/TabScreen";
import { ApiError } from "@/lib/api";
import { signOut } from "@/lib/auth";
import { latestPicture, useChangedIdentity } from "@/lib/identity";
import { fetchSetup, type SetupOverview } from "@/lib/setup";
import { openShop, shareShop } from "@/lib/share";
import { openWeb } from "@/lib/web";
import { useT } from "@/lib/i18n";
import { colors, radii } from "@/theme";

// My shop (build spec 8A): everything that isn't Home, Orders or Chats, grouped by goal. "app:" paths are
// screens in the app; "web:" opens that page of the web app, signed in. Sell everywhere connects each platform in one tap
// (its sign-in runs in the in-app browser and comes back to the app). The domain goes to "Ask us", where the
// Shopinbos team sets it up.
// Words are translated at render: m_shop "group.<key>", "link.<id>.label" and "link.<id>.hint" (English here is the fallback).
type ShopLink = { id: string; label: string; icon: AppIconName; path: string; hint?: string };

export const SHOP_GROUPS: { key: string; title: string; links: ShopLink[] }[] = [
  {
    key: "sell",
    title: "Sell",
    links: [
      { id: "products", label: "My products", icon: "box", path: "app:/products", hint: "Prices, photos, inventory" },
      { id: "customers", label: "Customers", icon: "users", path: "app:/customers", hint: "Everyone who bought from you, and a message to each" },
      { id: "dropship", label: "Dropship", icon: "truck", path: "app:/dropship", hint: "Sell products a supplier sends for you" },
      { id: "find", label: "Find products to sell", icon: "search", path: "app:/find", hint: "From suppliers in Nigeria and China" },
      { id: "themes", label: "Themes", icon: "image", path: "app:/web-only?what=look", hint: "How your shop looks: colours, logo and pictures" },
      { id: "channels", label: "Sell everywhere", icon: "chat", path: "app:/channels", hint: "Connect WhatsApp, Facebook, TikTok and Google" },
    ],
  },
  {
    key: "paid",
    title: "Get paid and deliver",
    links: [
      { id: "payments", label: "Payments and payouts", icon: "coin", path: "app:/payments", hint: "How customers pay you, and money sent to your bank" },
      { id: "payouts", label: "Payouts", icon: "wallet", path: "app:/payouts", hint: "Every paid order and where the money went" },
      { id: "invoices", label: "Invoices", icon: "doc", path: "app:/invoices", hint: "Order invoices, and bills you send or get" },
      { id: "paymentLinks", label: "Payment links", icon: "link", path: "app:/payment-links", hint: "A link a customer opens from a chat to pay" },
      { id: "delivery", label: "Delivery", icon: "truck", path: "app:/delivery", hint: "Where you deliver and the price" },
      { id: "partners", label: "Partner messages", icon: "users", path: "app:/partners", hint: "Suppliers and delivery partners" },
    ],
  },
  {
    key: "grow",
    title: "Grow",
    links: [
      { id: "marketing", label: "Marketing", icon: "megaphone", path: "app:/marketing", hint: "Campaigns, discount codes and ads" },
      { id: "ads", label: "Ads", icon: "megaphone", path: "app:/ads", hint: "Facebook, Instagram and TikTok ads, and what they bring in" },
      { id: "automations", label: "Automations", icon: "sparkle", path: "app:/marketing/automations", hint: "Messages that send themselves: welcome, cart reminder, thank-you" },
      { id: "campaigns", label: "Seasonal campaigns", icon: "clock", path: "app:/campaigns", hint: "Black Friday, Christmas and more, with a countdown" },
      { id: "reviews", label: "Reviews", icon: "star", path: "app:/reviews", hint: "What customers say, and asking for more" },
      { id: "linkInBio", label: "Link in bio", icon: "share", path: "app:/link-in-bio", hint: "One page for your Instagram and TikTok bio" },
      { id: "video", label: "Video studio", icon: "play", path: "app:/video", hint: "Reels for ads, products and social media" },
      { id: "rex", label: "Rex Studio", icon: "sparkle", path: "app:/rex", hint: "Pictures, logo and words for your shop" },
      { id: "domain", label: "Domain", icon: "store", path: "web:/home/domain", hint: "Your own name like yourshop.com. Buy one or connect yours in one tap" },
    ],
  },
  {
    key: "settings",
    title: "Settings and help",
    links: [
      { id: "autoReplies", label: "Auto-replies", icon: "clock", path: "app:/inbox/auto-replies", hint: "Away message and opening hours" },
      { id: "chatbot", label: "Peggy chatbot", icon: "bot", path: "app:/inbox/chatbot", hint: "Answers shoppers on your shop's chat, day and night" },
      { id: "notifications", label: "Notifications", icon: "bell", path: "app:/notifications", hint: "Orders, payments and messages, and what buzzes your phone" },
      { id: "settings", label: "Settings", icon: "settings", path: "app:/settings", hint: "Your shop details, logo and your own details" },
      { id: "legal", label: "Legal pages", icon: "doc", path: "app:/legal", hint: "Refunds, delivery, privacy" },
      { id: "help", label: "Help", icon: "help", path: "app:/help", hint: "A person, or Peggy" },
    ],
  },
];

function go(path: string) {
  if (path.startsWith("app:")) router.push(path.slice(4) as never);
  else void openWeb(path.replace(/^web:/, ""));
}

export default function MyShop() {
  const t = useT("m_shop", "m_onboarding", "nav", "common");
  const [notSeller, setNotSeller] = useState(false);
  const [setup, setSetup] = useState<SetupOverview | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const changedPictures = useChangedIdentity();

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
    if ((await shareShop().catch(() => "no-link" as const)) === "no-link") setShareNote(t("noLink"));
  }

  return (
    <TabScreen title={t("tab.shop")} action={<HelpButton />}>
      {notSeller && (
        <Card style={{ marginBottom: 12, gap: 6 }}>
          <T weight="extrabold" style={{ fontSize: 17 }}>{t("notSeller.title")}</T>
          <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>{t("notSeller.body")}</T>
        </Card>
      )}

      {store ? (
        <Card style={{ gap: 12, marginBottom: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Picture uri={latestPicture(changedPictures, "logoUrl", store.logoUrl)} name={store.name} size={48} shape="square" />
            <View style={{ flex: 1 }}>
              <T weight="extrabold" style={{ fontSize: 18 }} numberOfLines={1}>{store.name}</T>
              {store.url ? <T style={{ color: colors.inkSoft, fontSize: 15 }} numberOfLines={1} selectable>{store.url.replace(/^https?:\/\//, "")}</T> : <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t("linkLater")}</T>}
            </View>
          </View>
          {store.url ? (
            <>
              <PillButton testID="share-shop" title={t("share")} tone="accent" onPress={() => void share()}>
                <AppIcon name="share" size={20} color="#FFFFFF" />
                <T weight="extrabold" style={{ color: "#FFFFFF", fontSize: 16 }}>{t("share")}</T>
              </PillButton>
              <LinkButton title={t("see")} onPress={() => void openShop(store.url!)} />
            </>
          ) : null}
          {shareNote ? <T style={{ color: colors.danger, fontSize: 15 }}>{shareNote}</T> : null}
        </Card>
      ) : null}

      {checklist?.showStart && !checklist.complete ? (
        <Pressable accessibilityRole="button" onPress={() => router.push("/start")} style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 16, gap: 10, marginBottom: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <AppIcon name="sparkle" size={20} color={colors.accentInk} />
            <T weight="extrabold" style={{ flex: 1, fontSize: 17 }}>{t("finish")}</T>
            <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t("start.progress", { done: checklist.done, total: checklist.total })}</T>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.canvas, overflow: "hidden" }}>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.success, width: `${checklist.percent}%` }} />
          </View>
        </Pressable>
      ) : null}

      {SHOP_GROUPS.map((group) => (
        <View key={group.title} style={{ marginBottom: 14 }}>
          <T weight="extrabold" style={{ fontSize: 17, marginBottom: 6, marginLeft: 4 }} accessibilityRole="header">{t.dynamic(`group.${group.key}`, group.title)}</T>
          <Card style={{ paddingVertical: 2 }}>
            {group.links.map((link, index) => (
              <LinkRow key={link.id} first={index === 0} icon={link.icon} label={t.dynamic(`link.${link.id}.label`, link.label)} hint={link.hint ? t.dynamic(`link.${link.id}.hint`, link.hint) : undefined} onPress={() => go(link.path)} />
            ))}
          </Card>
        </View>
      ))}
      <Card style={{ paddingVertical: 2, marginBottom: 14 }}>
        <LanguageRow first />
      </Card>
      <View style={{ marginTop: 4 }}>
        <LinkButton title={t("logOut")} color={colors.danger} onPress={() => void signOut().then(() => router.replace("/welcome"))} />
      </View>
    </TabScreen>
  );
}
