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

/** Opens a web-app path, but in the app when the app has that screen (orders, record a sale, add products). */
export function openPath(path: string) {
  const order = path.match(/^\/home\/orders\/([\w-]+)$/);
  if (path === "/home/orders/new") return router.push("/record-sale");
  if (order) return router.push({ pathname: "/order/[id]", params: { id: order[1] } });
  if (path === "/home/orders" || path.startsWith("/home/orders?")) return router.push("/orders");
  if (path === "/products/new") return router.push("/add-products");
  return openWeb(path);
}
