import { NextRequest, NextResponse } from "next/server";
import { resellRedirect } from "@/lib/resell/service.server";

export const dynamic = "force-dynamic";

// Link previews (WhatsApp, Facebook, Slack…) fetch the link too; don't count those as taps.
const PREVIEW_BOTS = /bot|crawler|spider|facebookexternalhit|whatsapp|slackbot|telegrambot|twitterbot|linkedinbot|discordbot|preview/i;

// GET /rs/CODE: a reseller's link (pilot "resell", shared/resell.ts). Counts the tap and sends the buyer to the product
// on its shop with ?rs=CODE; the storefront remembers the code for 7 days and checkout sends it with the order, so the
// sale is credited to the reseller (the shop owes the commission). Unknown or switched-off links go to the app's home
// page (or the shop's front page). /r/CODE is Refer & earn, not this.
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const target = await resellRedirect((await params).code, !PREVIEW_BOTS.test(req.headers.get("user-agent") ?? ""));
  const response = NextResponse.redirect(target ?? new URL("/", req.url), 302);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
