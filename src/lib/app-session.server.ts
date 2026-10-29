import { cookies } from "next/headers";
import { apiError } from "@/lib/api/response";
import { APP_SESSION_COOKIE, hasAppSessionCookie } from "@/lib/app-session";
import { isPhoneAppRequest } from "@shared/store-payments";

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
