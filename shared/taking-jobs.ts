// Why a delivery company can't switch "Taking new jobs" on yet, shared by the server (POST
// /api/mobile/logistics/taking, the overview) and the phone's Jobs screen, so both say the same thing.
//   setup     → set-up isn't finished                       (Finish set-up → /logistics/setup)
//   documents → the documents haven't been sent for review  (Add your documents → /logistics/verification)
//   checking  → sent; the Shopinbos team is checking them   (no button, usually within 1 working day)
//   rejected  → the team asked for changes                  (Fix your documents → /logistics/verification)
//   hold      → the Shopinbos team suspended the company    (Talk to us → Help)
// null: the switch works. Only a suspension is "on hold"; a new or pending company is never told that.

import { LOGISTICS_DOC_TYPES, missingRequiredDocs, normalizeVerificationDocs } from "./verification-docs.ts";

/** The required documents are in and were sent for review (from LogisticsPartner.verificationDocuments). */
export function docsSentFor(verificationDocuments: unknown) {
  const docs = normalizeVerificationDocs(verificationDocuments);
  return missingRequiredDocs(LOGISTICS_DOC_TYPES, docs).length === 0 && docs.some((doc) => ["submitted", "under_review", "approved"].includes(doc.status));
}

export type TakingBlock = "setup" | "documents" | "checking" | "rejected" | "hold";

export interface TakingState {
  /** LogisticsPartner.status: active | paused | suspended (older rows may hold something else). */
  status: string;
  verificationStatus: string;
  onboarded: boolean;
  /** The required documents are in and were sent for review (submitted, under review or approved). */
  docsSent: boolean;
}

export function takingJobsBlock(partner: TakingState): TakingBlock | null {
  if (partner.status === "suspended" || partner.verificationStatus === "suspended") return "hold";
  if (partner.verificationStatus === "verified") return null;
  if (!partner.onboarded) return "setup";
  if (partner.verificationStatus === "rejected") return "rejected";
  // "pending" is also the starting value before anything is sent, so the documents decide.
  if (partner.verificationStatus === "pending" && partner.docsSent) return "checking";
  return "documents";
}

/** What the server answers when the switch is refused (the phone shows its own words for each code). */
export const TAKING_BLOCK_ERRORS: Record<TakingBlock, { code: string; message: string }> = {
  setup: { code: "SETUP_REQUIRED", message: "Finish setting up your company first, then you can take jobs." },
  documents: { code: "VERIFICATION_REQUIRED", message: "Add your documents and send them for review. You can take jobs once you're verified." },
  checking: { code: "VERIFICATION_PENDING", message: "We're checking your documents. Usually within 1 working day. You can take jobs once you're verified." },
  rejected: { code: "VERIFICATION_REJECTED", message: "Some documents need fixing. Open Verification, fix them and send them again." },
  hold: { code: "ACCOUNT_ON_HOLD", message: "Your account is on hold. Talk to the Shopinbos team in Help to switch it back on." },
};

/** The status the switch saves: verified companies with an old or odd status ("pending") move to active/paused. */
export function takingStatusFor(taking: boolean) {
  return taking ? "active" : "paused";
}
