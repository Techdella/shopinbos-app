// One "Connect Google" for everything Google: a single sign-in (one OAuth client, GOOGLE_CLIENT_ID) gives the
// store free product listings (Merchant Center), its Google reviews (Business Profile), Google search numbers and
// automatic site verification (Search Console + Site Verification) and visitor stats (Google Analytics 4).
// Gmail asks for its own permission, separately, from the email card: reading mail is a bigger ask.
// Pure (no imports) so tests can read it.

/** Every scope "Connect Google" asks for. Add exactly these in Google Cloud → OAuth consent screen → Scopes. */
export const GOOGLE_CONNECT_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/content",
  "https://www.googleapis.com/auth/business.manage",
  "https://www.googleapis.com/auth/webmasters",
  "https://www.googleapis.com/auth/siteverification",
  "https://www.googleapis.com/auth/analytics.edit",
] as const;

type Env = Record<string, string | undefined>;

const clean = (value: string | undefined) => (value ?? "").trim();

/**
 * The OAuth client for Google: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (the same client Gmail uses). The older
 * per-feature clients (GOOGLE_MERCHANT_*, GOOGLE_BUSINESS_*, GOOGLE_OAUTH_*) still work when the shared one isn't
 * set, so nothing breaks while moving to one client.
 */
export function googleClient(legacy: "merchant" | "business" | "searchConsole", env: Env = process.env): { id: string; secret: string } {
  const sharedId = clean(env.GOOGLE_CLIENT_ID);
  const sharedSecret = clean(env.GOOGLE_CLIENT_SECRET);
  if (sharedId && sharedSecret) return { id: sharedId, secret: sharedSecret };
  const prefix = legacy === "merchant" ? "GOOGLE_MERCHANT" : legacy === "business" ? "GOOGLE_BUSINESS" : "GOOGLE_OAUTH";
  return { id: clean(env[`${prefix}_CLIENT_ID`]), secret: clean(env[`${prefix}_CLIENT_SECRET`]) };
}
