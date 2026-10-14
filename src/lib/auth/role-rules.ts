// Which role an account has, and when it may change. One account is one role: a seller stays a seller, a supplier
// stays a supplier, a delivery partner stays a delivery partner. Pure (no imports), so tests/auth-roles.test.mjs
// loads it directly.
//
// The rules:
// - A brand-new account gets the role it signed up with (admin only for an approved invite).
// - An existing account keeps its stored role. Signing up again on another portal's page, Google on the wrong page,
//   or a changed `user_metadata.role` (people can edit their own metadata) never flips it, so a seller never
//   loses their shop by becoming a supplier, and the reverse.
// - The only change allowed is an approved admin invite becoming admin.
// - Metadata may only fill in a role that is missing (no app account row yet).

export type AccountRole = "seller" | "supplier" | "logistics_partner" | "admin";
export type SignupRole = Exclude<AccountRole, "admin">;

export function asAccountRole(value: unknown): AccountRole | null {
  return value === "seller" || value === "supplier" || value === "logistics_partner" || value === "admin" ? value : null;
}

export function asSignupRole(value: unknown): SignupRole | null {
  return value === "seller" || value === "supplier" || value === "logistics_partner" ? value : null;
}

/** The role an account ends up with after a sign-up, sign-in or sync. */
export function decideAccountRole(input: {
  existingRole: AccountRole | null | undefined;
  requestedRole: unknown;
  canUseAdminRole: boolean;
}): AccountRole {
  const existing = asAccountRole(input.existingRole);
  const requested = asAccountRole(input.requestedRole);
  if (requested === "admin") {
    if (input.canUseAdminRole) return "admin";
    return existing ?? "seller";
  }
  if (existing) return existing;
  return requested ?? "seller";
}

/**
 * The role a sync asks for (it only counts when the account has no app row yet): from a sign-up screen, the role
 * picked there (Google sign-ups carry none on the login, and a login left half-made can carry an old pick);
 * otherwise the role saved on the login when it was made; else seller.
 */
export function requestedSignupRole(metadataRole: unknown, bodyRole: unknown, fromSignup: boolean): AccountRole {
  const picked = fromSignup ? asAccountRole(bodyRole) : null;
  return picked ?? asAccountRole(metadataRole) ?? "seller";
}

/**
 * The proxy's repair: only fills in a role that is missing (no app account yet). A stored role is never changed
 * from metadata, and metadata can never make anyone an admin.
 */
export function roleToRepair(storedRole: AccountRole | null | undefined, metadataRole: unknown): SignupRole | null {
  if (asAccountRole(storedRole)) return null;
  return asSignupRole(metadataRole);
}

/** Metadata that disagrees with the stored role is brought back in line (the stored role is the truth). */
export function metadataNeedsAlign(storedRole: AccountRole, metadataRole: unknown) {
  return asAccountRole(metadataRole) !== storedRole;
}

/**
 * Signed up on one portal's page but this email or phone already has an account of another kind: the role it
 * already has (to say "This email already has a seller account"), else null.
 */
export function signupConflict(actualRole: unknown, wantedRole: SignupRole): AccountRole | null {
  const actual = asAccountRole(actualRole);
  return actual && actual !== wantedRole ? actual : null;
}

/** Query key for "you logged in on the wrong portal's page, so we opened your own": ?portal_note=<page role>. */
export const PORTAL_NOTE_PARAM = "portal_note";

/** Adds ?portal_note=<the page they used> to their real home, so it can say why they landed there. */
export function withPortalNote(destination: string, pageRole: SignupRole | "admin") {
  const [path, query = ""] = destination.split("?");
  const params = new URLSearchParams(query);
  params.set(PORTAL_NOTE_PARAM, pageRole);
  return `${path}?${params.toString()}`;
}
