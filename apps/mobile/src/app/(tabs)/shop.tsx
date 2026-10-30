import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { AppearanceRow } from "@/components/AppearancePicker";
import { Eyebrow, List, Row, TILE, Tile, Title, type TileTone } from "@/components/design";
import { HelpButton } from "@/components/Help";
import { LanguageRow } from "@/components/LanguagePicker";
import { AppIcon, type AppIconName } from "@/components/icons";
import { Picture } from "@/components/kit";
import { IconButton, Section } from "@/components/seller/bits";
import { Field, LinkButton, T } from "@/components/ui";
import { TabScreen } from "@/components/TabScreen";
import { ApiError } from "@/lib/api";
import { signOut } from "@/lib/auth";
import { fetchAds } from "@/lib/ads";
import { automationsOn, liveAds, matchTools } from "@/lib/grow-pure";
import { latestPicture, useChangedIdentity } from "@/lib/identity";
import { fetchAutomations } from "@/lib/marketing";
import { fetchSetup, type SetupOverview } from "@/lib/setup";
import { openShop, shareShop } from "@/lib/share";
import { shopIsLive } from "@/lib/publish";
import { PublishButton, ShopLiveSheet } from "@/components/seller/PublishShop";
import type { PublishedShop } from "@/lib/publish";
import { useT } from "@/lib/i18n";
import { useFeature } from "@/lib/features";
import { usePilotNumbersOn } from "@/lib/pilot-numbers";
import { colors, surfaceCard } from "@/theme";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";

// Menu (canvas board M-Menu, "Seller app · sell, grow"; this tab was My shop, the route stays /shop): the shop's logo
// and name with "See your store as customers do" and Share (and Put my shop live while it isn't); the Grow tools
// (Ads, Rex Studio, Email, Automations, Popups, Insights) and the Store tools (Orders, Products, Edit store, Find
// stock, Delivery, Customers, Payouts, Settings) as two grids of tiles, with live counts on Ads ("1 LIVE") and
// Automations ("3 ON"); a search over every tool; then every other tool the seller had, in four short groups (Sell;
// Money and delivery; Look; You), titles only, each tool once: anything already on the grids (ON_SCREEN) isn't
// repeated, and Help is the button in the corner. Every path is a screen in the app ("app:"); nothing here opens the
// web app. Web address is app/domain.tsx, Packaging is app/packaging.tsx and Your shop link & QR (the @handle, short
// link and QR code; also the link icon beside Share) is app/shop-link.tsx. "Sell everywhere" (/channels) isn't in
// the phone app's shop. The board's "Import from China" isn't open yet, so it isn't here.
// Words are translated at render: m_shop "group.<key>", "link.<id>.label" and "link.<id>.hint", m_grow "tool.<id>"
// (English here is the fallback).
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
      { id: "shopLink", label: "Your shop link & QR", icon: "link", path: "app:/shop-link", hint: "Your @handle, short link and a QR code to print", tone: "mint" },
      { id: "storePages", label: "Store pages", icon: "doc", path: "app:/store-pages", hint: "Pages, collections and content" },
      { id: "video", label: "Video studio", icon: "play", path: "app:/video", hint: "Reels for ads, products and social media" },
      { id: "posts", label: "Posts calendar", icon: "image", path: "app:/posts", hint: "Posts already made and planned, day by day" },
    ],
  },
  {
    key: "you",
    title: "You",
    links: [
      { id: "myDetails", label: "My details", icon: "user", path: "app:/my-details", hint: "Your name, email, phone and your shop's address" },
      { id: "settings", label: "Settings and help", icon: "settings", path: "app:/settings", hint: "Your shop details, logo and your own details" },
      { id: "notifications", label: "Notifications", icon: "bell", path: "app:/notifications", hint: "Orders, payments and messages, and what buzzes your phone" },
      { id: "autoReplies", label: "Auto-replies", icon: "clock", path: "app:/inbox/auto-replies", hint: "Away message and opening hours" },
      { id: "chatbot", label: "Peggy chatbot", icon: "bot", path: "app:/inbox/chatbot", hint: "Answers shoppers on your shop's chat, day and night" },
      { id: "legal", label: "Legal pages", icon: "doc", path: "app:/legal", hint: "Refunds, delivery, privacy" },
      { id: "help", label: "Help", icon: "help", path: "app:/help", hint: "A person, or Peggy" },
    ],
  },
];

/** The Menu's two grids (board M-Menu). `count` names the live count the tile shows. */
type GridTool = { id: string; label: string; icon: AppIconName; tone: TileTone; path: string; count?: "live" | "on" };

export const GROW_TOOLS: GridTool[] = [
  { id: "ads", label: "Ads", icon: "megaphone", tone: "mint", path: "app:/ads", count: "live" },
  { id: "studio", label: "Rex Studio", icon: "sparkle", tone: "ink", path: "app:/studio" },
  { id: "email", label: "Email", icon: "mail", tone: "butter", path: "app:/marketing/email" },
  { id: "automations", label: "Automations", icon: "zap", tone: "lilac", path: "app:/marketing/automations", count: "on" },
  { id: "popups", label: "Popups", icon: "popup", tone: "peach", path: "app:/marketing/popups" },
  { id: "insights", label: "Insights", icon: "chart", tone: "sky", path: "app:/insights" },
];

export const STORE_TOOLS: GridTool[] = [
  { id: "orders", label: "Orders", icon: "bag", tone: "peach", path: "app:/orders" },
  { id: "products", label: "Products", icon: "grid", tone: "lime", path: "app:/products" },
  { id: "editStore", label: "Edit store", icon: "sparkle", tone: "lilac", path: "app:/shop-edit" },
  { id: "find", label: "Find stock", icon: "box", tone: "blue", path: "app:/find" },
  { id: "delivery", label: "Delivery", icon: "truck", tone: "sky", path: "app:/delivery" },
  { id: "customers", label: "Customers", icon: "users", tone: "mint", path: "app:/customers" },
  { id: "payouts", label: "Payouts", icon: "wallet", tone: "ok", path: "app:/payouts" },
  { id: "settings", label: "Settings", icon: "settings", tone: "gray", path: "app:/settings" },
];

/** Tools already on the grids (and Help, the button in the corner), so the groups below don't list them again. */
export const ON_SCREEN = new Set(["products", "find", "delivery", "customers", "payouts", "settings", "ads", "automations", "video", "help"]);

function go(path: string) {
  router.push(path.replace(/^app:/, "") as never);
}

/** Three tiles to a row, each row of equal tiles (flex: 1), the last row padded with empty space. */
function ToolGrid({ tools, counts, label }: { tools: GridTool[]; counts: { live: number; on: number }; label: (tool: GridTool) => string }) {
  const t = useT("m_grow");
  const rows: GridTool[][] = [];
  for (let index = 0; index < tools.length; index += 3) rows.push(tools.slice(index, index + 3));
  return (
    <View style={{ gap: 12 }}>
      {rows.map((row) => (
        <View key={row[0].id} style={{ flexDirection: "row", gap: 12 }}>
          {row.map((tool) => {
            const count = tool.count ? counts[tool.count] : 0;
            const tag = count ? t(tool.count === "live" ? "menu.live" : "menu.on", { count }) : null;
            return (
              <Pressable
                key={tool.id}
                testID={`menu-${tool.id}`}
                accessibilityRole="button"
                accessibilityLabel={tag ? `${label(tool)}, ${tag}` : label(tool)}
                onPress={() => go(tool.path)}
                style={({ pressed }) => ({ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, minHeight: 104, ...surfaceCard(22), paddingHorizontal: 8, paddingTop: 14, paddingBottom: 12, gap: 8, alignItems: "center", opacity: pressed ? 0.85 : 1 })}
              >
                {/* A round tinted icon over the name, centred (the boards' category circles). */}
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: TILE[tool.tone].bg, alignItems: "center", justifyContent: "center" }}>
                  <AppIcon name={tool.icon} size={21} color={TILE[tool.tone].fg} />
                </View>
                <T weight="bold" numberOfLines={2} style={{ fontSize: 13, lineHeight: 17, textAlign: "center" }}>{label(tool)}</T>
                {tag ? (
                  <View style={{ position: "absolute", top: 8, right: 8, borderRadius: 9, paddingHorizontal: 6, height: 18, justifyContent: "center", backgroundColor: colors.successTint }}>
                    <T weight="extrabold" style={{ fontSize: 10, color: colors.success }}>{tag}</T>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
          {row.length < 3 ? Array.from({ length: 3 - row.length }, (_, index) => <View key={`gap-${index}`} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 }} />) : null}
        </View>
      ))}
    </View>
  );
}

export default function Menu() {
  const t = useT("m_shop", "m_grow", "m_onboarding", "nav", "common");
  const tBulk = useT("bulkAdd");
  // Resell (pilot): the shop's resell sales and reselling other shops' products, only while it is on.
  const resellOn = useFeature("resell");
  const tResell = useT("resell");
  const pilotNumbersOn = usePilotNumbersOn();
  const tPilot = useT("pilotNumbers");
  const [notSeller, setNotSeller] = useState(false);
  const [setup, setSetup] = useState<SetupOverview | null>(null);
  // Held here, not in the button: once the shop is live the button (and anything inside it) goes away.
  const [justPublished, setJustPublished] = useState<PublishedShop | null>(null);
  const [counts, setCounts] = useState({ live: 0, on: 0 });
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const changedPictures = useChangedIdentity();

  useFocusEffect(
    useCallback(() => {
      fetchSetup()
        .then(setSetup)
        .catch((loadError) => setNotSeller(loadError instanceof ApiError && loadError.status === 403));
      // The live counts on Ads and Automations: each on its own; a count that doesn't load just doesn't show.
      fetchAds()
        .then((ads) => setCounts((now) => ({ ...now, live: liveAds(ads) })))
        .catch(() => null);
      fetchAutomations()
        .then((flows) => setCounts((now) => ({ ...now, on: automationsOn(flows) })))
        .catch(() => null);
    }, []),
  );

  const store = setup?.store ?? null;

  async function share() {
    setShareNote(null);
    if ((await shareShop().catch(() => "no-link" as const)) === "no-link") setShareNote(t("noLink"));
  }

  const toolLabel = (tool: GridTool) => t.dynamic(`tool.${tool.id}`, tool.label);
  // Search: every tool on the grids and in the groups, by its name and what it's for.
  const allTools = [
    ...[...GROW_TOOLS, ...STORE_TOOLS].map((tool) => ({ key: tool.id, title: toolLabel(tool), icon: tool.icon, tone: tool.tone, path: tool.path, words: [toolLabel(tool), tool.label] })),
    ...SHOP_GROUPS.flatMap((group) => group.links)
      .filter((link) => !ON_SCREEN.has(link.id))
      .map((link) => {
        const title = t.dynamic(`link.${link.id}.label`, link.label);
        return { key: link.id, title, icon: link.icon, tone: link.tone ?? ("gray" as TileTone), path: link.path, words: [title, link.label, t.dynamic(`link.${link.id}.hint`, link.hint ?? ""), link.hint ?? ""] };
      }),
  ];
  const found = query.trim() ? matchTools(allTools, query) : null;

  return (
    <TabScreen
      header={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 46 }}>
          <Title style={{ flex: 1 }}>{t("menu.title")}</Title>
          <IconButton
            testID="menu-search"
            icon={searching ? "x" : "search"}
            label={t("menu.search")}
            onPress={() => {
              setSearching(!searching);
              setQuery("");
            }}
          />
          <HelpButton compact />
        </View>
      }
    >
      {notSeller && (
        <View style={{ ...surfaceCard(), padding: 20, gap: 6 }}>
          <T weight="extrabold" style={{ fontSize: 17 }}>{t("notSeller.title")}</T>
          <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>{t("notSeller.body")}</T>
        </View>
      )}

      {searching ? (
        <View style={{ gap: 10 }}>
          <Field testID="menu-search-field" autoFocus value={query} onChangeText={setQuery} placeholder={t("menu.searchPlaceholder")} accessibilityLabel={t("menu.search")} returnKeyType="search" />
          {found ? (
            found.length ? (
              <List>
                {found.map((tool) => <Row key={tool.key} lead={<Tile icon={tool.icon} tone={tool.tone} />} title={tool.title} onPress={() => go(tool.path)} />)}
              </List>
            ) : (
              <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t("menu.noMatch")}</T>
            )
          ) : null}
        </View>
      ) : null}

      {/* The shop: logo, name and "See your store as customers do" (opens it), Share; Put my shop live under it. */}
      {store ? (
        <View style={{ ...surfaceCard(), padding: 16, gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Picture uri={latestPicture(changedPictures, "logoUrl", store.logoUrl)} name={store.name} size={52} shape="square" />
            <Pressable
              testID="menu-see-store"
              accessibilityRole="link"
              accessibilityLabel={`${store.name}. ${t("menu.seeStore")}`}
              disabled={!store.url}
              onPress={() => (store.url ? void openShop(store.url) : undefined)}
              style={{ flex: 1, minWidth: 0, minHeight: 44, justifyContent: "center" }}
            >
              <T weight="extrabold" style={{ fontSize: 18 }} numberOfLines={1}>{store.name}</T>
              <T style={{ fontSize: 14, color: colors.inkSoft }} numberOfLines={1}>{store.url ? t("menu.seeStore") : t("linkLater")}</T>
            </Pressable>
            {store.url ? <IconButton testID="shop-link-qr" icon="link" label={t("link.shopLink.label")} onPress={() => router.push("/shop-link")} /> : null}
            {store.url ? <IconButton testID="share-shop" icon="share" label={t("share")} onPress={() => void share()} /> : null}
          </View>
          {shareNote ? <T style={{ color: colors.danger, fontSize: 15 }}>{shareNote}</T> : null}
          {/* Not live yet: one obvious button puts it live (then "Your shop is live" with View shop and Share). */}
          {shopIsLive(setup) === false ? (
            <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12 }}>
              <T weight="extrabold" style={{ fontSize: 16 }}>{t("publish.notLive")}</T>
              <PublishButton testID="shop-publish" sheet={false} onPublished={(shop) => { setJustPublished(shop); void fetchSetup().then(setSetup).catch(() => null); }} />
            </View>
          ) : null}
        </View>
      ) : null}
      <ShopLiveSheet shop={justPublished} onClose={() => setJustPublished(null)} />

      <View style={{ gap: 10 }}>
        <Eyebrow>{t("menu.grow")}</Eyebrow>
        <ToolGrid tools={GROW_TOOLS} counts={counts} label={toolLabel} />
      </View>

      <View style={{ gap: 10 }}>
        <Eyebrow>{t("menu.store")}</Eyebrow>
        <ToolGrid tools={STORE_TOOLS} counts={counts} label={toolLabel} />
      </View>

      {/* Everything else, so nothing is lost: titles only, each tool once. */}
      {SHOP_GROUPS.map((group) => (
        <Section key={group.key} title={t.dynamic(`group.${group.key}`, group.title)}>
          <List>
            {group.key === "sell" ? <Row testID="shop-add-product" lead={<Tile icon="camera" tone="peach" />} title={t("products.add")} onPress={() => router.push("/add-products")} /> : null}
            {group.key === "sell" ? <Row testID="shop-bulk-add" lead={<Tile icon="sparkle" tone="lilac" />} title={tBulk("entry.title")} onPress={() => router.push("/bulk-add")} /> : null}
            {group.key === "sell" && resellOn ? <Row testID="shop-resell-sales" lead={<Tile icon="link" tone="mint" />} title={tResell("sales.title")} onPress={() => router.push("/resell-sales")} /> : null}
            {group.key === "sell" && resellOn ? <Row testID="shop-resell" lead={<Tile icon="share" tone="sky" />} title={tResell("sales.resellYourself")} onPress={() => router.push("/resell")} /> : null}
            {group.key === "sell" && pilotNumbersOn ? <Row testID="shop-pilot-numbers" lead={<Tile icon="chart" tone="lime" />} title={tPilot("open")} onPress={() => router.push("/pilot-numbers")} /> : null}
            {group.links
              .filter((link) => !ON_SCREEN.has(link.id))
              .map((link) => (
                <Row key={link.id} lead={<Tile icon={link.icon} tone={link.tone ?? "gray"} />} title={t.dynamic(`link.${link.id}.label`, link.label)} onPress={() => go(link.path)} />
              ))}
            {group.key === "you" ? <LanguageRow tile /> : null}
            {group.key === "you" ? <AppearanceRow tile /> : null}
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
