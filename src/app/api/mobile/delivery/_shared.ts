import { withAuth } from "@/lib/auth/middleware";

// The phone app's side of the logistics marketplace (shared/delivery-market.ts, src/lib/delivery-market), with the
// same rules as the web forms in src/app/actions/delivery-market.ts. Sellers and suppliers ("owners") set where
// they sell and ship from, find and connect delivery partners, choose what customers see, and accept private rates.

type Handler = Parameters<typeof withAuth>[0];

export const withOwner = (handler: Handler) => withAuth(handler, ["seller", "supplier"]);

/** A form value as trimmed text, capped. */
export const text = (value: unknown, max = 200) => String(value ?? "").trim().slice(0, max);
