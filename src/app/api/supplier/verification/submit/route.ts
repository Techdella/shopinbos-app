import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { withSupplier } from "@/lib/auth/middleware";
import type { AuthUser } from "@/lib/auth/types";
import { db } from "@/lib/db/client";
import { refreshSupplierVerification } from "@/lib/kyc/supplier.server";
import { normalizeVerificationDocs, submitUploadedDocs } from "@shared/verification-docs";
import { identitySent } from "@shared/supplier-onboarding";

// "Send for review" (Verification page, phone app). What a supplier needs is their ID photo and selfie (onboarding's
// ID screens); other documents are optional and go along when uploaded. Verified at once when the ID and selfie are
// approved, else pending for the team (src/lib/kyc/supplier.server.ts refreshSupplierVerification).
export const POST = withSupplier(async (_req: NextRequest, { user }: { user: AuthUser }) => {
  const supplier = await db.supplier.findUnique({ where: { userId: user.id }, select: { id: true, verificationDocuments: true, onboardingState: true } });
  if (!supplier) return NextResponse.json({ success: false, error: "Profile not found" }, { status: 400 });
  const docs = normalizeVerificationDocs(supplier.verificationDocuments);
  if (!identitySent(docs)) {
    return NextResponse.json({ success: false, error: "Snap a photo of your ID and take your selfie first (Set up › Your ID)." }, { status: 400 });
  }
  const now = new Date().toISOString();
  const state = supplier.onboardingState && typeof supplier.onboardingState === "object" && !Array.isArray(supplier.onboardingState) ? (supplier.onboardingState as Record<string, unknown>) : {};
  await db.supplier.update({
    where: { id: supplier.id },
    data: {
      verificationDocuments: submitUploadedDocs(docs, now) as unknown as Prisma.InputJsonValue,
      onboardingState: { ...state, completed: true, submittedAt: now, updatedAt: now } as Prisma.InputJsonValue,
    },
  });
  await refreshSupplierVerification(supplier.id);
  return NextResponse.json({ success: true });
});
