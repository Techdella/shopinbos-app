import "server-only";
import { db } from "@/lib/db/client";
import { parseVerificationDocs } from "@/lib/verification-utils";
import { DOC_TYPE_LABELS, docHasFile, type IdCheck, type VerificationDoc } from "@shared/verification-docs";

// A supplier's or delivery partner's "identity" document (their NIN) is the same check as their Shopinbos Wallet
// ID check (Youverify, src/lib/wallet): once the owner's BVN or NIN has passed, the document is approved with the
// check attached, so they never upload a NIN slip. An uploaded ID that is already approved or with the review team
// is left as it is. Never throws (the wallet check has already succeeded).

export async function approveIdentityDocFromWallet(userId: string, role: "supplier" | "logistics_partner", check: Omit<IdCheck, "source">) {
  try {
    const model = (role === "supplier" ? db.supplier : db.logisticsPartner) as unknown as {
      findUnique(args: unknown): Promise<{ id: string; verificationDocuments: unknown } | null>;
      update(args: unknown): Promise<unknown>;
    };
    const entity = await model.findUnique({ where: { userId }, select: { id: true, verificationDocuments: true } });
    if (!entity) return;
    const docs = parseVerificationDocs(entity.verificationDocuments);
    const current = docs.find((doc) => doc.type === "identity");
    if (current && ["approved", "submitted", "under_review"].includes(current.status)) return;
    const now = check.checkedAt;
    const idCheck: IdCheck = { source: "wallet", ...check };
    const doc: VerificationDoc = current && docHasFile(current)
      ? { ...current, idCheck, status: "approved", updatedAt: now }
      : { id: current?.id ?? `identity-${Date.now()}`, type: "identity", label: DOC_TYPE_LABELS.identity, fileName: "", filePath: "", fileSize: 0, mimeType: "", status: "approved", uploadedAt: now, updatedAt: now, idCheck };
    await model.update({ where: { id: entity.id }, data: { verificationDocuments: [...docs.filter((row) => row.type !== "identity"), doc] } });
  } catch (error) {
    console.error(`[kyb] could not approve the ID document for ${role} ${userId}`, error);
  }
}
