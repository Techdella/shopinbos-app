import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/server-auth";
import { registrationCertificate } from "@/lib/business-registration/service.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The CAC certificate for the signed-in owner's approved business name registration (fetched from CAC each time).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentAppUser();
  if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in first" } }, { status: 401 });
  const { id } = await params;
  const certificate = await registrationCertificate(user.id, id);
  if (!certificate) return NextResponse.json({ error: { code: "NOT_FOUND", message: "The certificate isn't available yet. Try again later." } }, { status: 404 });
  return new NextResponse(new Uint8Array(certificate.pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${certificate.name}"`, "Cache-Control": "private, no-store" },
  });
}
