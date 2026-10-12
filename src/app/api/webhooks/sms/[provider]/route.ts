import { NextRequest, NextResponse } from "next/server";
import { ingestInbound, updateMessageStatus } from "@/lib/inbox/service";
import { smsProvider } from "@/lib/sms";
import { isSmsProvider, parseBody } from "@/lib/sms/pure";
import { authenticateWebhook } from "@/lib/sms/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SMS callbacks from Termii, Africa's Talking and Sendchamp: customers' replies (two-way numbers and shortcodes)
// and delivery reports for messages we sent. One URL per provider; who it's for is in ?channel= and ?token=
// (see src/lib/sms/webhook.ts). Always answers 200 once authenticated, so providers don't retry forever.

export async function POST(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: key } = await params;
  if (!isSmsProvider(key)) return new NextResponse("Unknown provider", { status: 404 });
  const provider = smsProvider(key)!;
  const raw = await req.text();
  const auth = await authenticateWebhook(req, "sms", key, raw);
  if (!auth.ok) return auth.response;
  const body = parseBody(raw);

  const inbound = auth.channel ? provider.parseInbound(body) : null;
  if (inbound && auth.channel) {
    await ingestInbound({
      storeId: auth.channel.row.storeId,
      channel: "sms",
      threadId: inbound.phone ?? inbound.from,
      contact: { phone: inbound.phone },
      message: { body: inbound.text, externalId: inbound.externalId ? `${key}:${inbound.externalId}` : null, createdAt: inbound.timestamp, meta: { provider: key, to: inbound.to } },
    });
    return new NextResponse("OK", { status: 200 });
  }

  const status = provider.parseStatus(body);
  if (status) await updateMessageStatus(status.externalId, status.status, status.error, auth.channel?.row.storeId);
  return new NextResponse("OK", { status: 200 });
}
