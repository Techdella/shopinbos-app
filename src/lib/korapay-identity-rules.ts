// Korapay Identity (developers.korapay.com/docs/nigeria-bvn, /nigeria-nin, read October 2026): the pure parts,
// unit-tested in tests/korapay-identity.test.mjs.
//
//   POST /merchant/api/v1/identities/ng/bvn | nin
//     { id, verification_consent: true, validation: { first_name, last_name, date_of_birth } }
//     → { status: true, message, data: { reference, first_name, middle_name, last_name, date_of_birth: "YYYY-MM-DD",
//         validation: { first_name: { value, match }, … } } }
//   With validation.selfie ("data:image/jpeg;base64,…") the NIN's photo is compared with it (facial matching):
//     → data.validation.selfie: { value, match: true, confidence_rating: 94 }
// Sandbox (test secret key): BVN 22222222222 and NIN 55555555555 are found, 00000000000 is not.
//
// Names and the date of birth are compared here, the same way as Youverify's answers (./youverify-rules.ts), rather
// than trusted from Korapay's `match` flags: a field Korapay didn't return is null ("couldn't confirm"), never a pass.

import { isoDate, typedNameMatches, type YouverifyIdentityResult } from "./youverify-rules.ts";

export type IdentityCheckResult = YouverifyIdentityResult;

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

/** Messages that mean the problem is ours (key, access, balance), never the number the person typed. */
const OUR_SETUP = /key|authori[sz]|unauthori[sz]|permission|access|balance|insufficient|fund|enable|activate|consent/i;

/** Turns a Korapay BVN or NIN answer (HTTP status + JSON) into one result checked against what the person typed. */
export function readKorapayIdentity(httpStatus: number, body: unknown, typed: { firstName: string; lastName: string; dateOfBirth: string }): IdentityCheckResult {
  const json = (body && typeof body === "object" ? body : {}) as { status?: boolean; message?: string; data?: Record<string, unknown> | null };
  const message = text(json.message) ?? `Korapay answered ${httpStatus}`;
  const data = json.data && typeof json.data === "object" ? json.data : null;
  if (httpStatus < 200 || httpStatus >= 300 || json.status !== true || !data) {
    // 401/403 (key or Identity not enabled), 402 and balance messages (fees come from the Korapay balance) and 429/5xx
    // are ours to fix. Only a 400/404/422 about the number itself counts as "we couldn't find that ID".
    const aboutTheNumber = (httpStatus === 400 || httpStatus === 404 || httpStatus === 422) && !OUR_SETUP.test(message);
    return { ok: false, notFound: aboutTheNumber, message };
  }
  const firstName = text(data.first_name);
  const middleName = text(data.middle_name);
  const lastName = text(data.last_name);
  const dateOfBirth = isoDate(text(data.date_of_birth));
  return {
    ok: true,
    identity: {
      reference: text(data.reference),
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
      ...(selfieOf(data) ? { selfie: selfieOf(data)! } : {}),
    },
  };
}

/** Korapay's facial match (data.validation.selfie), or null when no selfie result came back. */
function selfieOf(data: Record<string, unknown>): { match: boolean | null; confidence: number | null } | null {
  const validation = data.validation && typeof data.validation === "object" ? (data.validation as Record<string, unknown>) : null;
  const selfie = validation?.selfie && typeof validation.selfie === "object" ? (validation.selfie as Record<string, unknown>) : null;
  if (!selfie) return null;
  const confidence = typeof selfie.confidence_rating === "number" ? selfie.confidence_rating : Number(selfie.confidence_rating);
  return { match: typeof selfie.match === "boolean" ? selfie.match : null, confidence: Number.isFinite(confidence) ? confidence : null };
}
