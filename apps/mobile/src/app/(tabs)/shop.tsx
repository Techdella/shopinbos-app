import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { List, Row, Small, Tile, type TileTone } from "@/components/design";
import { HelpButton } from "@/components/Help";
import { LanguageRow } from "@/components/LanguagePicker";
import { AppIcon, type AppIconName } from "@/components/icons";
import { Picture } from "@/components/kit";
import { Section } from "@/components/seller/bits";
import { LinkButton, PillButton, T } from "@/components/ui";
import { TabScreen } from "@/components/TabScreen";
import { ApiError } from "@/lib/api";
import { signOut } from "@/lib/auth";
import { latestPicture, useChangedIdentity } from "@/lib/identity";
import { fetchSetup, type SetupOverview } from "@/lib/setup";
import { openShop, shareShop } from "@/lib/share";
import { openWeb } from "@/lib/web";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";

// My shop ("Seller app" prototype `on.shop`): the shop link card (Share, View shop), then everything that isn't
// Home, Orders or Chats in four groups: Sell; Money and delivery; Look; You. The prototype's rows come first in
// each group, then the rest of the seller's tools, so nothing the app had before is lost. "app:" paths are screens
// in the app; "web:" opens that page of the web app, signed in. The domain opens the self-serve domain page.
// Words are translated at render: m_shop "group.<key>", "link.<id>.label" and "link.<id>.hint" (English here is the fallback).
type ShopLink = { id: string; label: string; icon: AppIconName; path: string; hint?: string; tone?: TileTone };

export const SHOP_GROUPS: { key: string; title: string; links: ShopLink[] }[] = [
  {
    key: "sell",
    title: "Sell",
    links: [
      { id: "products", label: "Products", icon: "tag", path: "app:/products", hint: "Prices, photos, inventory", tone: "peach" },
      { id: "find", label: "Find stock to sell", icon: "search", path: "app:/find", hint: "From suppliers, no stock needed", tone: "blue" },
      { id: "marketing", label: "Get more customers", icon: "megaphone", path: "app:/marketing", hint: "Ads and broadcasts", tone: "mint" },
      { id: "customers", label: "Customers", icon: "users", path: "app:/customers", hint: "Everyone who bought from you, and a message to each" },
      { id: "dropship", label: "Dropship", icon: "truck", path: "app:/dropship", hint: "Sell products a supplier sends for you" },
      { id: "channels", label: "Sell everywhere", icon: "chat", path: "app:/channels", hint: "Connect WhatsApp, Facebook, TikTok and Google" },
      { id: "ads", label: "Ads", icon: "megaphone", path: "app:/ads", hint: "Facebook, Instagram and TikTok ads, and what they bring in" },
      { id: "automations", label: "Automations", icon: "sparkle", path: "app:/marketing/automations", hint: "Messages that send themselves: welcome, cart reminder, thank-you" },
      { id: "campaigns", label: "Seasonal campaigns", icon: "clock", path: "app:/campaigns", hint: "Black Friday, Christmas and more, with a countdown" },
      { id: "reviews", label: "Reviews", icon: "star", path: "app:/reviews", hint: "What customers say, and asking for more" },
    ],
  },
  {
    key: "money",
    title: "Money and delivery",
    links: [
      { id: "money", label: "Money", icon: "wallet", path: "app:/wallet", hint: "Money coming to your bank", tone: "ok" },
      { id: "delivery", label: "Delivery", icon: "truck", path: "app:/delivery", hint: "Delivery partners, pickup, where you sell", tone: "mint" },
      { id: "payments", label: "Payments and payouts", icon: "coin", path: "app:/payments", hint: "How customers pay you, and money sent to your bank" },
      { id: "payouts", label: "Payouts", icon: "wallet", path: "app:/payouts", hint: "Every paid order and where the money went" },
      { id: "invoices", label: "Invoices", icon: "doc", path: "app:/invoices", hint: "Order invoices, and bills you send or get" },
      { id: "paymentLinks", label: "Payment links", icon: "link", path: "app:/payment-links", hint: "A link a customer opens from a chat to pay" },
      { id: "partners", label: "Partner messages", icon: "users", path: "app:/partners", hint: "Suppliers and delivery partners" },
    ],
  },
  {
    key: "look",
    title: "Look",
    links: [
      { id: "rex", label: "Look and logo", icon: "sparkle", path: "app:/rex", hint: "Rex changes it for you", tone: "peach" },
      { id: "domain", label: "Web address", icon: "globe", path: "web:/home/domain", hint: "Use your own .com", tone: "blue" },
      { id: "packaging", label: "Packaging and labels", icon: "box", path: "web:/home/labels/packaging", hint: "Boxes and stickers with your name", tone: "peach" },
      { id: "themes", label: "Themes", icon: "image", path: "app:/web-only?what=look", hint: "How your shop looks: colours, logo and pictures" },
      { id: "linkInBio", label: "Link in bio", icon: "share", path: "app:/link-in-bio", hint: "One page for your Instagram and TikTok bio" },
      { id: "video", label: "Video studio", icon: "play", path: "app:/video", hint: "Reels for ads, products and social media" },
    ],
  },
  {
    key: "you",
    title: "You",
    links: [
      { id: "settings", label: "Settings and help", icon: "settings", path: "app:/settings", hint: "Your shop details, logo and your own details" },
      { id: "notifications", label: "Notifications", icon: "bell", path: "app:/notifications", hint: "Orders, payments and messages, and what buzzes your phone" },
      { id: "autoReplies", label: "Auto-replies", icon: "clock", path: "app:/inbox/auto-replies", hint: "Away message and opening hours" },
      { id: "chatbot", label: "Peggy chatbot", icon: "bot", path: "app:/inbox/chatbot", hint: "Answers shoppers on your shop's chat, day and night" },
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
        <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 20, gap: 6 }}>
          <T weight="extrabold" style={{ fontSize: 17 }}>{t("notSeller.title")}</T>
          <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>{t("notSeller.body")}</T>
        </View>
      )}

      {/* The shop's link: Share and View shop. */}
      {store ? (
        <View style={{ backgroundColor: colors.peach, borderRadius: 24, padding: 20, gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Picture uri={latestPicture(changedPictures, "logoUrl", store.logoUrl)} name={store.name} size={44} shape="square" />
            <View style={{ flex: 1, gap: 2 }}>
              <Small style={{ color: colors.accentInk }}>{t("card.link")}</Small>
              {store.url ? (
                <T weight="extrabold" style={{ fontSize: 18 }} selectable>{store.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</T>
              ) : (
                <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t("linkLater")}</T>
              )}
            </View>
          </View>
          {store.url ? (
            <View style={{ flexDirection: "row", gap: 10 }}>
              <PillButton testID="share-shop" size="sm" accessibilityLabel={t("share")} onPress={() => void share()}>
                <AppIcon name="share" size={18} color="#FFFFFF" />
                <T weight="bold" style={{ color: "#FFFFFF", fontSize: 15 }}>{t("share")}</T>
              </PillButton>
              <PillButton title={t("card.view")} tone="white" size="sm" onPress={() => void openShop(store.url!)} />
            </View>
          ) : null}
          {shareNote ? <T style={{ color: colors.danger, fontSize: 15 }}>{shareNote}</T> : null}
        </View>
      ) : null}

      {checklist?.showStart && !checklist.complete ? (
        <Pressable accessibilityRole="button" onPress={() => router.push("/start")} style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 20, gap: 10 }}>
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
        <Section key={group.key} title={t.dynamic(`group.${group.key}`, group.title)}>
          <List>
            {group.links.map((link) => (
              <Row
                key={link.id}
                lead={<Tile icon={link.icon} tone={link.tone ?? "gray"} />}
                title={t.dynamic(`link.${link.id}.label`, link.label)}
                sub={link.hint ? t.dynamic(`link.${link.id}.hint`, link.hint) : undefined}
                onPress={() => go(link.path)}
              />
            ))}
            {group.key === "you" ? (
              <View style={{ paddingHorizontal: 16 }}>
                <LanguageRow first />
              </View>
            ) : null}
          </List>
        </Section>
      ))}
      <View>
        <LinkButton title={t("logOut")} color={colors.danger} onPress={() => void signOut().then(() => router.replace("/welcome"))} />
        <DeleteAccountButton />
      </View>
    </TabScreen>
  );
}
