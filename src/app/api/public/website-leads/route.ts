import { NextRequest, after } from "next/server";
import { apiError, created } from "@/lib/api/response";
import { checkLeadSignature, WebsiteLeadInput } from "@/lib/website-leads/pure";
import { LeadsNotReady, saveWebsiteLead } from "@/lib/website-leads/service.server";
import { enrolLeads, matchLeadsToExistingUsers, runDueSteps } from "@/lib/lead-growth/service.server";
import { trackServerEvent } from "@/lib/platform-analytics/track.server";
import { conversationFromLead } from "@/lib/support/service.server";

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
    // After the reply: put the lead into any active automation and send a "welcome now" step straight away,
    // open an inbox conversation for a question, and tell the analytics tools a lead came in. Errors here never fail the website's post.
    after(async () => {
      await matchLeadsToExistingUsers({ leadId: lead.id })
        .then(() => enrolLeads({ leadId: lead.id }))
        .then(() => runDueSteps(Date.now() + 20_000)).catch((error) => console.warn("[website leads] automation", error));
      // A question in the form (contact form) goes to Admin › Inbox to be answered.
      await conversationFromLead(lead.id).catch((error) => console.warn("[website leads] inbox", error));
      const utm = parsed.data.payload;
      await trackServerEvent({
        event: "lead_captured",
        distinctId: `lead:${lead.id}`,
        insertId: `lead-${lead.id}`,
        properties: { kind: parsed.data.kind, source: parsed.data.source || null, utm_source: typeof utm.utm_source === "string" ? utm.utm_source : null, utm_medium: typeof utm.utm_medium === "string" ? utm.utm_medium : null, utm_campaign: typeof utm.utm_campaign === "string" ? utm.utm_campaign : null },
      });
    });
    return created({ id: lead.id });
  } catch (error) {
    if (error instanceof LeadsNotReady) return apiError("NOT_READY", error.message, 503);
    throw error;
  }
}
