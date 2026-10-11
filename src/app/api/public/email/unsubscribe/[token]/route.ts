import { NextRequest, NextResponse } from "next/server";
import { unsubscribeCampaignRecipient } from "@/lib/campaigns/send";

// RFC 8058 one-click unsubscribe, triggered by mail clients from the List-Unsubscribe header.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const storeName = await unsubscribeCampaignRecipient(token).catch(() => null);
  if (!storeName) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Unknown unsubscribe link" } }, { status: 404 });
  return NextResponse.json({ data: { unsubscribed: true } });
}
