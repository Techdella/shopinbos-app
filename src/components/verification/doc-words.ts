import type { TFunction } from "@shared/i18n";

// Document names and hints from shared/verification-docs.ts, in the person's language ("verification" namespace).
// The shared file stays English (admin screens, the API and the phone app read it); screens translate here.

type Translate = Pick<TFunction, "dynamic">;

const HINT_KEYS: Record<string, string> = {
  "BN or RC document accepted": "doc.hint.bnRc",
  "NIN slip or NIN-backed ID": "doc.hint.nin",
  "Photos of your products, combined into one PDF or a single clear image": "doc.hint.productImages",
  "TIN certificate or tax document. Boosts your trust score": "doc.hint.tax",
  "For address verification. Boosts your trust score": "doc.hint.utilityBoost",
  "Bank letter or statement header that matches your business name": "doc.hint.bank",
  "Public liability. Unlocks badges": "doc.hint.insurance",
  "Required for fleet operations": "doc.hint.insuranceFleet",
  "For address verification": "doc.hint.utility",
  "Vehicle registration, road worthiness": "doc.hint.fleet",
  "A clear photo of your face, looking at the camera": "doc.hint.selfie",
  "Optional. Shows a Licensed Courier badge": "doc.hint.courierLicence",
};

/** "Business registration or CAC certificate", translated. Falls back to the English label. */
export function docLabel(t: Translate, type: string, english: string) {
  return t.dynamic(`doc.${type}.label`, english);
}

/** A document's hint, translated when it's one of the standard ones. */
export function docHint(t: Translate, english: string) {
  const key = HINT_KEYS[english];
  return key ? t.dynamic(key, english) : english;
}

const STATUS_KEYS: Record<string, string> = {
  Needed: "docStatus.needed",
  Optional: "docStatus.optional",
  "Needs re-upload": "docStatus.needsReupload",
  Draft: "docStatus.draft",
  Uploaded: "docStatus.uploaded",
  "Sent for review": "docStatus.sent",
  "Under review": "docStatus.underReview",
  "Verified with CAC": "docStatus.verifiedCac",
  Approved: "docStatus.approved",
  Rejected: "docStatus.rejected",
};

/** docStatusLabel(doc, "owner", required) from shared/verification-docs.ts, translated. */
export function docStatusWords(t: Translate, english: string) {
  const key = STATUS_KEYS[english];
  return key ? t.dynamic(key, english) : english;
}

/** validateDocFile from shared/verification-docs.ts, in the person's language. */
export function docFileProblem(t: Translate, file: { name: string; size: number }, english: string | null) {
  if (!english) return null;
  if (english.endsWith("isn't a PDF, JPG, PNG or WebP file.")) return t.dynamic("docFile.wrongType", english, { name: file.name });
  if (english.endsWith("is empty.")) return t.dynamic("docFile.empty", english, { name: file.name });
  if (english.endsWith("The limit is 4 MB.")) return t.dynamic("docFile.tooBig", english, { name: file.name, size: english.slice(file.name.length + 4, english.indexOf(". The limit")) });
  return english;
}
