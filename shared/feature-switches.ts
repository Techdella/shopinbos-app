// Turning pilot features on (pure: the server, Admin › Pilot features and the tests all use it).
//
// Pilot features ship in the code but stay OFF for everyone by default. The team turns one on in Admin › Pilot
// features (docs/migrations/2026-12-13-feature-switches.sql) for the shops, suppliers, people, areas and apps taking
// part. The apps ask GET /api/app/features when they open and come back to the front, so nothing needs a new release.
//
// A feature is on for someone when, in this order:
//   1. the global "Kill all pilot features" switch is off, and this feature's own kill switch is off (kill wins);
//   2. its master switch is on;
//   3. the app asking is one of its apps (none ticked = no app);
//   4. the app is at least the minimum version set for that app (too old, or a version we can't read: hidden);
//   5. it is on for everyone, OR a target matches (the shop, the supplier account, the user, or an area they are in),
//      OR the user redeemed an invite code that includes it.

export const FEATURE_APPS = ["business_android", "business_ios", "business_web", "plug_android", "plug_ios"] as const;
export type FeatureApp = (typeof FEATURE_APPS)[number];

export const FEATURE_APP_LABEL: Record<FeatureApp, string> = {
  business_android: "Business app · Android",
  business_ios: "Business app · iPhone",
  business_web: "Business app · Web",
  plug_android: "Plug · Android",
  plug_ios: "Plug · iPhone",
};

export const TARGET_KINDS = ["store", "supplier", "user", "area"] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];

/** The first pilot features (seeded off by the migration; keep the two lists in step). */
export const FEATURES = [
  { key: "post_to_plug", name: "Post to Plug", description: "Shops post videos to Shopinbos Plug." },
  { key: "resell", name: "Resell", description: "Creators and shops resell other shops' products for a commission." },
  { key: "creator_briefs", name: "Creator briefs", description: "Shops send briefs to creators to make videos for them." },
  { key: "notify_followers", name: "Notify followers", description: "Shops send a message to the people who follow them." },
  { key: "group_buy", name: "Group buy", description: "Customers buy together for a lower price." },
  { key: "ajo", name: "Ajo", description: "Customers save towards a product in rounds (ajo / esusu)." },
  { key: "pay_small_small", name: "Pay small small", description: "Customers pay for an order in parts." },
  { key: "personal_shopper", name: "Personal shopper", description: "Customers ask a shopper to find and buy for them." },
  { key: "live", name: "Live selling", description: "Shops sell on live video." },
  { key: "rex_studio_creators", name: "Rex Studio for creators", description: "Creators make videos in Rex Studio." },
  { key: "plug_follow_card", name: "Plug follow card", description: "The \"Follow us on Shopinbos Plug\" line on the shop share card." },
] as const;
export type FeatureKey = (typeof FEATURES)[number]["key"];
export const FEATURE_KEYS: readonly FeatureKey[] = FEATURES.map((feature) => feature.key);

/** PlatformSetting key of the global kill switch ({ killed: true }). */
export const KILL_ALL_SETTING_KEY = "features.kill_all";

/** Headers the apps send with GET /api/app/features. */
export const APP_PLATFORM_HEADER = "x-app-platform";
export const APP_VERSION_HEADER = "x-app-version";

export type FeatureSwitchRule = {
  key: string;
  enabled: boolean;
  killed: boolean;
  everyone: boolean;
  apps: readonly string[];
  minVersions: Readonly<Record<string, string>>;
};

export type FeatureTargetRule = { featureKey: string; kind: string; value: string };

export type PlaceRule = { state?: string; city?: string; area?: string };
export type PilotAreaRule = { id: string; places: readonly PlaceRule[] };

export type Place = { state?: string | null; city?: string | null; area?: string | null };

export type FeatureContext = {
  app: string | null;
  appVersion: string | null;
  userId: string | null;
  storeId?: string | null;
  supplierId?: string | null;
  place?: Place | null;
  inviteFeatures: readonly string[];
};

// ─── Apps and versions ────────────────────────────────────────────────────────

export function isFeatureApp(value: unknown): value is FeatureApp {
  return typeof value === "string" && (FEATURE_APPS as readonly string[]).includes(value);
}

/** The X-App-Platform header as an app; anything unknown is null (no app: every feature off). */
export function parseFeatureApp(value: string | null | undefined): FeatureApp | null {
  const clean = String(value ?? "").trim().toLowerCase();
  return isFeatureApp(clean) ? clean : null;
}

const VERSION_RE = /^v?(\d{1,6})(?:\.(\d{1,6}))?(?:\.(\d{1,6}))?(?:[-+ ].*)?$/;

/** "1.0.3" → [1, 0, 3]; "2" → [2, 0, 0]; "v1.2.0-beta" → [1, 2, 0]; anything else → null. */
export function parseVersion(value: string | null | undefined): [number, number, number] | null {
  const match = VERSION_RE.exec(String(value ?? "").trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

/** Negative when a < b, 0 when equal, positive when a > b (numbers, not text: 1.0.10 > 1.0.9). Null when unreadable. */
export function compareVersions(a: string | null | undefined, b: string | null | undefined): number | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;
  for (let i = 0; i < 3; i += 1) if (left[i] !== right[i]) return left[i] - right[i];
  return 0;
}

/** Is this version at least the minimum? No minimum: yes. A minimum but no readable version: no (fail closed). */
export function versionAtLeast(version: string | null | undefined, min: string | null | undefined): boolean {
  if (!String(min ?? "").trim()) return true;
  const compared = compareVersions(version, min);
  return compared !== null && compared >= 0;
}

export function isValidVersion(value: string) {
  return parseVersion(value) !== null;
}

// ─── Places ───────────────────────────────────────────────────────────────────

/** Lowercase, no "state" suffix, no punctuation: "Lagos State" → "lagos", "Yaba-Surulere" → "yaba surulere". */
export function placeKey(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bstate\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Does someone's place fall in this rule? Every part the rule names must match: the state against their state; a
 * city or area against their city OR area (people type "Yaba" as their city as often as "Lagos"). A rule naming
 * nothing matches nobody.
 */
export function placeMatches(rule: PlaceRule, place: Place | null | undefined): boolean {
  if (!place) return false;
  const state = placeKey(rule.state);
  const city = placeKey(rule.city);
  const area = placeKey(rule.area);
  if (!state && !city && !area) return false;
  const theirs = { state: placeKey(place.state), city: placeKey(place.city), area: placeKey(place.area) };
  if (state && state !== theirs.state) return false;
  const local = (want: string) => !want || want === theirs.city || want === theirs.area;
  return local(city) && local(area);
}

/**
 * One line of the admin's area editor → a place rule. "Lagos" (a state), "Lagos > Yaba" (a city or area in the
 * state), "Lagos > Lagos > Surulere" (state, city, area). ">" or "/" separate the parts. Empty → null.
 */
export function parsePlaceLine(line: string): PlaceRule | null {
  const parts = String(line ?? "").split(/[>/]/).map((part) => part.replace(/\s+/g, " ").trim().slice(0, 60));
  if (!parts.some(Boolean)) return null;
  const [state, second, third] = parts;
  const rule: PlaceRule = {};
  if (state) rule.state = state;
  if (third !== undefined) {
    if (second) rule.city = second;
    if (third) rule.area = third;
  } else if (second) {
    rule.area = second;
  }
  return rule.state || rule.city || rule.area ? rule : null;
}

export function formatPlaceRule(rule: PlaceRule): string {
  if (rule.city) return [rule.state ?? "", rule.city, rule.area ?? ""].join(" > ").replace(/( > )+$/, "");
  return [rule.state, rule.area].filter(Boolean).join(" > ");
}

/** The admin's textarea → place rules (blank lines skipped, at most 200). */
export function parsePlaces(text: string): PlaceRule[] {
  return String(text ?? "")
    .split(/\r?\n/)
    .map(parsePlaceLine)
    .filter((rule): rule is PlaceRule => rule !== null)
    .slice(0, 200);
}

/** A stored places value (jsonb) → rules, dropping anything malformed. */
export function readPlaces(value: unknown): PlaceRule[] {
  if (!Array.isArray(value)) return [];
  const out: PlaceRule[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const rule: PlaceRule = {};
    for (const key of ["state", "city", "area"] as const) if (typeof raw[key] === "string" && raw[key]) rule[key] = String(raw[key]).slice(0, 60);
    if (rule.state || rule.city || rule.area) out.push(rule);
  }
  return out;
}

// ─── Stored values ────────────────────────────────────────────────────────────

/** A stored minVersions value (jsonb) → { app: version } for known apps with a readable version. */
export function readMinVersions(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [app, version] of Object.entries(value as Record<string, unknown>)) {
    if (isFeatureApp(app) && typeof version === "string" && isValidVersion(version)) out[app] = version.trim();
  }
  return out;
}

export function readApps(value: unknown): FeatureApp[] {
  return Array.isArray(value) ? FEATURE_APPS.filter((app) => value.includes(app)) : [];
}

// ─── The decision ─────────────────────────────────────────────────────────────

/** Does any target of this feature match this person (their shop, supplier account, own account, or an area they're in)? */
export function targetMatches(featureKey: string, ctx: FeatureContext, targets: readonly FeatureTargetRule[], areas: readonly PilotAreaRule[]): boolean {
  for (const target of targets) {
    if (target.featureKey !== featureKey || !target.value) continue;
    if (target.kind === "store" && ctx.storeId && target.value === ctx.storeId) return true;
    if (target.kind === "supplier" && ctx.supplierId && target.value === ctx.supplierId) return true;
    if (target.kind === "user" && ctx.userId && target.value === ctx.userId) return true;
    if (target.kind === "area" && ctx.place) {
      const area = areas.find((row) => row.id === target.value);
      if (area?.places.some((rule) => placeMatches(rule, ctx.place))) return true;
    }
  }
  return false;
}

/** Is this one feature on for this person on this app? Kill switches win; see the top of the file for the order. */
export function isFeatureOn(
  feature: FeatureSwitchRule | null | undefined,
  ctx: FeatureContext,
  targets: readonly FeatureTargetRule[],
  areas: readonly PilotAreaRule[],
  options: { killAll?: boolean } = {},
): boolean {
  if (!feature || options.killAll || feature.killed || !feature.enabled) return false;
  if (!ctx.app || !feature.apps.includes(ctx.app)) return false;
  if (!versionAtLeast(ctx.appVersion, feature.minVersions?.[ctx.app])) return false;
  if (feature.everyone) return true;
  if (ctx.inviteFeatures.includes(feature.key)) return true;
  return targetMatches(feature.key, ctx, targets, areas);
}

/** The keys of every feature on for this person on this app, sorted. */
export function featuresOn(
  features: readonly FeatureSwitchRule[],
  ctx: FeatureContext,
  targets: readonly FeatureTargetRule[],
  areas: readonly PilotAreaRule[],
  options: { killAll?: boolean } = {},
): string[] {
  if (options.killAll) return [];
  return features.filter((feature) => isFeatureOn(feature, ctx, targets, areas, options)).map((feature) => feature.key).sort();
}

// ─── Invite codes ─────────────────────────────────────────────────────────────

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L

/** What someone typed → the stored form: uppercase letters and digits only ("plug-abc 12" → "PLUGABC12"). */
export function normalizeInviteCode(value: string | null | undefined): string {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32);
}

/** A new code from random bytes (the caller passes crypto randomness): "PILOT-" + 8 easy-to-read letters/digits. */
export function inviteCodeFrom(bytes: ArrayLike<number>, prefix = "PILOT"): string {
  let body = "";
  for (let i = 0; i < 8; i += 1) body += CODE_ALPHABET[(bytes[i] ?? 0) % CODE_ALPHABET.length];
  return normalizeInviteCode(`${prefix}${body}`);
}

export type InviteState = { features: readonly string[]; maxUses: number | null; uses: number; expiresAt: Date | string | null; disabled?: boolean };

/** Can this invite still be redeemed now? Why not, when it can't. */
export function inviteUsable(invite: InviteState | null | undefined, now: Date): "ok" | "not_found" | "expired" | "used_up" {
  if (!invite || invite.disabled) return "not_found";
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() <= now.getTime()) return "expired";
  if (invite.maxUses !== null && invite.maxUses !== undefined && invite.uses >= invite.maxUses) return "used_up";
  return "ok";
}
