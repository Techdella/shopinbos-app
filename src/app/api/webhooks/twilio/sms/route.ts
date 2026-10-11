import { NextRequest, NextResponse } from "next/server";
import { findChannelByAccount, ingestInbound } from "@/lib/inbox/service";
import { emptyTwiml, normalisePhone, parseTwilioSms, verifyTwilioSignature } from "@/lib/inbox/pure";
import { formParams, signedUrls, twiml } from "@/lib/inbox/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Twilio Messaging webhook ("A message comes in" on the number). Connecting SMS sets this URL on the number.
// Every request is checked against X-Twilio-Signature with the store's own Auth Token.

export async function POST(req: NextRequest) {
  const params = await formParams(req);
  const message = parseTwilioSms(params);
  if (!message) return new NextResponse("Bad request", { status: 400 });

  const channel = await findChannelByAccount("sms", normalisePhone(params.To) ?? params.To);
  if (!channel) return twiml(emptyTwiml());
  const signature = req.headers.get("x-twilio-signature");
  if (!signedUrls(req).some((url) => verifyTwilioSignature(channel.credentials.authToken, url, params, signature))) {
    return new NextResponse("Invalid signature", { status: 403 });
  }

  await ingestInbound({
    storeId: channel.row.storeId,
    channel: "sms",
    threadId: message.threadId,
    contact: { phone: message.contactPhone },
    message: { body: message.text, externalId: message.externalId, attachments: message.attachments },
  });
  return twiml(emptyTwiml());
}
