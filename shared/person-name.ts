// The stand-in name an account gets when nobody typed one (a phone sign-up that skipped the name, an older client).
// It must never be shown as a person's name ("Good morning, Shopinbos") and never replace a name someone typed.

export const PLACEHOLDER_NAME = "Shopinbos User";

/** True for no name or the stand-in. */
export function isPlaceholderName(name: string | null | undefined) {
  const clean = (name ?? "").trim().toLowerCase();
  return !clean || clean === PLACEHOLDER_NAME.toLowerCase();
}

/** The person's name to show, or "" when there's only the stand-in. */
export function realName(name: string | null | undefined) {
  return isPlaceholderName(name) ? "" : (name ?? "").trim();
}
