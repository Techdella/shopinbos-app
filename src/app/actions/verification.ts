"use server";

import { db } from "@/lib/db/client";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getCurrentAppUser } from "@/lib/server-auth";

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET ?? "shopinbos-media";

export type DocType =
  | "cac"
  | "tax"
  | "utility"
  | "identity"
  | "product-images"
  | "insurance"
  | "fleet"
  | "other";

export interface VerificationDoc {
  id: string;
  type: DocType;
  label: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  status: "draft" | "uploaded" | "submitted" | "under_review" | "approved" | "rejected";
  uploadedAt: string;
  updatedAt: string;
  rejectionReason?: string;
}

export async function uploadVerificationDoc(
  role: "supplier" | "logistics_partner",
  docType: DocType,
  formData: FormData,
): Promise<{ success: boolean; doc?: VerificationDoc; error?: string }> {
  try {
    const user = await getCurrentAppUser({ role });
    if (!user) return { success: false, error: "Not authenticated" };

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

    const docs: VerificationDoc[] = (entity.verificationDocuments as VerificationDoc[]) ?? [];
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
    const user = await getCurrentAppUser({ role });
    if (!user) return { success: false, error: "Not authenticated" };

    const model = role === "supplier" ? db.supplier : db.logisticsPartner;
    const entity = await (model as any).findUnique({ where: { userId: user.id } });
    if (!entity) return { success: false, error: "Profile not found" };

    const docs: VerificationDoc[] = (entity.verificationDocuments as VerificationDoc[]) ?? [];
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
    const user = await getCurrentAppUser({ role });
    if (!user) return { success: false, error: "Not authenticated" };

    const model = role === "supplier" ? db.supplier : db.logisticsPartner;
    const entity = await (model as any).findUnique({ where: { userId: user.id } });
    if (!entity) return { success: false, error: "Profile not found" };

    const docs: VerificationDoc[] = (entity.verificationDocuments as VerificationDoc[]) ?? [];
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
  const user = await getCurrentAppUser({ role }).catch(() => null);
  if (!user) return { docs: [], trustScore: 0, verificationStatus: "unverified" };

  const model = role === "supplier" ? db.supplier : db.logisticsPartner;
  const entity = await (model as any).findUnique({ where: { userId: user.id } });
  if (!entity) return { docs: [], trustScore: 0, verificationStatus: "unverified" };

  const docs: VerificationDoc[] = (entity.verificationDocuments as VerificationDoc[]) ?? [];
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

export const supplierDocTypes: { type: DocType; label: string; required: boolean; hint: string }[] = [
  { type: "cac", label: "Business registration or CAC certificate", required: true, hint: "BN or RC document accepted" },
  { type: "identity", label: "Owner identity document (NIN)", required: true, hint: "NIN slip or NIN-backed ID" },
  { type: "product-images", label: "Product images", required: true, hint: "At least 5 images showing your products" },
  { type: "tax", label: "Tax Identification Number (TIN)", required: false, hint: "FIRS document — boosts trust score" },
  { type: "utility", label: "Utility bill", required: false, hint: "For address verification — boosts trust score" },
  { type: "insurance", label: "Insurance certificate", required: false, hint: "Public liability — unlocks badges" },
];

export const logisticsDocTypes: { type: DocType; label: string; required: boolean; hint: string }[] = [
  { type: "cac", label: "Business registration or CAC certificate", required: true, hint: "BN or RC document accepted" },
  { type: "insurance", label: "Insurance certificate", required: true, hint: "Required for fleet operations" },
  { type: "utility", label: "Utility bill", required: false, hint: "For address verification" },
  { type: "identity", label: "Owner identity document (NIN)", required: false, hint: "NIN slip or NIN-backed ID" },
  { type: "fleet", label: "Fleet / vehicle documents", required: false, hint: "Vehicle registration, road worthiness" },
];

export function computeTrustScore(params: {
  docs: VerificationDoc[];
  productCount: number;
  orderCount: number;
  rating: number;
  responseTime?: string | null;
  disputes?: number;
  deliverySuccessRate?: number;
}): number {
  let score = 0;

  const cacDone = params.docs.some((d) => d.type === "cac" && (d.status === "submitted" || d.status === "approved"));
  if (cacDone) score += 20;

  const taxDone = params.docs.some((d) => d.type === "tax" && (d.status === "submitted" || d.status === "approved"));
  if (taxDone) score += 10;

  const addressDone = params.docs.some((d) => d.type === "utility" && (d.status === "submitted" || d.status === "approved"));
  if (addressDone) score += 10;

  const identityDone = params.docs.some((d) => d.type === "identity" && (d.status === "submitted" || d.status === "approved"));
  if (identityDone) score += 5;

  if (params.productCount > 0) score += Math.min(params.productCount, 10);
  if (params.orderCount > 0) score += Math.min(params.orderCount * 2, 15);
  if (params.rating > 0) score += Math.min(params.rating * 3, 15);
  if (params.responseTime) score += 10;

  if (params.disputes && params.disputes > 0) score -= Math.min(params.disputes * 5, 15);

  if (params.deliverySuccessRate !== undefined && params.deliverySuccessRate > 0) {
    score += Math.min(params.deliverySuccessRate / 5, 20);
  }

  return Math.max(0, Math.min(100, score));
}

export function computeBadgeTier(trustScore: number, verificationStatus: string): string {
  if (verificationStatus !== "verified") return "none";

  if (trustScore >= 80) return "platinum";
  if (trustScore >= 60) return "gold";
  if (trustScore >= 40) return "silver";
  return "bronze";
}

export interface TrustScoreBreakdownItem {
  label: string;
  score: number;
  maxScore: number;
  details: string;
}

export function getTrustScoreBreakdown(params: {
  docs: VerificationDoc[];
  productCount: number;
  orderCount: number;
  rating: number;
  responseTime?: string | null;
  disputes?: number;
  deliverySuccessRate?: number;
}): { items: TrustScoreBreakdownItem[]; total: number; level: string; nextLevel: string; nextLevelAt: number } {
  const items: TrustScoreBreakdownItem[] = [];

  const cacDone = params.docs.some((d) => d.type === "cac" && (d.status === "submitted" || d.status === "approved"));
  items.push({ label: "CAC / Business registration", score: cacDone ? 20 : 0, maxScore: 20, details: cacDone ? "Verified" : "Upload your CAC certificate" });

  const taxDone = params.docs.some((d) => d.type === "tax" && (d.status === "submitted" || d.status === "approved"));
  items.push({ label: "Tax identification", score: taxDone ? 10 : 0, maxScore: 10, details: taxDone ? "Verified" : "Upload TIN document" });

  const addressDone = params.docs.some((d) => d.type === "utility" && (d.status === "submitted" || d.status === "approved"));
  items.push({ label: "Business address verified", score: addressDone ? 10 : 0, maxScore: 10, details: addressDone ? "Verified" : "Upload utility bill" });

  const identityDone = params.docs.some((d) => d.type === "identity" && (d.status === "submitted" || d.status === "approved"));
  items.push({ label: "Identity verified", score: identityDone ? 5 : 0, maxScore: 5, details: identityDone ? "Verified" : "Upload NIN" });

  const productScore = Math.min(params.productCount, 10);
  items.push({ label: "Products listed", score: productScore, maxScore: 10, details: `${params.productCount} product(s) listed` });

  const orderScore = Math.min(params.orderCount * 2, 15);
  items.push({ label: "Orders completed", score: orderScore, maxScore: 15, details: `${params.orderCount} order(s) completed` });

  if (params.rating > 0) {
    const ratingScore = Math.min(params.rating * 3, 15);
    items.push({ label: "Customer ratings", score: ratingScore, maxScore: 15, details: `${params.rating.toFixed(1)} / 5 stars` });
  }

  if (params.responseTime) {
    items.push({ label: "Response time", score: 10, maxScore: 10, details: params.responseTime });
  }

  if (params.deliverySuccessRate !== undefined && params.deliverySuccessRate > 0) {
    const deliveryScore = Math.min(params.deliverySuccessRate / 5, 20);
    items.push({ label: "Delivery success rate", score: Math.round(deliveryScore), maxScore: 20, details: `${params.deliverySuccessRate}% success rate` });
  }

  const disputePenalty = params.disputes ? Math.min(params.disputes * 5, 15) : 0;
  if (disputePenalty > 0) {
    items.push({ label: "Dispute penalty", score: -disputePenalty, maxScore: 0, details: `${params.disputes} dispute(s)` });
  }

  const total = items.reduce((sum, i) => sum + Math.max(0, i.score), 0);
  const clamped = Math.max(0, Math.min(100, total));

  const levels = [
    { min: 80, name: "Platinum Verified", nextAt: 100 },
    { min: 60, name: "Gold Verified", nextAt: 80 },
    { min: 40, name: "Silver Verified", nextAt: 60 },
    { min: 0, name: "Bronze Verified", nextAt: 40 },
  ];

  const currentLevel = levels.find((l) => clamped >= l.min)!;
  const nextLevel = levels.find((l) => clamped < l.min);

  return {
    items,
    total: clamped,
    level: currentLevel.name,
    nextLevel: nextLevel?.name ?? currentLevel.name,
    nextLevelAt: nextLevel?.min ?? clamped,
  };
}
