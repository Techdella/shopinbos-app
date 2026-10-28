// The browser-safe half of the phone handoff (src/lib/kyc/handoff.ts signs and reads the tokens with node:crypto, so
// client screens import from here). No imports, so tests load it directly.

export const HANDOFF_KINDS = ["logistics", "supplier"] as const;
export type HandoffKind = (typeof HANDOFF_KINDS)[number];
export const HANDOFF_PURPOSES = ["selfie", "id"] as const;
export type HandoffPurpose = (typeof HANDOFF_PURPOSES)[number];

/** How long a phone link works. */
export const HANDOFF_TTL_MS = 20 * 60_000;

export function isHandoffPurpose(value: unknown): value is HandoffPurpose {
  return (HANDOFF_PURPOSES as readonly unknown[]).includes(value);
}

/** The phone page for a token. */
export function handoffPath(token: string) {
  return `/verify/phone/${encodeURIComponent(token)}`;
}

/** "Has the selfie (or ID photo) changed since the QR code was shown?": a document's upload and status times. */
export function docStamp(doc: { uploadedAt?: string | null; updatedAt?: string | null; status?: string | null } | null | undefined) {
  return doc ? `${doc.uploadedAt ?? ""}|${doc.updatedAt ?? ""}|${doc.status ?? ""}` : "";
}
