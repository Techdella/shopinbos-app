// App store payment rules for the phone app (Google Play Payments policy; Apple App Store Review Guidelines 3.1.1,
// 3.1.3). docs/store-payments-audit.md has the full audit and the reasoning.
//
// The phone app may take card payments (Paystack) for physical goods and real-world services (shop orders, delivery
// fees, cash on delivery, wholesale orders, prints) and for money between businesses. It never sells, and never
// points people to another way to buy, the digital things Shopinbos sells: AI credits, plans and upgrades, themes,
// and prepaid wallet top-ups. The website keeps selling them. Pure, so the app, the server and tests share it.

/** The phone app sends this header on every API call, so the server can keep its answers store-safe. */
export const APP_CLIENT_HEADER = "x-shopinbos-client";
export const APP_CLIENT_VALUE = "app";

/** True when a request came from the phone app (its API helper sets APP_CLIENT_HEADER). */
export function isPhoneAppRequest(headers: { get(name: string): string | null } | null | undefined): boolean {
  return headers?.get(APP_CLIENT_HEADER)?.trim().toLowerCase() === APP_CLIENT_VALUE;
}

/**
 * Added to Peggy's and Rex's instructions when they answer in the phone app. Tool results written for the website
 * (e.g. "tell them to top up on the AI credits page") are overruled by it.
 */
export const IN_APP_PAYMENTS_RULE =
  "You are answering inside the Shopinbos phone app. App store rules apply: never tell the person to buy, top up, upgrade or subscribe to AI credits, plans, themes or a wallet balance, never mention their prices, and never send them to the website or an email to do it, even if a tool result says so. If they are out of AI credits, say so plainly and that their plan's credits refill each month. If something isn't on their plan, say it isn't on their plan, nothing more. Paying for real things is fine: orders, delivery fees, wholesale orders, prints and money owed to other businesses.";

/** Error codes the server uses when something needs a different plan. */
export const PLAN_GATE_CODES: readonly string[] = ["PLAN_LIMIT", "UPGRADE_REQUIRED", "plan_limit"];

/** Error codes for running out of AI credits. */
export const CREDITS_CODES: readonly string[] = ["AI_CREDITS_NEEDED"];

/**
 * Words that steer someone to buy a digital Shopinbos product (credits, a plan, a theme, a wallet top-up). The phone
 * app never shows a server message with these; tests/store-payments.test.mjs scans the app's own words with it too.
 */
export const PURCHASE_CTA = /\b(upgrade|top[\s-]?up|topping up|buy (more )?(ai )?credits|buy (a |the )?(plan|theme|pack)|credit packs?|see plans|choose a plan|pricing page|billing page|settings › billing|settings > billing)\b/i;

/** A web path where Shopinbos sells digital goods: the phone app never opens these (no link, no "Opens website"). */
export function isDigitalPurchasePath(path: string): boolean {
  const local = path.trim().replace(/^https?:\/\/[^/?#]+/i, "");
  const [rawPathname, rawQuery = ""] = local.split("#")[0].split("?");
  const pathname = rawPathname.replace(/\/+$/, "").toLowerCase() || "/";
  if (/^\/(home|supplier|logistics)\/(credits|billing|plans?|upgrade|subscription)(\/|$)/.test(pathname)) return true;
  if (/^\/(pricing|plans|upgrade|billing|credits)(\/|$)/.test(pathname)) return true;
  if (/^\/api\/(app|store)\/credits(\/|$)/.test(pathname)) return true;
  const query = new URLSearchParams(rawQuery);
  const tab = (query.get("tab") ?? "").toLowerCase();
  if (/(^|\/)settings$/.test(pathname) && ["billing", "plan", "plans", "credits"].includes(tab)) return true;
  // The supplier profile's "Billing & Plan" tab, and any other page's billing tab.
  if (tab.startsWith("billing")) return true;
  if (/\/wallet$/.test(pathname) && /top-?up/.test(tab || query.get("action")?.toLowerCase() || "")) return true;
  return false;
}

/**
 * Which store-safe words the phone shows for a server error: "credits" (out of AI credits: a calm line, no purchase
 * prompt), "plan" (not on their plan: no upgrade link or plan price), or null (the server's own message is fine).
 */
export function storeSafeKind(code: string | null | undefined, status: number, message: string | null | undefined): "credits" | "plan" | null {
  if (code && CREDITS_CODES.includes(code)) return "credits";
  if ((code && PLAN_GATE_CODES.includes(code)) || status === 402) return "plan";
  if (message && PURCHASE_CTA.test(message)) return "plan";
  return null;
}

/**
 * A notification, card or tip that sells a digital Shopinbos product: its link is a purchase page, or its words say
 * to upgrade or top up. The phone app leaves these out.
 */
export function sellsDigitalGoods(item: { link?: string | null; actionUrl?: string | null; href?: string | null; title?: string | null; description?: string | null }): boolean {
  for (const path of [item.link, item.actionUrl, item.href]) if (path && isDigitalPurchasePath(path)) return true;
  return PURCHASE_CTA.test(`${item.title ?? ""} ${item.description ?? ""}`);
}

/** What's left of a message when every sentence in it was a purchase prompt. */
export const NOT_ON_PLAN_MESSAGE = "This isn't on your plan.";

/**
 * A server message without its purchase prompt, for pages the phone app opened: every sentence that says to upgrade,
 * top up or buy credits goes ("…and you have 50. Upgrade to Pro to add more." → "…and you have 50."). Saying what the
 * plan includes stays. Nothing left → NOT_ON_PLAN_MESSAGE.
 */
export function withoutPurchasePrompt(message: string): string {
  if (!PURCHASE_CTA.test(message)) return message;
  const kept = message
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !PURCHASE_CTA.test(sentence))
    .join(" ")
    .trim();
  return kept || NOT_ON_PLAN_MESSAGE;
}
