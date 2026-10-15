import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import { API_URL } from "./api";
import { supabase } from "./supabase";

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

/** Opens a page of the web app (for tools that aren't in the mobile app yet), signed in as the app's user. */
export async function openWeb(path: string) {
  const token = await freshAccessToken().catch(() => null);
  const url = token
    ? `${API_URL}/auth/handoff?next=${encodeURIComponent(path)}#t=${token}`
    : `${API_URL}${path}`;
  return WebBrowser.openBrowserAsync(url);
}

/** Web pages the app has its own screen for (query strings are ignored). */
const APP_SCREENS: Record<string, string> = {
  "/home/orders": "/orders",
  "/home/orders/new": "/record-sale",
  "/products/new": "/add-products",
  "/products": "/products",
  "/home/start": "/start",
  "/home/messages": "/chats",
  "/home/inbox": "/chats",
  "/home/inbox/auto-replies": "/inbox/auto-replies",
  "/home/inbox/chatbot": "/inbox/chatbot",
  "/marketplace": "/find",
  "/home/reviews": "/reviews",
  "/home/customers": "/customers",
  "/home/marketing": "/marketing",
  "/home/marketing/campaigns": "/marketing",
  "/home/discounts": "/marketing",
  "/home/marketing/templates": "/marketing/templates",
  "/studio": "/rex",
  "/home/legal": "/legal",
  "/home/payments": "/payments",
  "/home/shipping": "/delivery",
  "/home/settings": "/settings",
  "/channels": "/channels",
  "/home/marketing/subscribers": "/marketing/subscribers",
};

/** Opens a web-app path, but in the app when the app has that screen (orders, inbox, find products, reviews…). */
export function openPath(path: string) {
  const [pathname] = path.split(/[?#]/);
  const order = pathname.match(/^\/home\/orders\/([\w-]+)$/);
  if (order && order[1] !== "new") return router.push({ pathname: "/order/[id]", params: { id: order[1] } });
  const product = pathname.match(/^\/products\/([\w-]+)$/);
  if (product && product[1] !== "new") return router.push({ pathname: "/product/[id]", params: { id: product[1] } });
  const legal = pathname.match(/^\/home\/legal\/([\w-]+)$/);
  if (legal) return router.push({ pathname: "/legal/[key]", params: { key: legal[1] } });
  if (pathname === "/home/reviews/request") return router.push("/reviews/ask" as never);
  const conversation = path.match(/^\/home\/messages\?(?:.*&)?c=([\w-]+)/);
  if (conversation) return router.push({ pathname: "/inbox/[id]", params: { id: conversation[1] } });
  const screen = APP_SCREENS[pathname.replace(/\/$/, "")];
  if (screen) return router.push(screen as never);
  return openWeb(path);
}
