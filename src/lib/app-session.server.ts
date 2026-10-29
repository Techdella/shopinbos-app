import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { APP_SESSION_COOKIE, hasAppSessionCookie } from "@/lib/app-session";
import { isPhoneAppRequest, withoutPurchasePrompt } from "@shared/store-payments";

/** True on a page the phone app opened (see src/lib/app-session.ts): hide anything that sells a digital item. */
export async function isAppSession() {
  return (await cookies()).get(APP_SESSION_COOKIE)?.value === "1";
}

/** A request from the phone app itself, or from a page it opened. */
export function isAppRequest(headers: { get(name: string): string | null }) {
  return isPhoneAppRequest(headers) || hasAppSessionCookie(headers.get("cookie") ?? "");
}

export const NOT_IN_APP_CODE = "NOT_IN_APP";
/** Plain words, no pointer to another way to buy (that would itself break the store rules). */
export const NOT_IN_APP_MESSAGE = "This isn't available in the Shopinbos app.";

/**
 * For the endpoints that start a purchase of a digital item: a 403 when the request comes from the app, else null.
 * The pages hide their buy buttons too; this is the guarantee.
 */
export function appPurchaseRefusal(req: { headers: { get(name: string): string | null } }) {
  return isAppRequest(req.headers) ? apiError(NOT_IN_APP_CODE, NOT_IN_APP_MESSAGE, 403) : null;
}

/** True when the current request comes from a page the phone app opened (route handlers and server actions). */
async function fromAppPage() {
  try {
    return (await cookies()).get(APP_SESSION_COOKIE)?.value === "1";
  } catch {
    return false; // Outside a request (cron, webhooks).
  }
}

/**
 * A plan or credits message as the current request may show it: on pages the phone app opened, without its purchase
 * sentence ("Upgrade to Pro to add more."); elsewhere unchanged. The phone app's own screens use their own words
 * (shared/store-payments.ts storeSafeKind), so its requests keep the full message.
 */
export async function storeSafeMessage(message: string): Promise<string> {
  return (await fromAppPage()) ? withoutPurchasePrompt(message) : message;
}

/** The same for a nullable "problem" answer (null: allowed). */
export async function storeSafeProblem(message: string | null): Promise<string | null> {
  return message === null ? null : storeSafeMessage(message);
}

/** Error fields that point to a purchase page (the web shows them as "Buy credits" or "See plans" links). */
const PURCHASE_LINK_FIELDS = ["buyUrl", "upgradeUrl", "plansUrl", "billingUrl"];

/**
 * An API error answered to a page the phone app opened, without its purchase prompt: the message loses its "Upgrade
 * to …" sentence and purchase links are dropped. Everything else (successful answers, other callers, the phone app's
 * own requests, non-JSON bodies) passes through untouched. withAuth runs every signed-in route's answer through it.
 */
export async function storeSafeResponse(req: { headers: { get(name: string): string | null } }, response: NextResponse): Promise<NextResponse> {
  if (response.status < 400 || isPhoneAppRequest(req.headers) || !hasAppSessionCookie(req.headers.get("cookie") ?? "")) return response;
  if (!response.headers.get("content-type")?.includes("application/json")) return response;
  const body = (await response.clone().json().catch(() => null)) as { error?: Record<string, unknown> } | null;
  const error = body?.error;
  if (!error || typeof error !== "object") return response;
  let changed = false;
  if (typeof error.message === "string") {
    const message = withoutPurchasePrompt(error.message);
    if (message !== error.message) {
      error.message = message;
      changed = true;
    }
  }
  for (const field of PURCHASE_LINK_FIELDS) {
    if (field in error) {
      delete error[field];
      changed = true;
    }
  }
  if (!changed) return response;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return NextResponse.json(body, { status: response.status, headers });
}
