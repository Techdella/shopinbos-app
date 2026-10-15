import { NextRequest } from "next/server";
import { apiError, created } from "@/lib/api/response";
import { checkLeadSignature, WebsiteLeadInput } from "@/lib/website-leads/pure";
import { LeadsNotReady, saveWebsiteLead } from "@/lib/website-leads/service.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/public/website-leads: a form filled on shopinbos.com, sent server to server by the WordPress site.
// Signed: X-Shopinbos-Timestamp (unix seconds) and X-Shopinbos-Signature = hex HMAC-SHA256 of "<timestamp>.<body>"
// with WEBSITE_LEADS_SECRET. Idempotent on the website's lead id.
export async function POST(req: NextRequest) {
  const body = await req.text();
  if (body.length > 20_000) return apiError("BAD_REQUEST", "Too large.", 413);
  const check = checkLeadSignature(process.env.WEBSITE_LEADS_SECRET, req.headers.get("x-shopinbos-timestamp"), req.headers.get("x-shopinbos-signature"), body);
  if (check === "unconfigured") return apiError("UNCONFIGURED", "Website leads are not set up.", 503);
  if (check !== "ok") return apiError("UNAUTHORIZED", check === "stale" ? "Request too old." : "Bad signature.", 401);

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return apiError("BAD_REQUEST", "Send JSON.", 400);
  }
  const parsed = WebsiteLeadInput.safeParse(json);
  if (!parsed.success) return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Check the lead.", 422);
  try {
    const lead = await saveWebsiteLead(parsed.data);
    return created({ id: lead.id });
  } catch (error) {
    if (error instanceof LeadsNotReady) return apiError("NOT_READY", error.message, 503);
    throw error;
  }
}
