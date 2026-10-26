import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import { appPayOutcome, readAppPaidLink, type PayOutcome } from "@shared/paystack-return";
import { api } from "./api";

// Paying another business by card from the phone (a seller's cash on delivery, a delivery fee, a wholesale order,
// money owed, prints, an ads setup fee): never Shopinbos credits, plans or wallet top-ups, which the app doesn't sell
// (Apple 3.1.1, Google Play payments: those email the website steps instead).
//
// The server starts the Paystack payment with our return address (`app`), so Paystack comes back through the web's
// /api/mobile/paid, which checks it and sends the in-app browser to shopinbos://paid?ref=…&status=…: the browser
// closes by itself and we confirm the reference straight away (POST /api/mobile/payments/confirm, the same
// idempotent confirm Paystack's webhook runs). shared/paystack-return.ts has the rules.

export type { PayOutcome };

export interface PayResult {
  outcome: PayOutcome;
  /** Kept for screens that only ask "did it go through?". */
  paid: boolean;
}

export interface StartedPayment {
  reference?: string;
  authorizationUrl: string | null;
}

/** Where Paystack's return page sends the in-app browser (app.json "scheme"; Expo Go's own address in development). */
export const paidReturnUrl = () => makeRedirectUri({ scheme: "shopinbos", path: "paid" });

/**
 * Starts a payment with `start(app)` (the server call, given our return address), opens Paystack in an in-app
 * browser that closes by itself once paid, then confirms it. Paid, still on its way (a transfer: the webhook finishes
 * it), or cancelled (closed before paying). Errors from starting it are thrown for the screen to show.
 */
export async function payInApp(start: (app: string) => Promise<StartedPayment>): Promise<PayResult> {
  const app = paidReturnUrl();
  const started = await start(app);
  if (!started.authorizationUrl) return { outcome: "cancelled", paid: false };
  const browser = await WebBrowser.openAuthSessionAsync(started.authorizationUrl, app).catch(() => null);
  const link = browser?.type === "success" ? readAppPaidLink(browser.url) : null;
  const reference = started.reference ?? link?.reference ?? null;
  // An older server without this route (404) leaves the answer to the return page, or to the browser closing.
  const confirm = reference
    ? await api<{ outcome: PayOutcome }>("/api/mobile/payments/confirm", { method: "POST", json: { reference } }).catch(() => null)
    : null;
  const outcome = appPayOutcome({ browser: browser?.type ?? null, link: link?.outcome ?? null, confirm: confirm?.outcome ?? null });
  return { outcome, paid: outcome === "paid" };
}
