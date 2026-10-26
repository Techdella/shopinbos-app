// Paystack payments started from the phone app, and the Paystack key checks. Pure (no server or app imports), so the
// web (src/app/api/mobile/paid, src/lib/payments/app-return.server.ts), the phone (apps/mobile/src/lib/wallet.ts) and
// tests/paystack-app-return.test.mjs share it.
//
// The phone opens Paystack's page with expo-web-browser's openAuthSessionAsync(url, "shopinbos://paid"). Paystack's
// callback_url for those payments is APP_PAID_PATH on the web app, which checks the payment with Paystack (the same
// idempotent confirm the webhook runs) and redirects to shopinbos://paid?ref=…&status=paid|pending|cancelled. The
// in-app browser sees its own scheme and closes by itself; the app then confirms the reference with its sign-in.
// Payments started on the web keep their own callback pages.

/** What a payment came to, as far as the person paying is concerned. */
export type PayOutcome = "paid" | "pending" | "cancelled";

/** The web route Paystack sends phone payments back to. */
export const APP_PAID_PATH = "/api/mobile/paid";

/** The app's own return address (app.json "scheme"), used when the app sends none. */
export const APP_PAID_DEEP_LINK = "shopinbos://paid";

/**
 * Paystack's transaction status in three words. "success" is paid; a card that failed or a page closed before paying
 * ("failed", "abandoned", "reversed") is cancelled; anything still moving (a bank transfer or USSD on its way:
 * "ongoing", "pending", "processing", "queued") is pending, and the webhook finishes it.
 */
export function paystackOutcome(status: string | null | undefined): PayOutcome {
  const value = (status ?? "").trim().toLowerCase();
  if (value === "success") return "paid";
  if (["ongoing", "pending", "processing", "queued", "send_otp", "send_pin", "send_birthday", "send_phone", "open_url"].includes(value)) return "pending";
  return "cancelled";
}

/** Where Paystack sends a phone payment back to: the web route, with the app's return address when it sent one. */
export function appPaidCallbackUrl(origin: string, appReturn?: string | null): string {
  const url = new URL(APP_PAID_PATH, origin);
  if (appReturn) url.searchParams.set("app", appReturn);
  return url.toString();
}

/** shopinbos://paid?ref=…&status=… (or the Expo Go address the app sent), keeping anything already on it. */
export function appPaidDeepLink(appReturn: string, reference: string, outcome: PayOutcome | null): string {
  const [path, query = ""] = appReturn.split("?");
  const params = new URLSearchParams(query);
  params.delete("ref");
  params.delete("status");
  if (reference) params.set("ref", reference);
  if (outcome) params.set("status", outcome);
  const rest = params.toString();
  return rest ? `${path}?${rest}` : path;
}

/** The reference and outcome the web route put on the app's return address (null when it isn't one). */
export function readAppPaidLink(url: string | null | undefined): { reference: string | null; outcome: PayOutcome | null } | null {
  if (!url) return null;
  const query = url.split("?")[1]?.split("#")[0] ?? "";
  const params = new URLSearchParams(query);
  const status = params.get("status");
  const outcome = status === "paid" || status === "pending" || status === "cancelled" ? status : null;
  return { reference: params.get("ref"), outcome };
}

/** Paystack's reference from its return (it adds both ?reference= and ?trxref=), or null. */
export function referenceFromPaystackReturn(params: { get(name: string): string | null }): string | null {
  const value = (params.get("reference") ?? params.get("trxref") ?? "").trim();
  return /^[A-Za-z0-9._=-]{6,80}$/.test(value) ? value : null;
}

/**
 * What to tell the person once the browser is back. The signed-in confirm decides when it answered; else the web
 * route's answer on the return address; else a page closed without coming back is cancelled, unless the person got
 * there (the return address came back), in which case it is still on its way.
 */
export function appPayOutcome(input: { browser: "success" | "cancel" | "dismiss" | "locked" | "opened" | null; link: PayOutcome | null; confirm: PayOutcome | null }): PayOutcome {
  if (input.confirm === "paid" || input.link === "paid") return "paid";
  if (input.confirm) return input.confirm;
  if (input.link) return input.link;
  return input.browser === "success" ? "pending" : "cancelled";
}

// ─── Keys ─────────────────────────────────────────────────────────────────────

export type PaystackKeyMode = "live" | "test" | "missing";

/** A Paystack key's mode from its prefix (sk_live_ / pk_live_ or sk_test_ / pk_test_); placeholders count as missing. */
export function paystackKeyMode(key: string | null | undefined): PaystackKeyMode {
  const value = (key ?? "").trim();
  if (!value || /your[_-]|changeme|xxx/i.test(value)) return "missing";
  if (/^(sk|pk)_live_/.test(value)) return "live";
  if (/^(sk|pk)_test_/.test(value)) return "test";
  return "missing";
}

/** Paystack's test virtual-account bank; it only works with test keys. */
export const PAYSTACK_TEST_DVA_BANK = "test-bank";

/** The bank for top-up account numbers: the one set, except Paystack's test bank on live keys (it can't be used live). */
export function paystackDvaBank(secret: string | null | undefined, configured: string | null | undefined): string {
  const mode = paystackKeyMode(secret);
  const chosen = (configured ?? "").trim();
  if (chosen && !(mode === "live" && chosen === PAYSTACK_TEST_DVA_BANK)) return chosen;
  return mode === "test" ? PAYSTACK_TEST_DVA_BANK : "wema-bank";
}

/**
 * Paystack settings that will break payments, in plain words for Admin › Launch settings: keys from different modes,
 * test keys on the live site, or the test virtual-account bank with live keys.
 */
export function paystackKeyProblems(env: Record<string, string | undefined>, production: boolean): string[] {
  const secret = paystackKeyMode(env.PAYSTACK_SECRET_KEY);
  const publicKey = paystackKeyMode(env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY);
  const problems: string[] = [];
  if (secret !== "missing" && publicKey !== "missing" && secret !== publicKey) {
    problems.push(`The Paystack secret key is a ${secret} key but the public key is a ${publicKey} key. Use both live keys from Paystack → Settings → API Keys.`);
  }
  if (production && (secret === "test" || publicKey === "test")) {
    problems.push("The live site is using Paystack test keys, so no real payment goes through. Set the live keys.");
  }
  if (secret === "live" && (env.PAYSTACK_DVA_BANK ?? "").trim() === PAYSTACK_TEST_DVA_BANK) {
    problems.push(`PAYSTACK_DVA_BANK is "${PAYSTACK_TEST_DVA_BANK}", which only works with test keys. Set it to "wema-bank" or "titan-paystack" (or leave it empty for Wema).`);
  }
  return problems;
}
