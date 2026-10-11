"use server";

import { db } from "@/lib/db/client";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getCurrentAppUser } from "@/lib/server-auth";
import type { DocType, VerificationDoc } from "@/lib/verification-utils";
import { computeBadgeTier, parseVerificationDocs } from "@/lib/verification-utils";

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET ?? "shopinbos-media";

export async function uploadVerificationDoc(
  role: "supplier" | "logistics_partner",
  docType: DocType,
  formData: FormData,
): Promise<{ success: boolean; doc?: VerificationDoc; error?: string }> {
  try {
    const user = await getCurrentAppUser({ expectedRole: role });
    if (!user || user.role !== role) return { success: false, error: "Not authenticated" };

    const file = formData.get("file") as File;
    if (!file) return { success: false, error: "No file provided" };

    const model = role === "supplier" ? db.supplier : db.logisticsPartner;
    const entity = await (model as any).findUnique({ where: { userId: user.id } });
    if (!entity) return { success: false, error: "Profile not found" };

    const folder = role === "supplier" ? "supplier-verifications" : "logistics-verifications";
    const ext = file.name.split(".").pop() ?? "bin";
    const filePath = `${folder}/${entity.id}/${docType}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const supabase = await getSupabaseServiceClient();
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });
    if (uploadError) return { success: false, error: uploadError.message };

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filePath);

    const docs: VerificationDoc[] = parseVerificationDocs(entity.verificationDocuments);
    const existingIdx = docs.findIndex((d) => d.type === docType);
    const newDoc: VerificationDoc = {
      id: existingIdx >= 0 ? docs[existingIdx].id : `${docType}-${Date.now()}`,
      type: docType,
      label: docLabel(docType),
      fileName: file.name,
      filePath,
      fileSize: file.size,
      mimeType: file.type,
      status: "uploaded",
      uploadedAt: existingIdx >= 0 ? docs[existingIdx].uploadedAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      const oldDoc = docs[existingIdx];
      if (oldDoc.filePath) {
        await supabase.storage.from(BUCKET).remove([oldDoc.filePath]).catch(() => {});
      }
      docs[existingIdx] = newDoc;
    } else {
      docs.push(newDoc);
    }

    await (model as any).update({
      where: { userId: user.id },
      data: { verificationDocuments: docs },
    });

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

    if (doc.filePath) {
      const supabase = await getSupabaseServiceClient();
      await supabase.storage.from(BUCKET).remove([doc.filePath]).catch(() => {});
    }

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
    const requiredTypes: DocType[] = role === "supplier"
      ? ["cac", "identity"]
      : ["cac", "insurance"];

    const missingRequired = requiredTypes.filter(
      (t) => !docs.some((d) => d.type === t && (d.status === "uploaded" || d.status === "submitted")),
    );
    if (missingRequired.length > 0) {
      return { success: false, error: `Missing required documents: ${missingRequired.join(", ")}` };
    }

    const updatedDocs = docs.map((d) => ({
      ...d,
      status: d.status === "uploaded" ? "submitted" as const : d.status,
    }));

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

function docLabel(type: DocType): string {
  const labels: Record<DocType, string> = {
    cac: "Business registration / CAC certificate",
    tax: "Tax Identification Number (TIN)",
    utility: "Utility bill (address verification)",
    identity: "Owner identity document (NIN)",
    "product-images": "Product images",
    insurance: "Insurance certificate",
    fleet: "Fleet / vehicle documents",
    other: "Other document",
  };
  return labels[type] ?? type;
}

