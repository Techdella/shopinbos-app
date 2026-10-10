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

export function parseVerificationDocs(value: unknown): VerificationDoc[] {
  return Array.isArray(value) ? (value as VerificationDoc[]) : [];
}
