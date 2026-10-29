// What a supplier adds to their public page beyond the basics (Supplier › Profile): a link to their Shopinbos store,
// their own website, and the people sellers deal with (team and account managers, with photos). The store link and
// the team live in Supplier.onboardingState (beside workshopPhotos), so no new columns: `storeUrl` and `showcaseTeam`.
// Shown on /suppliers/<slug>. Pure, unit-tested in tests/supplier-showcase.test.mjs.

export const SHOWCASE_TEAM_MAX = 8;

export interface ShowcaseMember {
  id: string;
  name: string;
  /** What they do, e.g. "Account manager". */
  role: string;
  photoUrl: string;
}

export interface SupplierShowcase {
  storeUrl: string | null;
  team: ShowcaseMember[];
}

const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

/**
 * A link someone typed, made safe to show: "mystore.mybos.store" → "https://mystore.mybos.store". Only http and
 * https, with a real host; anything else (javascript:, mailto:, a bare word) is null.
 */
export function cleanLink(value: unknown): string | null {
  const raw = text(value, 300);
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw.replace(/^\/+/, "")}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** "https://www.kalospice.com/shop" → "kalospice.com/shop", for the link's text. */
export function linkLabel(url: string) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
    return `${parsed.hostname.replace(/^www\./, "")}${path}`;
  } catch {
    return url;
  }
}

/** The store link and team kept in a supplier's onboardingState; anything malformed is left out. */
export function supplierShowcase(state: unknown): SupplierShowcase {
  const record = state && typeof state === "object" && !Array.isArray(state) ? (state as Record<string, unknown>) : {};
  const team: ShowcaseMember[] = [];
  if (Array.isArray(record.showcaseTeam)) {
    for (const entry of record.showcaseTeam) {
      if (!entry || typeof entry !== "object") continue;
      const raw = entry as Record<string, unknown>;
      const id = text(raw.id, 60);
      const name = text(raw.name, 80);
      const photoUrl = typeof raw.photoUrl === "string" && /^https?:\/\//.test(raw.photoUrl) ? raw.photoUrl : "";
      if (!id || !name || !photoUrl) continue;
      team.push({ id, name, role: text(raw.role, 60), photoUrl });
      if (team.length >= SHOWCASE_TEAM_MAX) break;
    }
  }
  return { storeUrl: cleanLink(record.storeUrl), team };
}
