import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { List, Row, Tile, Title, type TileTone } from "@/components/design";
import { HelpButton } from "@/components/Help";
import { LanguageRow } from "@/components/LanguagePicker";
import { AppIcon, type AppIconName } from "@/components/icons";
import { Picture } from "@/components/kit";
import { Section } from "@/components/seller/bits";
import { StockRow, useStockSaver } from "@/components/seller/StockRows";
import { LinkButton, Notice, PillButton, T } from "@/components/ui";
import { TabScreen } from "@/components/TabScreen";
import { ApiError } from "@/lib/api";
import { signOut } from "@/lib/auth";
import { fetchProducts, type ProductItem } from "@/lib/dashboard";
import { latestPicture, useChangedIdentity } from "@/lib/identity";
import { fetchSetup, type SetupOverview } from "@/lib/setup";
import { openShop, shareShop } from "@/lib/share";
import { shopIsLive } from "@/lib/publish";
import { PublishButton, ShopLiveSheet } from "@/components/seller/PublishShop";
import type { PublishedShop } from "@/lib/publish";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";

// My shop ("Familiar app" prototype `on.shop`): the shop's logo, name and link with Edit my shop and Share (and Put my
// shop live while it isn't); four tiles
// (Money, Delivery, Posts, Web address); the products with their stock and − / +, Find more to sell and Add a
// product; one card with Packaging and labels and Settings and help. Under that, every other tool the seller had, in
// four short groups (Sell; Money and delivery; Look; You), titles only, each tool once: anything already on the
// screen above (ON_SCREEN) isn't repeated, and Help is the button in the corner. Every path is a screen in the app
// ("app:"); nothing here opens the web app. Web address is app/domain.tsx and Packaging is app/packaging.tsx.
// "Sell everywhere" (/channels) isn't in the phone app's shop.
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
      { id: "domain", label: "Web address", icon: "globe", path: "app:/domain", hint: "Use your own .com", tone: "blue" },
      { id: "packaging", label: "Packaging and labels", icon: "box", path: "app:/packaging", hint: "Boxes and stickers with your name", tone: "peach" },
      { id: "themes", label: "Shop looks", icon: "image", path: "app:/templates", hint: "Pick a look, or let Rex build one" },
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


/** Tools already on the screen above the groups (tiles, products, the Packaging / Settings card, the Help button),
 * so the groups don't list them a second time. */
export const ON_SCREEN = new Set(["products", "find", "money", "delivery", "domain", "packaging", "settings", "help"]);

function go(path: string) {
  router.push(path.replace(/^app:/, "") as never);
}

/** How many products show inline; "See all" opens Products. */
const INLINE_PRODUCTS = 5;

/** The four tiles under the shop card (`.grid2` tiles in the prototype). */
const TILES: { id: string; icon: AppIconName; tone: TileTone; path: string; label: "tile.money" | "tile.delivery" | "tile.posts" | "tile.domain" }[] = [
  { id: "money", icon: "wallet", tone: "ok", path: "app:/wallet", label: "tile.money" },
  { id: "delivery", icon: "truck", tone: "sky", path: "app:/delivery", label: "tile.delivery" },
  { id: "posts", icon: "image", tone: "lime", path: "app:/posts", label: "tile.posts" },
  { id: "domain", icon: "globe", tone: "lilac", path: "app:/domain", label: "tile.domain" },
];

export default function MyShop() {
  const t = useT("m_shop", "m_products", "m_onboarding", "nav", "common");
  const [notSeller, setNotSeller] = useState(false);
  const [setup, setSetup] = useState<SetupOverview | null>(null);
  // Held here, not in the button: once the shop is live the button (and anything inside it) goes away.
  const [justPublished, setJustPublished] = useState<PublishedShop | null>(null);
  const [products, setProducts] = useState<ProductItem[] | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const changedPictures = useChangedIdentity();
  const setStock = useStockSaver(setProducts, setError);

  useFocusEffect(
    useCallback(() => {
      fetchSetup()
        .then(setSetup)
        .catch((loadError) => setNotSeller(loadError instanceof ApiError && loadError.status === 403));
      fetchProducts()
        .then(setProducts)
        .catch(() => null);
    }, []),
  );

  const store = setup?.store ?? null;
  const link = store?.url ? store.url.replace(/^https?:\/\//, "").replace(/\/$/, "") : null;

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

      {/* The shop: logo, Edit look and Share, the name and link. */}
      {store ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 20, gap: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Picture uri={latestPicture(changedPictures, "logoUrl", store.logoUrl)} name={store.name} size={64} shape="square" />
            {/* The two buttons wrap under each other on narrow phones instead of running off the screen. */}
            <View style={{ flex: 1, minWidth: 0, flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }}>
            <PillButton testID="edit-shop" tone="white" size="sm" accessibilityLabel={t("editShop.open")} onPress={() => router.push("/shop-edit" as never)}>
              <AppIcon name="sparkle" size={16} />
              <T weight="bold" style={{ fontSize: 15 }}>{t("editShop.open")}</T>
            </PillButton>
            {store.url ? (
              <PillButton testID="share-shop" size="sm" accessibilityLabel={t("share")} onPress={() => void share()}>
                <AppIcon name="share" size={16} color="#FFFFFF" />
                <T weight="bold" style={{ color: "#FFFFFF", fontSize: 15 }}>{t("share")}</T>
              </PillButton>
            ) : null}
            </View>
          </View>
          <View style={{ gap: 2 }}>
            <Title size={26}>{store.name}</Title>
            {link ? (
              <Pressable accessibilityRole="link" accessibilityLabel={t("card.view")} onPress={() => void openShop(store.url!)} hitSlop={6} style={{ minHeight: 32, justifyContent: "center" }}>
                <T weight="semibold" style={{ fontSize: 15, color: colors.inkSoft }} numberOfLines={1}>{link}</T>
              </Pressable>
            ) : (
              <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t("linkLater")}</T>
            )}
          </View>
          {shareNote ? <T style={{ color: colors.danger, fontSize: 15 }}>{shareNote}</T> : null}
          {/* Not live yet: one obvious button puts it live (then "Your shop is live" with View shop and Share). */}
          {shopIsLive(setup) === false ? (
            <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 14 }}>
              <T weight="extrabold" style={{ fontSize: 16 }}>{t("publish.notLive")}</T>
              <PublishButton testID="shop-publish" sheet={false} onPublished={(shop) => { setJustPublished(shop); void fetchSetup().then(setSetup).catch(() => null); }} />
            </View>
          ) : null}
        </View>
      ) : null}
      <ShopLiveSheet shop={justPublished} onClose={() => setJustPublished(null)} />

      {/* Money, Delivery, Posts, Web address: a 2×2 grid as rows of two equal tiles (flex: 1). A percentage width
          plus the gap tipped over 100% on 360px phones and wrapped into one narrow column. */}
      <View style={{ gap: 10 }}>
        {[TILES.slice(0, 2), TILES.slice(2, 4)].map((pair) => (
          <View key={pair[0].id} style={{ flexDirection: "row", gap: 10 }}>
            {pair.map((tile) => (
              <Pressable
                key={tile.id}
                testID={`shop-tile-${tile.id}`}
                accessibilityRole="button"
                accessibilityLabel={t(tile.label)}
                onPress={() => go(tile.path)}
                style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 96, backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 10, justifyContent: "space-between", opacity: pressed ? 0.85 : 1 })}
              >
                <Tile icon={tile.icon} tone={tile.tone} size={40} />
                <T weight="extrabold" numberOfLines={2} style={{ fontSize: 16 }}>{t(tile.label)}</T>
              </Pressable>
            ))}
          </View>
        ))}
      </View>

      {/* The products, with their stock. */}
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <T weight="extrabold" style={{ flex: 1, fontSize: 13, letterSpacing: 0.8, textTransform: "uppercase", color: colors.inkSoft }}>
            {products ? t("products.count", { count: products.length }) : t("link.products.label")}
          </T>
          <LinkButton title={t("products.findMore")} color={colors.accentInk} onPress={() => router.push("/find")} />
        </View>
        {error ? <Notice>{error}</Notice> : null}
        <List>
          {(products ?? []).slice(0, INLINE_PRODUCTS).map((product) => <StockRow key={product.id} product={product} onStock={setStock} />)}
          {products && products.length > INLINE_PRODUCTS ? <Row lead={<Tile icon="tag" tone="peach" />} title={t("products.seeAll", { count: products.length })} onPress={() => router.push("/products")} /> : null}
          <Row testID="shop-add-product" lead={<Tile icon="camera" tone="peach" />} title={t("products.add")} sub={t("products.addSub")} onPress={() => router.push("/add-products")} />
        </List>
      </View>

      {/* As in the prototype: Packaging and labels, then Settings and help, in one card. */}
      <List>
        <Row lead={<Tile icon="box" tone="butter" />} title={t("link.packaging.label")} sub={t("link.packaging.hint")} onPress={() => router.push("/packaging" as never)} />
        <Row lead={<Tile icon="settings" tone="gray" />} title={t("link.settings.label")} onPress={() => router.push("/settings")} />
      </List>

      {/* Everything else, so nothing is lost: titles only, each tool once. */}
      {SHOP_GROUPS.map((group) => (
        <Section key={group.key} title={t.dynamic(`group.${group.key}`, group.title)}>
          <List>
            {group.links
              .filter((link) => !ON_SCREEN.has(link.id))
              .map((link) => (
                <Row key={link.id} lead={<Tile icon={link.icon} tone={link.tone ?? "gray"} />} title={t.dynamic(`link.${link.id}.label`, link.label)} onPress={() => go(link.path)} />
              ))}
            {group.key === "you" ? <LanguageRow tile /> : null}
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
