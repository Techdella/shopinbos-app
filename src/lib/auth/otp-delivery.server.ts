import "server-only";

import { createHash } from "node:crypto";
import { db } from "@/lib/db/client";
import { sendPlatformSms } from "@/lib/sms";
import { e164 } from "@/lib/sms/pure";
import {
  CODE_CHANNEL_TTL_MS,
  deliveryPlan,
  readWhatsAppSend,
  reportedChannel,
  metaWhatsAppRequest,
  sendchampWhatsAppRequest,
  signInCodeMessage,
  termiiWhatsAppRequest,
  whatsappCodeConfig,
  type CodeChannel,
  type WhatsAppCodeConfig,
} from "./otp-channel";

// Phone sign-in codes: WhatsApp first when asked for and set up, SMS as the fallback (see ./otp-channel.ts for the
// whole path). The send route and the Supabase Send SMS hook may run on different serverless instances, so the
// wanted / used channel per phone is kept in Postgres ("AuthCodeChannel"), with an in-process copy for local dev
// and for before the migration has run (then WhatsApp still works when both run in one process, else SMS).

type Note = { wanted: CodeChannel; used: CodeChannel | null; expiresAt: number };
const memory = new Map<string, Note>();

function keyFor(phone: string) {
  return createHash("sha256").update(e164(phone) ?? phone).digest("hex");
}

function isMissingTable(error: unknown) {
  const record = error as { code?: string; meta?: { code?: string }; message?: string } | null;
  return record?.code === "42P01" || record?.meta?.code === "42P01" || /AuthCodeChannel"? does not exist/i.test(record?.message ?? "");
}

function sweepMemory(now = Date.now()) {
  for (const [key, note] of memory) if (note.expiresAt < now) memory.delete(key);
}

/** The send route: the channel to try for this phone's next code (clears any earlier "used"). */
export async function rememberWantedChannel(phone: string, wanted: CodeChannel) {
  const key = keyFor(phone);
  const expiresAt = Date.now() + CODE_CHANNEL_TTL_MS;
  sweepMemory();
  memory.set(key, { wanted, used: null, expiresAt });
  try {
    await db.$executeRaw`
      INSERT INTO "AuthCodeChannel" ("key", "wanted", "used", "expiresAt") VALUES (${key}, ${wanted}, NULL, ${new Date(expiresAt)})
      ON CONFLICT ("key") DO UPDATE SET "wanted" = EXCLUDED."wanted", "used" = NULL, "expiresAt" = EXCLUDED."expiresAt"`;
    await db.$executeRaw`DELETE FROM "AuthCodeChannel" WHERE "expiresAt" < now()`;
  } catch (error) {
    if (!isMissingTable(error)) console.error("[auth-otp] couldn't note the wanted channel", error);
  }
}

async function readNote(key: string): Promise<Note | null> {
  try {
    const rows = await db.$queryRaw<{ wanted: string; used: string | null; expiresAt: Date }[]>`
      SELECT "wanted", "used", "expiresAt" FROM "AuthCodeChannel" WHERE "key" = ${key} AND "expiresAt" > now()`;
    const row = rows[0];
    if (row) return { wanted: row.wanted === "whatsapp" ? "whatsapp" : "sms", used: row.used === "whatsapp" ? "whatsapp" : row.used === "sms" ? "sms" : null, expiresAt: row.expiresAt.getTime() };
  } catch (error) {
    if (!isMissingTable(error)) console.error("[auth-otp] couldn't read the code channel", error);
  }
  const local = memory.get(key);
  return local && local.expiresAt > Date.now() ? local : null;
}

async function noteUsed(key: string, used: CodeChannel) {
  const local = memory.get(key);
  if (local) local.used = used;
  try {
    await db.$executeRaw`UPDATE "AuthCodeChannel" SET "used" = ${used} WHERE "key" = ${key}`;
  } catch (error) {
    if (!isMissingTable(error)) console.error("[auth-otp] couldn't note the channel used", error);
  }
}

/** The send route, after Supabase has called the hook: the channel that really carried the code. */
export async function channelUsedFor(phone: string): Promise<CodeChannel> {
  const note = await readNote(keyFor(phone));
  return reportedChannel(note?.used);
}

async function sendWhatsAppCode(config: WhatsAppCodeConfig, phone: string, otp: string) {
  const request =
    config.provider === "termii"
      ? termiiWhatsAppRequest(config, phone, otp)
      : config.provider === "sendchamp"
        ? sendchampWhatsAppRequest(config, phone, otp)
        : metaWhatsAppRequest(config, phone, otp);
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (config.provider !== "termii") headers.Authorization = `Bearer ${config.apiKey}`;
  const res = await fetch(request.url, { method: "POST", headers, body: JSON.stringify(request.body), signal: AbortSignal.timeout(15_000) }).catch((error: Error) => error);
  if (res instanceof Error) return { ok: false as const, error: res.message || "network error" };
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return readWhatsAppSend(config.provider, res.ok, json && typeof json === "object" ? json : {});
}

export type CodeDelivery = { ok: true; channel: CodeChannel } | { ok: false; error: string };

/**
 * The Supabase Send SMS hook: send this code by the wanted channel, falling back to SMS when WhatsApp is off or
 * fails. Notes the channel used so the send route can tell the screen.
 */
export async function deliverSignInCode(phone: string, otp: string, env: Record<string, string | undefined> = process.env): Promise<CodeDelivery> {
  const key = keyFor(phone);
  const note = await readNote(key);
  const whatsapp = whatsappCodeConfig(env);
  const errors: string[] = [];
  for (const channel of deliveryPlan(note?.wanted, Boolean(whatsapp))) {
    if (channel === "whatsapp" && whatsapp) {
      const sent = await sendWhatsAppCode(whatsapp, phone, otp);
      if (sent.ok) {
        await noteUsed(key, "whatsapp");
        return { ok: true, channel: "whatsapp" };
      }
      errors.push(`whatsapp (${whatsapp.provider}): ${sent.error}`);
      console.warn("[auth-otp] WhatsApp code failed, falling back to SMS", sent.error);
      continue;
    }
    const sms = await sendPlatformSms({ to: [phone], body: signInCodeMessage(otp) });
    if (sms.ok) {
      await noteUsed(key, "sms");
      return { ok: true, channel: "sms" };
    }
    errors.push(`sms: ${sms.error}`);
  }
  return { ok: false, error: errors.join("; ") || "No way to send the code." };
}
