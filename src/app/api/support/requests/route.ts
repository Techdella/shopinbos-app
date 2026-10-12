import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/rate-limit";
import { looksLikeSpam, publicRequestSchema, splitContact } from "@/lib/support/pure";
import { createPublicRequest, filesProblem } from "@/lib/support/service.server";
import { clientIp, readBody, supportError } from "@/lib/support/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/support/requests: the signed-out "Stuck?" form on login, signup and password reset (multipart or
// JSON: name, contact (email or phone), topic, message, optional file; "website" is the honeypot and
// "startedAt" the time the form opened). Opens a ticket and returns its number.
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  // Per IP: 5 an hour, and a short burst limit so a double-click doesn't count as spam.
  const hourly = checkRateLimit(`support-request:${ip}`, { maxRequests: 5, windowMs: 3_600_000 });
  if (!hourly.allowed) {
    return apiError("RATE_LIMITED", "You've sent a few requests already. We'll reply to those soon, or email support@shopinbos.com.", 429);
  }

  try {
    const body = await readBody(req);
    if (!body) return apiError("BAD_REQUEST", "Fill in the form first.");

    // Bots get a normal-looking answer so they don't learn to dodge the trap.
    if (looksLikeSpam({ honeypot: body.fields.website, startedAt: body.fields.startedAt, message: String(body.fields.message ?? "") })) {
      return NextResponse.json({ data: { number: null, ticket: null } }, { status: 201 });
    }

    const parsed = publicRequestSchema.safeParse(body.fields);
    if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the form and try again.");
    const problem = filesProblem(body.files.slice(0, 1));
    if (problem) return apiError("BAD_REQUEST", problem);

    const { email, phone } = splitContact(parsed.data.contact);
    const perContact = checkRateLimit(`support-request:${email ?? phone}`, { maxRequests: 4, windowMs: 3_600_000 });
    if (!perContact.allowed) return apiError("RATE_LIMITED", "We already have your request. A person will reply soon.", 429);

    const result = await createPublicRequest({
      name: parsed.data.name,
      email,
      phone,
      topic: parsed.data.topic,
      message: parsed.data.message,
      path: parsed.data.path,
      files: body.files.slice(0, 1),
      ip,
      userAgent: req.headers.get("user-agent"),
    });
    return NextResponse.json(
      { data: { number: result.number, ticket: result.number ? `SB-${result.number}` : null, replyBy: email ? "email" : "whatsapp" } },
      { status: 201 },
    );
  } catch (error) {
    return supportError(error);
  }
}
