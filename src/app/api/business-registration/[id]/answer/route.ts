import { NextRequest, NextResponse } from "next/server";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { answerRegistrationQuery, publicRegistration } from "@/lib/business-registration/service.server";
import { formFiles, formText, registrationErrorResponse, registrationOwner, unauthorized } from "@/lib/business-registration/route-helpers";
import { REGISTRATION_FILES } from "@shared/business-registration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Answers CAC's queries on the owner's application: multipart with the changed fields and any new pictures
// (passport, signature, meansOfId, supportingDoc). Only what changed goes back to CAC.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await registrationOwner();
  if (!owner) return unauthorized();
  if (!(await checkRateLimitShared(rateLimitKey("business-registration-answer", owner.id), { maxRequests: 5, windowMs: 10 * 60_000 })).allowed) {
    return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many tries. Wait a few minutes and try again." } }, { status: 429 });
  }
  const { id } = await params;
  const data = await req.formData().catch(() => null);
  if (!data) return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Make the changes CAC asked for." } }, { status: 400 });
  try {
    const row = await answerRegistrationQuery({ userId: owner.id, id, form: formText(data), files: formFiles(data, [...REGISTRATION_FILES, "supportingDoc"] as const) });
    return NextResponse.json({ data: publicRegistration(row) });
  } catch (error) {
    return registrationErrorResponse(error);
  }
}
