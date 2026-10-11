import { NextRequest, NextResponse } from "next/server";
import { findChannelByAccount, updateMessageStatus } from "@/lib/inbox/service";
import { normalisePhone, verifyTwilioSignature } from "@/lib/inbox/pure";
import { formParams, signedUrls } from "@/lib/inbox/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Twilio message status callbacks for SMS we sent (set as StatusCallback on each send).

const STATUS: Record<string, "sent" | "delivered" | "read" | "failed"> = { sent: "sent", delivered: "delivered", read: "read", undelivered: "failed", failed: "failed" };

export async function POST(req: NextRequest) {
  const params = await formParams(req);
  const channel = await findChannelByAccount("sms", normalisePhone(params.From) ?? params.From ?? "");
  if (!channel) return new NextResponse(null, { status: 204 });
  const signature = req.headers.get("x-twilio-signature");
  if (!signedUrls(req).some((url) => verifyTwilioSignature(channel.credentials.authToken, url, params, signature))) {
    return new NextResponse("Invalid signature", { status: 403 });
  }
  const status = STATUS[params.MessageStatus ?? ""];
  if (status && params.MessageSid) {
    await updateMessageStatus(params.MessageSid, status, params.ErrorCode ? `Twilio error ${params.ErrorCode}` : null);
  }
  return new NextResponse(null, { status: 204 });
}
