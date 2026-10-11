import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { appUrl } from "@/lib/inbox/channels/types";
import { findChannelByAccount, ingestInbound } from "@/lib/inbox/service";
import { bridgeCallTwiml, emptyTwiml, escapeXml, incomingCallTwiml, normalisePhone, verifyTwilioSignature, voicemailTwiml } from "@/lib/inbox/pure";
import { formParams, signedUrls, twiml } from "@/lib/inbox/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Twilio Voice for the store's number. Connecting "Phone calls" points the number here (?step=incoming).
//   incoming   → log the call in the inbox, ring the seller's own phone if set, else voicemail
//   dial       → the seller didn't pick up: voicemail; or they did: record the call length
//   recording  → the voicemail recording (audio is fetched through /api/app/inbox/media with the store's credentials)
//   transcript → Twilio's transcript of the voicemail
//   status     → final call status and duration
//   bridge     → click-to-call from the inbox: the seller answered, now ring the customer
// Every request is checked against X-Twilio-Signature with the store's Auth Token.

function step(req: NextRequest) {
  return req.nextUrl.searchParams.get("step") ?? "incoming";
}

function stepUrl(name: string, extra: Record<string, string> = {}) {
  const url = new URL(`${appUrl()}/api/webhooks/twilio/voice`);
  url.searchParams.set("step", name);
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
  return url.toString();
}

async function callMessage(storeId: string, callSid: string) {
  return db.inboxMessage.findFirst({ where: { storeId, externalId: callSid } });
}

function duration(seconds: string | undefined) {
  const total = Number(seconds ?? 0) || 0;
  return total >= 60 ? `${Math.floor(total / 60)}m ${total % 60}s` : `${total}s`;
}

export async function POST(req: NextRequest) {
  const params = await formParams(req);
  const current = step(req);
  // Calls we start (click-to-call) come from the store's number; calls customers make go to it.
  const ours = current === "bridge" || current === "bridge-done" ? params.From : params.To;
  let channel = await findChannelByAccount("voice", normalisePhone(ours) ?? ours ?? "");
  if (!channel && current === "transcript" && params.CallSid) {
    // Transcription callbacks don't always repeat To; find the store through the voicemail we saved.
    const vm = await db.inboxMessage.findFirst({ where: { externalId: `${params.CallSid}:voicemail` }, select: { storeId: true } });
    const row = vm ? await db.inboxChannel.findUnique({ where: { storeId_channel: { storeId: vm.storeId, channel: "voice" } } }) : null;
    if (row?.externalId) channel = await findChannelByAccount("voice", row.externalId);
  }
  if (!channel) return twiml(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>This number is not taking calls right now.</Say><Hangup/></Response>`);
  const signature = req.headers.get("x-twilio-signature");
  if (!signedUrls(req).some((url) => verifyTwilioSignature(channel.credentials.authToken, url, params, signature))) {
    return new NextResponse("Invalid signature", { status: 403 });
  }

  const storeId = channel.row.storeId;
  const callSid = params.CallSid ?? "";
  const caller = normalisePhone(params.From) ?? params.From ?? "Unknown caller";

  if (current === "bridge") {
    const customer = normalisePhone(req.nextUrl.searchParams.get("to"));
    if (!customer) return twiml(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>We could not find that number.</Say><Hangup/></Response>`);
    return twiml(bridgeCallTwiml({ customer, callerId: channel.credentials.phoneNumber, statusUrl: stepUrl("bridge-done", { conversation: req.nextUrl.searchParams.get("conversation") ?? "" }) }));
  }

  if (current === "bridge-done") {
    const conversationId = req.nextUrl.searchParams.get("conversation");
    const outbound = callSid ? await db.inboxMessage.findFirst({ where: { storeId, externalId: callSid } }) : null;
    if (outbound) {
      const answered = params.DialCallStatus === "completed";
      await db.inboxMessage.update({ where: { id: outbound.id }, data: { body: answered ? `Outgoing call, ${duration(params.DialCallDuration)}` : `Outgoing call, not answered (${params.DialCallStatus ?? "no answer"})` } });
    } else if (conversationId) {
      console.warn("[webhooks/twilio/voice] bridge finished without a logged call", conversationId);
    }
    return twiml(emptyTwiml());
  }

  const store = await db.store.findUnique({ where: { id: storeId }, select: { name: true } });
  const storeName = store?.name ?? "our shop";
  const voicemail = { storeName, recordingUrl: stepUrl("recording"), transcriptUrl: stepUrl("transcript") };

  if (current === "incoming") {
    await ingestInbound({
      storeId,
      channel: "voice",
      threadId: caller,
      contact: { phone: normalisePhone(params.From), name: params.CallerName || null },
      message: { body: "Incoming call", kind: "call", externalId: callSid || null, meta: { callSid, from: params.From, city: params.FromCity ?? null } },
    });
    const settings = await db.inboxSettings.findUnique({ where: { storeId }, select: { forwardCallsTo: true } });
    return twiml(incomingCallTwiml({ ...voicemail, forwardTo: normalisePhone(settings?.forwardCallsTo), callerId: params.From, dialActionUrl: stepUrl("dial") }));
  }

  const logged = callSid ? await callMessage(storeId, callSid) : null;

  if (current === "dial") {
    if (params.DialCallStatus === "completed") {
      if (logged) await db.inboxMessage.update({ where: { id: logged.id }, data: { body: `Answered call, ${duration(params.DialCallDuration)}` } });
      return twiml(emptyTwiml());
    }
    if (logged) await db.inboxMessage.update({ where: { id: logged.id }, data: { body: "Missed call" } });
    return twiml(voicemailTwiml(voicemail));
  }

  if (current === "recording") {
    if (params.RecordingUrl) {
      await ingestInbound({
        storeId,
        channel: "voice",
        threadId: caller,
        contact: { phone: normalisePhone(params.From) },
        message: {
          body: `Voicemail (${duration(params.RecordingDuration)}). Transcript on its way.`,
          kind: "voicemail",
          externalId: `${callSid}:voicemail`,
          attachments: [{ type: "audio", url: `${params.RecordingUrl}.mp3`, contentType: "audio/mpeg", name: "Voicemail" }],
          meta: { callSid, recordingSid: params.RecordingSid ?? null },
        },
      });
      if (logged) await db.inboxMessage.update({ where: { id: logged.id }, data: { body: "Missed call, left a voicemail" } });
    }
    return twiml(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>Thank you. ${escapeXml(storeName)} will call you back.</Say><Hangup/></Response>`);
  }

  if (current === "transcript") {
    const vm = await db.inboxMessage.findFirst({ where: { storeId, externalId: `${callSid}:voicemail` } });
    if (vm) {
      const text = params.TranscriptionStatus === "completed" && params.TranscriptionText ? params.TranscriptionText : "We couldn't transcribe this voicemail. Play the recording.";
      await db.inboxMessage.update({ where: { id: vm.id }, data: { body: `Voicemail: ${text}` } });
      await db.inboxConversation.update({ where: { id: vm.conversationId }, data: { lastMessagePreview: `Voicemail: ${text}`.slice(0, 140) } });
    }
    return new NextResponse(null, { status: 204 });
  }

  if (current === "status") {
    if (logged && logged.body === "Incoming call") {
      // Answered calls were already relabelled at the "dial" step, so a call still marked "Incoming call" was missed.
      await db.inboxMessage.update({ where: { id: logged.id }, data: { body: "Missed call, no voicemail" } });
    }
    return new NextResponse(null, { status: 204 });
  }

  return twiml(emptyTwiml());
}
