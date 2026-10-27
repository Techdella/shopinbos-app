// Kora's face check (developers.korapay.com/docs/liveness-check, /react-native-implementation, read October 2026): the
// pure parts, unit-tested in tests/korapay-liveness.test.mjs.
//
// The phone app runs Kora's Liveness SDK (kora-identity-react-native-sdk) with the public key and an `idLookup` of
// the person's NIN, so Kora matches the live face against the photo on the NIN record. The SDK hands the app a session
// reference (LC-…); the app sends only that here, and the server asks Kora for the outcome
// (GET /identities/verifications/:reference). What the phone says is never trusted on its own.
//
// The answer has the shape of the SDK's own completion data (kora-identity-react-native-sdk 0.4, types/api.d.ts):
//   { reference, status: pending | passed | failed, workflow_status: pending_liveness | processing_id_lookup |
//     processing_face_match | completed | failed, verification: { reference, id?, status: found | not_found | …,
//     result: valid | invalid, validation: { selfie: { match, confidence_rating } } } }
// and the SDK calls it verified when status isn't failed, workflow_status is completed and verification.result is
// valid. The server applies the same rule, plus the selfie must not say "no match". A clear failure is "failed";
// anything still running, or a shape we don't recognise, is "review" for the team, never a pass.

export type FaceOutcome = "passed" | "failed" | "review";

export interface FaceCheckResult {
  outcome: FaceOutcome;
  reference: string | null;
  /** The NIN Kora looked up, when it says (to make sure the face was matched to the NIN this wallet verified). */
  idNumber: string | null;
  /** In words, for the team's notes and the logs. */
  detail: string;
}

type Json = Record<string, unknown>;

const record = (value: unknown): Json | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null);
const word = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null);

/** Turns Kora's answer for a face-check reference (HTTP status + JSON) into passed, failed or review. */
export function readKorapayFaceCheck(httpStatus: number, body: unknown): FaceCheckResult {
  const json = record(body) ?? {};
  const data = record(json.data);
  const message = typeof json.message === "string" ? json.message : `Kora answered ${httpStatus}`;
  if (httpStatus < 200 || httpStatus >= 300 || json.status !== true || !data) {
    return { outcome: httpStatus === 404 ? "failed" : "review", reference: null, idNumber: null, detail: httpStatus === 404 ? "Kora has no check with this reference." : message };
  }
  const reference = typeof data.reference === "string" ? data.reference : null;
  const verification = record(data.verification);
  const rawId = verification?.id ?? data.id;
  const idNumber = typeof rawId === "string" ? rawId.replace(/\D/g, "") || null : null;
  const liveness = word(data.status);
  const workflow = word(data.workflow_status ?? data.workflowStatus);
  const result = word(verification?.result);
  const lookup = word(verification?.status);
  const selfie = record(record(verification?.validation)?.selfie);
  const faceMatch = typeof selfie?.match === "boolean" ? selfie.match : null;

  if (liveness === "failed" || workflow === "failed") return { outcome: "failed", reference, idNumber, detail: "Kora's liveness check didn't pass." };
  if (lookup === "not_found") return { outcome: "failed", reference, idNumber, detail: "Kora couldn't find the NIN to match the face against." };
  if (result === "invalid" || faceMatch === false) return { outcome: "failed", reference, idNumber, detail: "The face didn't match the photo on the NIN." };
  if (liveness === "passed" && workflow === "completed" && result === "valid") return { outcome: "passed", reference, idNumber, detail: "Live person, and the face matches the NIN." };
  return { outcome: "review", reference, idNumber, detail: `Not finished or not clear (status ${liveness ?? "?"}, workflow ${workflow ?? "?"}, result ${result ?? "?"}).` };
}

/** Kora references are short tokens ("LC-…", "VR-…"); anything else from the phone is refused before calling Kora. */
export function safeKoraReference(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{6,64}$/.test(value.trim()) ? value.trim() : null;
}
