import { NextRequest, NextResponse } from "next/server";
import { recordCampaignClick } from "@/lib/campaigns/send";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const url = req.nextUrl.searchParams.get("u") ?? "";
  const destination = await recordCampaignClick(token, url).catch(() => null);
  if (!destination) {
    return new NextResponse("This link is no longer available.", { status: 404, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.redirect(destination, 302);
}
