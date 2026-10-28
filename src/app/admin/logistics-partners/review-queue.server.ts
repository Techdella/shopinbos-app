import "server-only";

import { db } from "@/lib/db/client";
import { itemsWhere, tier1Checklist, tier2Checklist } from "@shared/partner-tiers";
import { partnerTierSnapshot } from "@/lib/logistics/partner-tiers.server";

// Admin › Logistics partners › Waiting for review: partners who sent their tier verification and are still
// pending, and any partner (verified ones too) with an item the team has to decide: an ID photo or NIN, a selfie,
// a base photo, a CAC certificate or courier licence, or a vehicle. Oldest sent first (the page sorts); each entry
// says what to check.

/** Items the partner finishes themselves (a code) aren't the team's to check. */
const PARTNER_SIDE = new Set(["phone", "email"]);

const WORDS: Record<string, string> = {
  idDocument: "ID photo",
  selfie: "selfie",
  basePhoto: "base photo",
  cacCertificate: "CAC certificate",
  courierLicence: "courier licence",
};

export async function reviewQueue(limit = 200): Promise<Array<{ id: string; pending: string[] }>> {
  const candidates = await db.logisticsPartner.findMany({
    where: {
      OR: [
        { kycSubmittedAt: { not: null }, verificationStatus: { in: ["pending", "unverified"] } },
        { vehicles: { some: { status: "pending" } } },
        { identityChecks: { path: ["nin", "status"], equals: "pending" } },
        { identityChecks: { path: ["payout", "status"], equals: "pending" } },
        // Documents live in a JSON list; partners with any document sent are checked below.
        { verificationDocuments: { array_contains: [{ status: "uploaded" }] } },
        { verificationDocuments: { array_contains: [{ status: "submitted" }] } },
        { verificationDocuments: { array_contains: [{ status: "under_review" }] } },
      ],
    },
    orderBy: [{ kycSubmittedAt: { sort: "asc", nulls: "last" } }],
    select: { id: true, kycSubmittedAt: true, verificationStatus: true },
    take: limit,
  }).catch(() => []);

  const entries = await Promise.all(
    candidates.map(async (candidate) => {
      const found = await partnerTierSnapshot(candidate.id);
      if (!found) return null;
      const { snapshot } = found;
      const pending = [
        ...itemsWhere(tier1Checklist(snapshot), ["pending"]),
        ...itemsWhere(tier2Checklist(snapshot), ["pending"]),
        ...(snapshot.docs["courier-licence"] === "pending" ? ["courierLicence"] : []),
        ...(snapshot.docs["base-photo"] === "pending" ? ["basePhoto"] : []),
      ].filter((item) => !PARTNER_SIDE.has(item));
      const submittedAndWaiting = Boolean(candidate.kycSubmittedAt) && (candidate.verificationStatus === "pending" || candidate.verificationStatus === "unverified");
      if (!pending.length && !submittedAndWaiting) return null;
      return { id: candidate.id, pending: pending.map((item) => WORDS[item] ?? item) };
    }),
  );
  return entries.filter((entry): entry is { id: string; pending: string[] } => entry !== null);
}
