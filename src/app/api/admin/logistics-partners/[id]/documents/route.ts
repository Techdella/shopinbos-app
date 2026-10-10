import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth/types";
import { parseVerificationDocs, type VerificationDoc } from "@/lib/verification-utils";
import { revalidatePath } from "next/cache";

export const GET = withAdmin(async (_req: NextRequest, { user, params }: { user: AuthUser; params: { id: string } }) => {
  const partner = await db.logisticsPartner.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      displayName: true,
      companyName: true,
      country: true,
      city: true,
      verificationStatus: true,
      reliabilityScore: true,
      verificationDocuments: true,
    },
  });

  if (!partner) {
    return NextResponse.json({ error: "Logistics partner not found" }, { status: 404 });
  }

  return NextResponse.json({
    partner,
    documents: parseVerificationDocs(partner.verificationDocuments),
  });
});

export const PATCH = withAdmin(async (req: NextRequest, { user, params }: { user: AuthUser; params: { id: string } }) => {
  const { docId, action, rejectionReason } = await req.json();

  if (!docId || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "Invalid request: docId and action (approve|reject) required" }, { status: 400 });
  }

  const partner = await db.logisticsPartner.findUnique({
    where: { id: params.id },
    select: { id: true, verificationDocuments: true },
  });

  if (!partner) {
    return NextResponse.json({ error: "Logistics partner not found" }, { status: 404 });
  }

  const docs: VerificationDoc[] = parseVerificationDocs(partner.verificationDocuments);
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

  await db.logisticsPartner.update({
    where: { id: params.id },
    data: { verificationDocuments: docs as unknown as Prisma.InputJsonValue },
  });

  revalidatePath(`/admin/logistics-partners/${params.id}`);
  revalidatePath("/admin/logistics-partners");

  return NextResponse.json({ success: true, document: docs[docIndex] });
});
