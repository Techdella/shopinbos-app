import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth/types";
import { parseVerificationDocs, type VerificationDoc } from "@/lib/verification-utils";
import { revalidatePath } from "next/cache";
import { refreshSupplierVerification } from "@/lib/kyc/supplier.server";

export const GET = withAdmin(async (_req: NextRequest, { user, params }: { user: AuthUser; params: { id: string } }) => {
  const supplier = await db.supplier.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      displayName: true,
      businessName: true,
      country: true,
      city: true,
      verificationStatus: true,
      trustScore: true,
      verificationDocuments: true,
    },
  });

  if (!supplier) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }

  return NextResponse.json({
    supplier,
    documents: parseVerificationDocs(supplier.verificationDocuments),
  });
});

export const PATCH = withAdmin(async (req: NextRequest, { user, params }: { user: AuthUser; params: { id: string } }) => {
  const { docId, action, rejectionReason } = await req.json();

  if (!docId || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "Invalid request: docId and action (approve|reject) required" }, { status: 400 });
  }

  const supplier = await db.supplier.findUnique({
    where: { id: params.id },
    select: { id: true, verificationDocuments: true },
  });

  if (!supplier) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }

  const docs: VerificationDoc[] = parseVerificationDocs(supplier.verificationDocuments);
  const docIndex = docs.findIndex((d) => d.id === docId);

  if (docIndex === -1) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  docs[docIndex] = {
    ...docs[docIndex],
    status: action === "approve" ? "approved" : "rejected",
    ...(action === "reject" && rejectionReason ? { rejectionReason } : {}),
    updatedAt: new Date().toISOString(),
  };

  await db.supplier.update({
    where: { id: params.id },
    data: { verificationDocuments: docs as unknown as Prisma.InputJsonValue },
  });
  // Approving the ID photo and selfie of a supplier who sent onboarding lists them to shops ("Verified Individual").
  await refreshSupplierVerification(params.id);

  revalidatePath(`/admin/suppliers/${params.id}`);
  revalidatePath("/admin/suppliers");

  return NextResponse.json({ success: true, document: docs[docIndex] });
});
