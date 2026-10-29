// The stand-in name an account gets when nobody typed one (a phone sign-up that skipped the name, an older client).
// It must never be shown as a person's name ("Good morning, Shopinbos") and never replace a name someone typed.

export const PLACEHOLDER_NAME = "Shopinbos User";

/** True for no name, the stand-in, or our own brand name (a Google account called "Shopinbos" is ours, not a person). */
export function isPlaceholderName(name: string | null | undefined) {
  const clean = (name ?? "").trim().toLowerCase();
  return !clean || clean === PLACEHOLDER_NAME.toLowerCase() || clean === "shopinbos";
}

/** The person's name to show, or "" when there's only the stand-in. */
export function realName(name: string | null | undefined) {
  return isPlaceholderName(name) ? "" : (name ?? "").trim();
}

/**
 * The first name to greet someone by in a message ("Hi Ada"), or `fallback` ("Hi there") when there's no real one:
 * never the stand-in ("Hi Shopinbos"), an email address or a number. Every WhatsApp template, email and SMS that
 * greets a person by name uses this.
 */
export function greetingName(name: string | null | undefined, fallback = "there") {
  const first = realName(name).split(/\s+/)[0] ?? "";
  if (first.length < 2 || first.length > 30 || /@/.test(first) || !/\p{L}/u.test(first) || first.toLowerCase() === "shopinbos") return fallback;
  return first.charAt(0).toUpperCase() + first.slice(1);
}
