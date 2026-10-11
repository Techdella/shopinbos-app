// Profile photos and logos (a seller's store logo, a supplier's or delivery partner's business logo).
// Shared by the web uploader, the upload API and the mobile app so they accept the same files.

export type IdentityImageKind = "avatar" | "logo";

export const IDENTITY_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
// Under Vercel's ~4.5 MB request cap. The web uploader shrinks photos first, so this is rarely reached.
export const IDENTITY_IMAGE_MAX_BYTES = 4 * 1024 * 1024;

/** Why a file can't be used, or null when it's fine. */
export function identityImageProblem(file: { type: string; size: number }): string | null {
  if (!(IDENTITY_IMAGE_TYPES as readonly string[]).includes(file.type)) return "Use a JPG, PNG or WebP image.";
  if (file.size <= 0) return "That file is empty.";
  if (file.size > IDENTITY_IMAGE_MAX_BYTES) return "That image is over 4 MB. Choose a smaller one.";
  return null;
}

/** "Ada Obi" → "AO"; falls back to "?" for an empty name. */
export function initialsOf(name: string | null | undefined, max = 2) {
  const letters = (name ?? "").split(/\s+/).filter(Boolean).map((part) => part[0]!.toUpperCase()).join("");
  return letters.slice(0, max) || "?";
}

/** What the logo is called for each role ("Store logo" for sellers). Null when the role has no logo. */
export function logoLabelFor(role: string): string | null {
  if (role === "seller") return "Store logo";
  if (role === "supplier") return "Business logo";
  if (role === "logistics_partner") return "Company logo";
  return null;
}
