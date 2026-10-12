import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { normalizePhone } from "./segment-rules";
import { optKeyword, optOutIndex, type OptOutLookup, type TextChannel } from "./text-channels";

// SMS and WhatsApp opt-outs. Every marketing text and order message checks these first. A STOP reply comes in
// through the SMS or WhatsApp webhook (handleInboundOptOut), a customer can tap "Stop promotions" on a marketing
// template, Meta can tell us a customer stopped marketing messages (error 131050), or the seller removes a number.

export async function loadOptOuts(storeId: string): Promise<OptOutLookup> {
  const rows = await db.marketingOptOut.findMany({ where: { storeId }, select: { phone: true, channel: true, scope: true } }).catch(() => []);
  return optOutIndex(rows);
}

/** Appends a consent record (sms/whatsapp off or on) to every subscriber with this phone, keeping the history. */
async function noteConsent(storeId: string, phone: string, channel: TextChannel, granted: boolean, source: string) {
  const local = phone.replace(/^\+234/, "0");
  const subscribers = await db.subscriber.findMany({ where: { storeId, OR: [{ phone }, { phone: phone.slice(1) }, { phone: local }] }, select: { id: true, metadata: true } }).catch(() => []);
  for (const subscriber of subscribers) {
    const metadata = subscriber.metadata && typeof subscriber.metadata === "object" && !Array.isArray(subscriber.metadata) ? (subscriber.metadata as Record<string, unknown>) : {};
    const history = Array.isArray(metadata.consent) ? (metadata.consent as Array<Record<string, unknown>>) : [];
    const last = history[history.length - 1] ?? {};
    const next = { email: last.email === true, sms: channel === "sms" ? granted : last.sms === true, whatsapp: channel === "whatsapp" ? granted : last.whatsapp === true, at: new Date().toISOString(), source };
    await db.subscriber
      .update({ where: { id: subscriber.id }, data: { metadata: { ...metadata, consent: [...history.slice(-9), next] } as unknown as Prisma.InputJsonValue } })
      .catch(() => null);
  }
}

export async function recordOptOut(storeId: string, rawPhone: string, channel: TextChannel, input: { scope: "marketing" | "all"; source: string; keyword?: string | null }) {
  const phone = normalizePhone(rawPhone);
  if (!phone) return false;
  const existing = await db.marketingOptOut.findUnique({ where: { storeId_phone_channel: { storeId, phone, channel } }, select: { scope: true } });
  // A full opt-out is never narrowed back to marketing-only.
  const scope = existing?.scope === "all" ? "all" : input.scope;
  await db.marketingOptOut.upsert({
    where: { storeId_phone_channel: { storeId, phone, channel } },
    create: { storeId, phone, channel, scope, source: input.source, keyword: input.keyword ?? null },
    update: { scope, source: input.source, keyword: input.keyword ?? null },
  });
  await noteConsent(storeId, phone, channel, false, input.source);
  return true;
}

/** START, or a fresh opt-in on a form: the number may get texts again. */
export async function clearOptOut(storeId: string, rawPhone: string, channel: TextChannel, source: string, grantConsent = false) {
  const phone = normalizePhone(rawPhone);
  if (!phone) return false;
  const removed = await db.marketingOptOut.deleteMany({ where: { storeId, phone, channel } });
  if (grantConsent) await noteConsent(storeId, phone, channel, true, source);
  return removed.count > 0;
}

export type OptOutOutcome = { handled: false } | { handled: true; action: "stop" | "start"; reply: string };

/**
 * The hook the inbound SMS and WhatsApp webhooks call for every customer message. STOP-type replies opt the
 * number out (SMS: everything from this shop; WhatsApp "Stop promotions": marketing only), START opts back in.
 * Returns the confirmation to send back, which the caller may send; it never throws.
 */
export async function handleInboundOptOut(input: { storeId: string; channel: TextChannel; phone: string | null | undefined; text: string | null | undefined }): Promise<OptOutOutcome> {
  try {
    if (!input.phone) return { handled: false };
    const match = optKeyword(input.text, input.channel);
    if (!match) return { handled: false };
    const store = await db.store.findUnique({ where: { id: input.storeId }, select: { name: true } });
    const name = store?.name ?? "this shop";
    if (match.action === "start") {
      await clearOptOut(input.storeId, input.phone, input.channel, `${input.channel}_keyword`, true);
      return { handled: true, action: "start", reply: `You'll get messages from ${name} again. Reply STOP to opt out.` };
    }
    await recordOptOut(input.storeId, input.phone, input.channel, { scope: match.scope, source: `${input.channel}_keyword`, keyword: match.keyword });
    return {
      handled: true,
      action: "stop",
      reply: match.scope === "marketing" ? `You won't get offers from ${name} on WhatsApp any more. You'll still get updates about your orders.` : `You won't get any more ${input.channel === "sms" ? "SMS" : "WhatsApp"} messages from ${name}. Reply START to opt back in.`,
    };
  } catch (error) {
    console.error("[marketing] opt-out hook failed", error);
    return { handled: false };
  }
}
