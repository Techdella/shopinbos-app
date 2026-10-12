import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { appUrl } from "@/lib/inbox/channels/types";
import { ingestInbound } from "@/lib/inbox/service";
import { normalisePhone } from "@/lib/inbox/pure";
import { bridgeCallXml, emptyXml, formatDuration, incomingCallXml, parseAfricasTalkingVoice, parseBody, sayXml, voicemailXml } from "@/lib/sms/pure";
import { authenticateWebhook } from "@/lib/sms/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Africa's Talking Voice for the store's AT number. The seller pastes this URL (with ?channel= and ?token=) as the
// number's voice callback in the AT dashboard; AT posts every call event to it.
//   inbound, live      → log the call in the inbox; ring the seller's own phone if set, else take a voicemail
//   outbound, live     → click-to-call from the inbox: the seller answered, now dial the customer
//   ?step=recording    → the voicemail recording (Record's callbackUrl)
//   final (isActive=0) → call length, missed or answered, and the recording if it only arrives here
// Recordings are AT-hosted URLs; there is no transcript (AT doesn't transcribe).

function xml(body: string) {
  return new NextResponse(body, { status: 200, headers: { "Content-Type": "application/xml; charset=utf-8" } });
}

async function saveVoicemail(input: { storeId: string; sessionId: string; caller: string; recordingUrl: string; seconds: number }) {
  const externalId = `at:${input.sessionId}:voicemail`;
  const existing = await db.inboxMessage.findFirst({ where: { storeId: input.storeId, externalId }, select: { id: true } });
  if (existing) return false;
  await ingestInbound({
    storeId: input.storeId,
    channel: "voice",
    threadId: input.caller,
    contact: { phone: normalisePhone(input.caller) },
    message: {
      body: input.seconds ? `Voicemail (${formatDuration(input.seconds)}). Play the recording.` : "Voicemail. Play the recording.",
      kind: "voicemail",
      externalId,
      attachments: [{ type: "audio", url: input.recordingUrl, contentType: "audio/mpeg", name: "Voicemail" }],
      meta: { provider: "africastalking", sessionId: input.sessionId },
    },
  });
  return true;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  // Phone calls run on Africa's Talking only (Termii and Sendchamp voice is one-way text-to-speech).
  if (provider !== "africastalking") return new NextResponse("Unknown provider", { status: 404 });
  const raw = await req.text();
  const auth = await authenticateWebhook(req, "voice", "africastalking", raw);
  if (!auth.ok) return auth.response;
  const event = parseAfricasTalkingVoice(parseBody(raw));
  if (!event || !auth.channel) return xml(emptyXml());

  const storeId = auth.channel.row.storeId;
  const step = req.nextUrl.searchParams.get("step");
  const ourNumber = auth.channel.row.externalId;
  const callbackUrl = (name: string) => {
    const url = new URL(`${appUrl()}${req.nextUrl.pathname}`);
    for (const [key, value] of req.nextUrl.searchParams) if (key !== "step") url.searchParams.set(key, value);
    url.searchParams.set("step", name);
    return url.toString();
  };

  // The customer is whoever isn't the store's number.
  const caller = normalisePhone(event.direction === "inbound" ? event.callerNumber : event.destinationNumber) ?? (event.direction === "inbound" ? event.callerNumber : event.destinationNumber) ?? "Unknown caller";
  const logged = await db.inboxMessage.findFirst({ where: { storeId, externalId: `at:${event.sessionId}` } });

  if (step === "recording") {
    if (event.recordingUrl && event.direction === "inbound") {
      await saveVoicemail({ storeId, sessionId: event.sessionId, caller, recordingUrl: event.recordingUrl, seconds: event.durationSeconds });
      if (logged) await db.inboxMessage.update({ where: { id: logged.id }, data: { body: "Missed call, left a voicemail" } });
    }
    return xml(emptyXml());
  }

  if (event.direction === "outbound") {
    // Click-to-call. The note the inbox wrote when the call started holds the customer's number.
    const note = await db.inboxMessage.findFirst({ where: { storeId, externalId: `at:${event.sessionId}`, direction: "note" } });
    let customer = normalisePhone(((note?.meta ?? {}) as { customer?: unknown }).customer as string | undefined);
    if (!customer && event.clientRequestId) {
      // We also tag each call with the conversation id, in case AT didn't return a session id when it started.
      const conversation = await db.inboxConversation.findFirst({ where: { id: event.clientRequestId, storeId }, select: { contactPhone: true, externalThreadId: true } });
      customer = normalisePhone(conversation?.contactPhone ?? conversation?.externalThreadId);
    }
    if (event.active) {
      if (!customer) return xml(sayXml("We could not find the customer's number for this call. Goodbye."));
      return xml(bridgeCallXml(customer));
    }
    if (note) {
      const answered = event.dialDurationSeconds > 0;
      await db.inboxMessage.update({ where: { id: note.id }, data: { body: answered ? `Outgoing call to ${customer ?? "customer"}, ${formatDuration(event.dialDurationSeconds)}` : `Outgoing call to ${customer ?? "customer"}, not answered${event.hangupCause ? ` (${event.hangupCause.toLowerCase().replace(/_/g, " ")})` : ""}` } });
    }
    return xml(emptyXml());
  }

  const settings = await db.inboxSettings.findUnique({ where: { storeId }, select: { forwardCallsTo: true } });
  const forwardTo = normalisePhone(settings?.forwardCallsTo);

  if (event.active) {
    if (!logged) {
      await ingestInbound({
        storeId,
        channel: "voice",
        threadId: caller,
        contact: { phone: normalisePhone(event.callerNumber) },
        message: { body: "Incoming call", kind: "call", externalId: `at:${event.sessionId}`, meta: { provider: "africastalking", sessionId: event.sessionId, from: event.callerNumber, to: ourNumber, forwardedTo: forwardTo } },
      });
    }
    const store = await db.store.findUnique({ where: { id: storeId }, select: { name: true } });
    const storeName = store?.name ?? "our shop";
    // Don't ring the seller's phone with a call from their own phone.
    const forward = forwardTo && forwardTo !== normalisePhone(event.callerNumber) ? forwardTo : null;
    return xml(forward ? incomingCallXml({ storeName, forwardTo: forward, callbackUrl: callbackUrl("recording") }) : voicemailXml({ storeName, callbackUrl: callbackUrl("recording") }));
  }

  // The call ended: say what happened.
  if (event.recordingUrl && !forwardTo) {
    await saveVoicemail({ storeId, sessionId: event.sessionId, caller, recordingUrl: event.recordingUrl, seconds: event.durationSeconds });
  }
  if (logged) {
    const voicemail = await db.inboxMessage.findFirst({ where: { storeId, externalId: `at:${event.sessionId}:voicemail` }, select: { id: true } });
    const body = event.dialDurationSeconds > 0
      ? `Answered call, ${formatDuration(event.dialDurationSeconds)}`
      : voicemail
        ? "Missed call, left a voicemail"
        : forwardTo
          ? "Missed call (your phone didn't answer)"
          : "Missed call, no voicemail";
    await db.inboxMessage.update({ where: { id: logged.id }, data: { body } });
  }
  return xml(emptyXml());
}
