import { Alert } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import { tNow } from "./app-locale";
import { API_URL } from "./api";
import { supabase } from "./supabase";
import { appRouteFor } from "@shared/notifications";
import { videoScreenFor } from "./video-pure";
import { isDigitalPurchasePath } from "@shared/store-payments";

// Fresh enough that the web session (which borrows this token, see src/app/auth/handoff) lasts a while.
const MIN_TOKEN_LIFE_SECONDS = 15 * 60;

async function freshAccessToken() {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return null;
  const secondsLeft = (session.expires_at ?? 0) - Date.now() / 1000;
  if (secondsLeft > MIN_TOKEN_LIFE_SECONDS) return session.access_token;
  const refreshed = await supabase.auth.refreshSession().catch(() => null);
  return refreshed?.data.session?.access_token ?? session.access_token;
}

/**
 * Opens a page of the website, signed in as the app's user. Only for advanced tools (the video studio's final render,
 * importing products), Google's Gmail sign-in and admin; everything else has a screen here. The button or row that
 * calls it shows "Opens website ↗" (components/WebBadge.tsx; tests/mobile-web-exits.test.mjs checks every call).
 * Never a page that sells AI credits, plans, themes or wallet top-ups: app store payment rules
 * (shared/store-payments.ts, docs/store-payments-audit.md), so those paths don't open at all.
 */
export async function openWeb(path: string) {
  if (isDigitalPurchasePath(path)) return null;
  return WebBrowser.openBrowserAsync(await signedInUrl(path));
}

/** A web-app path as a signed-in link (for sign-ins that run in an in-app browser and come back to the app). */
export async function signedInUrl(path: string) {
  const token = await freshAccessToken().catch(() => null);
  return token ? `${API_URL}/auth/handoff?next=${encodeURIComponent(path)}#t=${token}` : `${API_URL}${path}`;
}

/** Web pages the app has its own screen for (query strings are ignored). */
const APP_SCREENS: Record<string, string> = {
  "/home": "/home",
  "/home/orders": "/orders",
  "/home/orders/new": "/record-sale",
  "/products/new": "/add-products",
  "/products/bulk": "/bulk-add",
  "/supplier/products/bulk": "/bulk-add",
  "/products": "/products",
  "/home/products": "/products",
  "/home/inventory": "/products",
  "/home/start": "/start",
  // Customer messages always open the app's Chats (a conversation link opens that chat, see openPath).
  "/home/messages": "/chats",
  "/home/inbox": "/chats",
  // Connecting WhatsApp, Facebook & Instagram happens in the app (app/channels.tsx), never on the website.
  "/home/inbox/channels": "/channels",
  "/home/inbox/settings": "/chats",
  "/home/inbox/email": "/chats",
  "/home/messages/partners": "/partners",
  "/home/inbox/auto-replies": "/inbox/auto-replies",
  "/home/inbox/chatbot": "/inbox/chatbot",
  "/marketplace": "/find",
  "/marketplace/wholesale": "/wholesale",
  "/home/reviews": "/reviews",
  "/home/reviews/request": "/reviews/ask",
  "/home/customers": "/customers",
  "/home/marketing": "/marketing",
  "/home/marketing/campaigns": "/marketing",
  // A seller's Social posts calendar is the app's posts calendar.
  "/home/marketing/social": "/posts",
  "/home/marketing/social/new": "/create",
  "/home/marketing/social/designs": "/create",
  "/home/marketing/social/accounts": "/posts",
  "/home/discounts": "/marketing",
  "/home/marketing/templates": "/marketing/templates",
  // The store builder: Edit my shop and Shop looks.
  "/builder": "/shop-edit",
  "/builder/editor": "/shop-edit",
  "/home/editor": "/shop-edit",
  "/builder/templates": "/templates",
  "/home/marketing/subscribers": "/marketing/subscribers",
  "/studio": "/rex",
  "/home/legal": "/legal",
  "/home/payments": "/payments",
  "/home/shipping": "/delivery/zones",
  "/home/logistics": "/delivery",
  "/home/settings": "/settings",
  "/home/store": "/settings",
  "/home/notifications": "/notifications",
  // Sell everywhere and the connections page: the app's own Connect accounts screen.
  "/channels": "/channels",
  "/home/connections": "/channels",
  "/home/domain": "/domain",
  "/home/labels": "/packaging",
  "/home/labels/packaging": "/packaging",
  "/home/labels/request": "/packaging",
  "/home/payment-links": "/payment-links",
  "/home/social/link-in-bio": "/link-in-bio",
  // Refer & earn is a card on Rewards.
  "/home/refer": "/rewards",
  "/home/campaigns": "/campaigns",
  "/home/video": "/video",
  "/home/video/studio": "/video/studio",
  "/home/payouts": "/payouts",
  "/home/wallet": "/wallet",
  "/home/invoices": "/invoices",
  "/home/invoicing": "/invoices",
  "/home/ads": "/ads",
  "/home/ads/new": "/ads/new",
  "/home/automations": "/marketing/automations",
  "/home/automations/new": "/marketing/automations",
};

/** One query value of a web path ("/home/messages?c=abc" → "abc"). */
function queryValue(path: string, name: string) {
  const query = path.split("#")[0].split("?")[1] ?? "";
  const value = new URLSearchParams(query).get(name);
  return value && /^[\w-]{1,80}$/.test(value) ? value : null;
}

/**
 * The app screen for a web-app path, or null when the app has none. Pure apart from the shared table, so it can be
 * tested: customer chats (/home/messages?c=…, /home/inbox?c=…) open that chat, partner chats (?p=…, /home/messages/
 * partners?c=…) open that partner chat, details open their screen (orders, products, customers, reviews, ads…).
 */
export function appScreenFor(path: string): { pathname: string; params?: Record<string, string> } | null {
  const [rawPathname] = path.split(/[?#]/);
  const pathname = rawPathname.replace(/\/+$/, "") || "/";
  const conversation = queryValue(path, "c");
  const partnerChat = queryValue(path, "p");
  if (/^\/home\/(messages|inbox)$/.test(pathname) && conversation) return { pathname: "/inbox/[id]", params: { id: conversation } };
  if (/^\/home\/(messages|inbox)$/.test(pathname) && partnerChat) return { pathname: "/partners/[id]", params: { id: partnerChat } };
  if (pathname === "/home/messages/partners" && conversation) return { pathname: "/partners/[id]", params: { id: conversation } };
  const detail: [RegExp, string, string][] = [
    [/^\/home\/orders\/([\w-]+)$/, "/order/[id]", "id"],
    [/^\/products\/([\w-]+)$/, "/product/[id]", "id"],
    [/^\/home\/products\/([\w-]+)$/, "/product/[id]", "id"],
    [/^\/home\/legal\/([\w-]+)$/, "/legal/[key]", "key"],
    [/^\/home\/campaigns\/([\w-]+)$/, "/campaigns/[id]", "id"],
    [/^\/home\/automations\/([\w-]+)$/, "/marketing/automation/[id]", "id"],
    [/^\/home\/marketing\/templates\/([\w-]+)$/, "/marketing/template/[id]", "id"],
    [/^\/home\/reviews\/([\w-]+)$/, "/reviews/[key]", "key"],
    [/^\/home\/customers\/([\w-]+)$/, "/customers/[key]", "key"],
    [/^\/home\/payment-links\/([\w-]+)$/, "/payment-links/[id]", "id"],
    [/^\/home\/invoices\/([\w-]+)$/, "/invoices/[id]", "id"],
    [/^\/home\/ads\/([\w-]+)$/, "/ads/[id]", "id"],
    [/^\/marketplace\/product\/([\w-]+)$/, "/find/[slug]", "slug"],
    [/^\/home\/marketing\/social\/([\w-]+)$/, "/posts/[id]", "id"],
  ];
  for (const [pattern, screen, param] of detail) {
    const match = pattern.exec(pathname);
    if (match && match[1] !== "new" && !APP_SCREENS[pathname]) return { pathname: screen, params: { [param]: match[1] } };
  }
  const design = queryValue(path, "design");
  if (pathname === "/home/labels/packaging" && design) return { pathname: "/packaging", params: { design } };
  // A customer's key is usually their email.
  const customer = new URLSearchParams(path.split("#")[0].split("?")[1] ?? "").get("customer")?.slice(0, 200);
  if (pathname === "/home/customers" && customer) return { pathname: "/customers/[key]", params: { key: customer } };
  const screen = APP_SCREENS[pathname];
  return screen ? { pathname: screen } : null;
}

/**
 * Opens a web-app path in the app when the app has that screen (orders, chats, find products, reviews…). A link
 * from the server to a page the app doesn't have asks first ("Opens website ↗"), so it's never a surprise.
 */
export function openPath(path: string) {
  // Video studio links carry the draft (?id=), or what a new video is for (?purpose=, ?product=).
  const video = videoScreenFor(path);
  if (video) return router.push({ pathname: video.pathname, params: video.params });
  const own = appScreenFor(path) ?? appRouteFor(path);
  if (own) return router.push((own.params ? { pathname: own.pathname, params: own.params } : own.pathname) as never);
  // A link to buy AI credits, a plan or a wallet top-up (a notification, a Rex card) does nothing in the app: no
  // "Open the website?" either, which would point to another way to pay (Google Play Payments, Apple 3.1.3).
  if (isDigitalPurchasePath(path)) return;
  const t = tNow("m_ui", "common");
  Alert.alert(t("web.askTitle"), t("web.askBody"), [
    { text: t("cancel"), style: "cancel" },
    // WebBadge text on the button itself.
    { text: t("web.badge"), onPress: () => void openWeb(path) },
  ]);
}
