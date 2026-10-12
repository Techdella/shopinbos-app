"use server";

import { db } from "@/lib/db/client";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getCurrentAppUser } from "@/lib/server-auth";
import type { DocType, VerificationDoc } from "@/lib/verification-utils";
import { computeBadgeTier, parseVerificationDocs } from "@/lib/verification-utils";
import {
  DOC_TYPE_LABELS,
  docHasFile,
  docMimeType,
  docTypesForRole,
  missingRequiredDocs,
  submitUploadedDocs,
  validateDocFile,
} from "@shared/verification-docs";
import { assertUploadContent, privateBucket, removePrivateFile } from "@/lib/supabase/storage.server";

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET ?? "shopinbos-media";

export async function uploadVerificationDoc(
  role: "supplier" | "logistics_partner",
  docType: DocType,
  formData: FormData,
): Promise<{ success: boolean; doc?: VerificationDoc; error?: string }> {
  try {
    const user = await getCurrentAppUser({ expectedRole: role });
    if (!user || user.role !== role) return { success: false, error: "Not authenticated" };

    const file = formData.get("file");
    if (!(file instanceof File)) return { success: false, error: "No file provided" };
    if (!docTypesForRole(role).some((config) => config.type === docType)) {
      return { success: false, error: "That document type isn't used for this account." };
    }
    const invalid = validateDocFile(file);
    if (invalid) return { success: false, error: invalid };
    // The bytes must really be the PDF or photo the type claims.
    const sniffed = await assertUploadContent(file).then(() => null, (error: Error) => error.message);
    if (sniffed) return { success: false, error: sniffed };
    const mimeType = docMimeType(file) ?? "application/octet-stream";

    const model = role === "supplier" ? db.supplier : db.logisticsPartner;
    const entity = await (model as any).findUnique({ where: { userId: user.id } });
    if (!entity) return { success: false, error: "Profile not found" };

    const docs: VerificationDoc[] = parseVerificationDocs(entity.verificationDocuments);
    const existingIdx = docs.findIndex((d) => d.type === docType && docHasFile(d));
    const lockedStatus = existingIdx >= 0 && ["submitted", "under_review", "approved"].includes(docs[existingIdx].status);
    if (lockedStatus) return { success: false, error: "This document is already with the review team." };

    const folder = role === "supplier" ? "supplier-verifications" : "logistics-verifications";
    const ext = mimeType === "application/pdf" ? "pdf" : mimeType.split("/")[1] === "jpeg" ? "jpg" : mimeType.split("/")[1];
    const filePath = `${folder}/${entity.id}/${docType}/${Date.now()}-${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}.${ext}`;

    // Identity and business documents go to the private bucket when one is set (PRIVATE_STORAGE_BUCKET);
    // either way they are only opened through /api/verification/file (signed, short-lived links).
    const supabase = await getSupabaseServiceClient();
    const { error: uploadError } = await supabase.storage.from(privateBucket() ?? BUCKET).upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: mimeType,
    });
    if (uploadError) return { success: false, error: uploadError.message };

    // Old onboarding rows of this type that never had a file are replaced by the real upload.
    const placeholders = docs.filter((d) => d.type === docType && !docHasFile(d));
    const previous = existingIdx >= 0 ? docs[existingIdx] : placeholders[0];
    const newDoc: VerificationDoc = {
      id: previous?.id ?? `${docType}-${Date.now()}`,
      type: docType,
      label: DOC_TYPE_LABELS[docType],
      fileName: file.name,
      filePath,
      fileSize: file.size,
      mimeType,
      status: "uploaded",
      uploadedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const kept = docs.filter((d, index) => index !== existingIdx && !placeholders.includes(d));
    try {
      await (model as any).update({
        where: { userId: user.id },
        data: { verificationDocuments: [...kept, newDoc] },
      });
    } catch (err) {
      await removePrivateFile(filePath).catch(() => {});
      throw err;
    }

    // Only drop the replaced file once the new record is saved.
    if (existingIdx >= 0) {
      await removePrivateFile(docs[existingIdx].filePath).catch(() => {});
    }

    return { success: true, doc: newDoc };
  } catch (err: any) {
    return { success: false, error: err.message ?? "Upload failed" };
  }
}

export async function deleteVerificationDoc(
  role: "supplier" | "logistics_partner",
  docId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentAppUser({ expectedRole: role });
    if (!user || user.role !== role) return { success: false, error: "Not authenticated" };

    const model = role === "supplier" ? db.supplier : db.logisticsPartner;
    const entity = await (model as any).findUnique({ where: { userId: user.id } });
    if (!entity) return { success: false, error: "Profile not found" };

    const docs: VerificationDoc[] = parseVerificationDocs(entity.verificationDocuments);
    const doc = docs.find((d) => d.id === docId);
    if (!doc) return { success: false, error: "Document not found" };

    if (doc.filePath) await removePrivateFile(doc.filePath).catch(() => {});

    await (model as any).update({
      where: { userId: user.id },
      data: {
        verificationDocuments: docs.filter((d) => d.id !== docId),
      },
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? "Delete failed" };
  }
}

export async function submitVerification(
  role: "supplier" | "logistics_partner",
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentAppUser({ expectedRole: role });
    if (!user || user.role !== role) return { success: false, error: "Not authenticated" };

    const model = role === "supplier" ? db.supplier : db.logisticsPartner;
    const entity = await (model as any).findUnique({ where: { userId: user.id } });
    if (!entity) return { success: false, error: "Profile not found" };

    const docs: VerificationDoc[] = parseVerificationDocs(entity.verificationDocuments);
    const missingRequired = missingRequiredDocs(docTypesForRole(role), docs);
    if (missingRequired.length > 0) {
      return { success: false, error: `Upload ${missingRequired.map((config) => config.label).join(", ")} before sending for review.` };
    }

    const updatedDocs = submitUploadedDocs(docs);

    await (model as any).update({
      where: { userId: user.id },
      data: {
        verificationDocuments: updatedDocs,
        verificationStatus: "pending",
      },
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? "Submit failed" };
  }
}

export async function getVerificationDocs(
  role: "supplier" | "logistics_partner",
): Promise<{ docs: VerificationDoc[]; trustScore: number; verificationStatus: string; badgeTier?: string }> {
  const user = await getCurrentAppUser({ expectedRole: role }).catch(() => null);
  if (!user || user.role !== role) return { docs: [], trustScore: 0, verificationStatus: "unverified" };

  const model = role === "supplier" ? db.supplier : db.logisticsPartner;
  const entity = await (model as any).findUnique({ where: { userId: user.id } });
  if (!entity) return { docs: [], trustScore: 0, verificationStatus: "unverified" };

  const docs: VerificationDoc[] = parseVerificationDocs(entity.verificationDocuments);
  const trustScore = entity.trustScore ?? 0;
  const verificationStatus = entity.verificationStatus ?? "unverified";
  const badgeTier = computeBadgeTier(trustScore, verificationStatus);

  return { docs, trustScore, verificationStatus, badgeTier };
}
