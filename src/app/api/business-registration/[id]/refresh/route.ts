import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { publicRegistration, refreshRegistration } from "@/lib/business-registration/service.server";
import { registrationErrorResponse, registrationOwner, unauthorized } from "@/lib/business-registration/route-helpers";

export const dynamic = "force-dynamic";

// "Check with CAC now" on the owner's application (the cron also checks every 30 minutes).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = await registrationOwner();
  if (!owner) return unauthorized();
  if (!(await checkRateLimitShared(rateLimitKey("business-registration-refresh", owner.id), { maxRequests: 6, windowMs: 10 * 60_000 })).allowed) {
    return NextResponse.json({ error: { code: "RATE_LIMITED", message: "We checked a moment ago. Try again in a few minutes." } }, { status: 429 });
  }
  const { id } = await params;
  const row = await db.businessRegistration.findFirst({ where: { id, userId: owner.id } });
  if (!row) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Registration not found." } }, { status: 404 });
  try {
    return NextResponse.json({ data: publicRegistration(await refreshRegistration(row)) });
  } catch (error) {
    return registrationErrorResponse(error);
  }
}
