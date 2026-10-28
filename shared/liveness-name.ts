// Names sent to Korapay's liveness check (web SDK and phone SDK). Korapay refuses to start the check when a name has
// "unsafe characters" (422, e.g. "last_name cannot contain unsafe characters" for "partner2+20261028", an email-style
// account name), so only letters, spaces and hyphens go: digits and symbols are dropped, and a name left too short
// falls back (first name) or is left out (last name). The check itself is about the face; the NIN check uses the
// name typed on the ID screen, not this one.

export function livenessNamePart(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[^\p{L}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s-]+|[\s-]+$/g, "")
    .slice(0, 50);
}

export function livenessUser(firstName: string | null | undefined, lastName: string | null | undefined, fallbackFirst: string) {
  const first = livenessNamePart(firstName);
  const last = livenessNamePart(lastName);
  return { firstName: first.length >= 2 ? first : fallbackFirst, lastName: last.length >= 2 ? last : undefined };
}
