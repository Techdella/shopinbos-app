import { NextRequest, NextResponse } from "next/server";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { listRegistrations, registrationEnabled, registrationPrice, startBusinessRegistration } from "@/lib/business-registration/service.server";
import { formFiles, formText, registrationErrorResponse, registrationOwner, unauthorized } from "@/lib/business-registration/route-helpers";
import { REGISTRATION_FILES } from "@shared/business-registration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Registering a business name with CAC (src/lib/business-registration):
//   GET  → { data: { enabled, priceNgn, registrations } }
//   POST multipart (the RegistrationForm fields + passport, signature, meansOfId) → { data: { authorizationUrl } }
//        after our checks, CAC's name check and CAC's pre-check; errors carry { fields } for the form.

export async function GET() {
  const owner = await registrationOwner();
  if (!owner) return unauthorized();
  return NextResponse.json({ data: { enabled: await registrationEnabled(), priceNgn: await registrationPrice(), registrations: await listRegistrations(owner.id) } });
}

export async function POST(req: NextRequest) {
  const owner = await registrationOwner();
  if (!owner) return unauthorized();
  if (!(await checkRateLimitShared(rateLimitKey("business-registration", owner.id), { maxRequests: 5, windowMs: 10 * 60_000 })).allowed) {
    return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many tries. Wait a few minutes and try again." } }, { status: 429 });
  }
  const data = await req.formData().catch(() => null);
  if (!data) return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Fill in the form and add the pictures." } }, { status: 400 });
  try {
    const callback = new URL("/api/billing/business-registration/callback", req.nextUrl.origin);
    callback.searchParams.set("role", owner.role);
    const checkout = await startBusinessRegistration({ user: owner, form: formText(data), files: formFiles(data, REGISTRATION_FILES), callbackUrl: callback.toString() });
    return NextResponse.json({ data: checkout });
  } catch (error) {
    return registrationErrorResponse(error);
  }
}
