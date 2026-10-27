// Youverify (doc.youverify.co, read October 2026): the pure parts, unit-tested in tests/youverify.test.mjs.
//
// Quick checks answer in the HTTP body, wrapped as { success, statusCode, message, data }:
//   POST /v2/api/identity/ng/nin { id, isSubjectConsent: true, validations: { data: { firstName, lastName, dateOfBirth } } }
//     → data: { status: "found", firstName, middleName, lastName, dateOfBirth, allValidationPassed, … }
//   POST /v2/api/identity/ng/bvn { id, isSubjectConsent: true, validation: { … } }
//     → data: { status: "found", firstName, middleName, lastName, … } (Youverify documents no fields inside
//       `validation` and no dateOfBirth in the BVN answer, so names and the date are compared here, never assumed)
// A check whose upstream registry is down comes back "pending" (finished later by webhook): treated as "try again".
//
// Every field below is compared here rather than trusted from a flag: a name or date Youverify didn't return is
// null ("couldn't confirm"), never a pass.

export interface YouverifyIdentity {
  reference: string | null;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  dateOfBirth: string | null;
  matches: { firstName: boolean | null; lastName: boolean | null; dateOfBirth: boolean | null };
  /** The selfie compared with the ID's photo, when one was sent (Korapay only): null fields weren't returned. */
  selfie?: { match: boolean | null; confidence: number | null };
}

export type YouverifyIdentityResult = { ok: true; identity: YouverifyIdentity } | { ok: false; notFound: boolean; pending?: boolean; message: string };

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

/** Upper-case words of a name, accents and punctuation dropped. */
export function nameWords(name: string | null | undefined): string[] {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z\s'-]+/g, " ")
    .split(/[\s'-]+/)
    .filter(Boolean);
}

/** Every word typed is among the words on the ID (so "Ada" matches "ADA NGOZI", and "Ada" never matches "ADAM"). */
export function typedNameMatches(typed: string, ...onId: (string | null)[]): boolean | null {
  const id = new Set(onId.flatMap((part) => nameWords(part)));
  if (!id.size) return null;
  const words = nameWords(typed);
  return words.length > 0 && words.every((word) => id.has(word));
}

/** YYYY-MM-DD from Youverify's dates ("1988-04-04", "1988-04-04T00:00:00.000Z", "04-04-1988", "04/04/1988"). */
export function isoDate(value: string | null): string | null {
  if (!value) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(value);
  return dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : null;
}

/** Turns a Youverify BVN or NIN answer (HTTP status + JSON) into one result checked against what the person typed. */
export function readYouverifyIdentity(httpStatus: number, body: unknown, typed: { firstName: string; lastName: string; dateOfBirth: string }): YouverifyIdentityResult {
  const json = (body && typeof body === "object" ? body : {}) as { success?: boolean; message?: string; data?: Record<string, unknown> | null };
  const data = json.data && typeof json.data === "object" ? json.data : null;
  const status = String(data?.status ?? "").toLowerCase();
  if (httpStatus === 404 || status === "not_found" || status === "notfound") return { ok: false, notFound: true, message: json.message ?? "not found" };
  if (status === "pending") return { ok: false, notFound: false, pending: true, message: "pending" };
  if (httpStatus < 200 || httpStatus >= 300 || json.success === false || !data || status !== "found") {
    const message = json.message ?? `Youverify answered ${httpStatus}`;
    // 400/422 means the number itself was refused; keys (401/403), balance (402) and limits (429) are ours to fix.
    return { ok: false, notFound: httpStatus === 400 || httpStatus === 422, message };
  }
  const firstName = text(data.firstName);
  const middleName = text(data.middleName);
  const lastName = text(data.lastName);
  const dateOfBirth = isoDate(text(data.dateOfBirth));
  return {
    ok: true,
    identity: {
      reference: text(data.id),
      firstName,
      lastName,
      middleName,
      dateOfBirth,
      matches: {
        // The typed first name may be the ID's first or middle name; the last name must be the ID's last name.
        firstName: firstName || middleName ? typedNameMatches(typed.firstName, firstName, middleName) : null,
        lastName: lastName ? typedNameMatches(typed.lastName, lastName) : null,
        dateOfBirth: dateOfBirth ? dateOfBirth === typed.dateOfBirth : null,
      },
    },
  };
}
