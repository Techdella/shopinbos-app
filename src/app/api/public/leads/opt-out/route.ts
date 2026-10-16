import { NextRequest, NextResponse } from "next/server";
import { CHANNEL_LABELS } from "@/lib/lead-growth/pure";
import { verifyLeadOptOutToken } from "@/lib/lead-growth/tokens";
import { optOutLead } from "@/lib/lead-growth/service.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The opt-out link at the bottom of every lead campaign message (email, SMS, WhatsApp).
//   GET  shows a confirm button (link scanners in mail apps open links; they must not opt people out);
//   POST opts the lead out of that channel. Email clients' one-click unsubscribe (RFC 8058) posts here too.

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Shopinbos</title>
<style>body{margin:0;font-family:'Space Grotesk','Segoe UI',Helvetica,Arial,sans-serif;background:#FAF7F1;color:#0E2A38;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}
main{max-width:440px;width:100%;background:#fff;border:1px solid rgba(14,42,56,.08);border-radius:18px;padding:28px}h1{font-size:24px;margin:0 0 10px;letter-spacing:-.02em}p{margin:0 0 18px;line-height:1.5;color:#41545E}
button{border:0;border-radius:999px;background:#0E2A38;color:#F4F1EA;font:inherit;font-weight:600;padding:12px 22px;cursor:pointer}</style></head>
<body><main>${body}</main></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t");
  const target = verifyLeadOptOutToken(token);
  if (!target) return page("Link not valid", "<h1>This link isn't valid</h1><p>It may have been cut short. Reply to the message and we'll take you off the list.</p>", 400);
  const channel = CHANNEL_LABELS[target.channel];
  return page(
    "Stop messages",
    `<h1>Stop ${channel} messages?</h1><p>You won't get any more ${channel} messages from Shopinbos about getting started. You can still sign up any time.</p>
<form method="post" action="/api/public/leads/opt-out?t=${encodeURIComponent(token!)}"><button type="submit">Yes, stop ${channel} messages</button></form>`,
  );
}

export async function POST(req: NextRequest) {
  const target = verifyLeadOptOutToken(req.nextUrl.searchParams.get("t"));
  if (!target) return page("Link not valid", "<h1>This link isn't valid</h1><p>Reply to the message and we'll take you off the list.</p>", 400);
  try {
    await optOutLead(target.leadId, target.channel);
  } catch (error) {
    console.error("[lead opt-out]", error);
    return page("Try again", "<h1>That didn't work</h1><p>Please try the link again in a minute.</p>", 503);
  }
  return page("Done", `<h1>Done</h1><p>You won't get any more ${CHANNEL_LABELS[target.channel]} messages from us.</p>`);
}
