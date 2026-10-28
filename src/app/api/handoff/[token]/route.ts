import { NextRequest } from "next/server";
import { apiError } from "@/lib/api/response";
import { lookupHandoff, submitHandoff } from "@/lib/kyc/handoff.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Do it on your phone" (/verify/phone/[token]): no sign-in, the signed 20-minute token is the credential. POST runs
// the selfie or ID photo through the same step as the signed-in routes (src/lib/kyc/handoff.server.ts).
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const found = await lookupHandoff((await params).token);
  if (!found.ok) {
    if (found.reason === "expired") return apiError("EXPIRED", "This link has expired. Scan the new code on your computer.", 410);
    if (found.reason === "unavailable") return apiError("UNAVAILABLE", "We can't check IDs right now. Try again later.", 503);
    return apiError("NOT_FOUND", "This link doesn't work. Scan the code on your computer again.", 404);
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  return submitHandoff(found.handoff, body && typeof body === "object" && !Array.isArray(body) ? body : {});
}
