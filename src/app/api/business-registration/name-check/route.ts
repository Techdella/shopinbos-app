import { NextRequest, NextResponse } from "next/server";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { checkBusinessName } from "@/lib/business-registration/service.server";
import { registrationErrorResponse, registrationOwner, unauthorized } from "@/lib/business-registration/route-helpers";

export const dynamic = "force-dynamic";

// Is this business name free and within CAC's rules? POST { proposedName, lineOfBusiness } → { data: NameCheck }. Free.
export async function POST(req: NextRequest) {
  const owner = await registrationOwner();
  if (!owner) return unauthorized();
  if (!(await checkRateLimitShared(rateLimitKey("business-name-check", owner.id), { maxRequests: 15, windowMs: 10 * 60_000 })).allowed) {
    return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many checks. Wait a few minutes and try again." } }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as { proposedName?: unknown; lineOfBusiness?: unknown } | null;
  const name = typeof body?.proposedName === "string" ? body.proposedName : "";
  const line = typeof body?.lineOfBusiness === "string" ? body.lineOfBusiness : "";
  try {
    return NextResponse.json({ data: await checkBusinessName(name, line) });
  } catch (error) {
    return registrationErrorResponse(error);
  }
}
