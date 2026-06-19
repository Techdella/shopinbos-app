import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import type { AuthUser } from "@/lib/auth/types";
import type { VerificationDoc } from "@/app/actions/verification";
import { revalidatePath } from "next/cache";

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
    documents: (supplier.verificationDocuments as VerificationDoc[]) ?? [],
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

  const docs: VerificationDoc[] = (supplier.verificationDocuments as VerificationDoc[]) ?? [];
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
    data: { verificationDocuments: docs },
  });

  revalidatePath(`/admin/suppliers/${params.id}`);
  revalidatePath("/admin/suppliers");

  return NextResponse.json({ success: true, document: docs[docIndex] });
});
