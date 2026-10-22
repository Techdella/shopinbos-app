import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db/client";
import { setupStatus, setupText } from "@/lib/onboarding/setup-status.server";
import { PEGGY_FACTS } from "@/lib/support/peggy-knowledge";

// "Call Peggy": a free voice call with Peggy (ElevenLabs Conversational AI) while people set up on Shopinbos. She
// says she's Shopinbos's AI customer support, knows where they are in setup, and talks them through the next step.
//
// The agent is made (and kept up to date) by the server: ELEVENLABS_PEGGY_AGENT_ID uses one made by hand; otherwise
// it's created on the first call and its id kept in PlatformSetting "voice.peggy". Each call gets a signed URL
// (valid 15 minutes) and the person's details as dynamic variables.
//
// Env: ELEVENLABS_API_KEY (needs Conversational AI), ELEVENLABS_PEGGY_VOICE_ID (a Nigerian female voice from the
// ElevenLabs Voice Library; falls back to ELEVENLABS_VOICE_FEMALE).

const API = "https://api.elevenlabs.io/v1";
const SETTING = "voice.peggy";
/** Calls per person per day, and how long one call may last. */
export const VOICE_CALLS_PER_DAY = 5;
const MAX_CALL_SECONDS = 900;

export class PeggyVoiceError extends Error {}

export function peggyVoiceReady() {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
}

const PROMPT = `You are Peggy, Shopinbos's AI customer support, on a voice call with {{first_name}} from {{business}} (a {{role}} on Shopinbos). You're warm, patient and Nigerian: you speak clear Nigerian English and switch to Pidgin if they do. Keep each turn short (one to three sentences), like a real phone call, and let them talk.

At the start, you already said you're Peggy, Shopinbos's AI customer support. If they ask, be honest that you're an AI, and that a person on the team can help on WhatsApp at plus one, seven one one, six nine five, one three eight one.

Your job: help them finish setting up, one step at a time, and answer their questions about Shopinbos. Their setup right now:
{{setup}}

How to help:
- If a setup step isn't done, start with the first one; if everything is done, ask what they need help with today. Explain what it is and why it matters in one sentence, then tell them exactly where to tap in the app (the page in the list) and what to enter, step by step. Wait for them to do it.
- For pickup points, coverage and prices, they can also type the details to you in the Peggy chat on the same page and you'll save them.
- Answer questions from the facts below. Never invent a price, feature, date or promise. If you don't know, say a person on the team will follow up on WhatsApp.
- Never ask for passwords, card numbers, BVN or one-time codes. Don't read out long links: say the page name instead.

${PEGGY_FACTS}`;

const FIRST_MESSAGE = "Hi {{first_name}}! I'm Peggy, Shopinbos's AI customer support. I'm here to help you get {{business}} set up. What would you like help with first?";

function voiceId() {
  return process.env.ELEVENLABS_PEGGY_VOICE_ID?.trim() || process.env.ELEVENLABS_VOICE_FEMALE?.trim() || "21m00Tcm4TlvDq8ikWAM";
}

function agentConfig() {
  return {
    name: "Peggy (Shopinbos setup help)",
    conversation_config: {
      agent: { first_message: FIRST_MESSAGE, language: "en", prompt: { prompt: PROMPT } },
      tts: { voice_id: voiceId() },
      conversation: { max_duration_seconds: MAX_CALL_SECONDS },
    },
  };
}

async function eleven(path: string, init: { method?: string; body?: unknown } = {}) {
  const response = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "", ...(init.body ? { "Content-Type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const detail = json?.detail;
    const message = typeof detail === "string" ? detail : detail && typeof detail === "object" ? String((detail as { message?: unknown }).message ?? JSON.stringify(detail)) : `HTTP ${response.status}`;
    throw new PeggyVoiceError(`ElevenLabs: ${message.slice(0, 200)}`);
  }
  return json ?? {};
}

/** Peggy's agent id: the env one, else the one the server made (re-synced when her prompt or voice changes). */
async function agentId() {
  const fixed = process.env.ELEVENLABS_PEGGY_AGENT_ID?.trim();
  const config = agentConfig();
  const version = createHash("sha256").update(JSON.stringify(config)).digest("hex").slice(0, 16);
  const row = await db.platformSetting.findUnique({ where: { key: SETTING } }).catch(() => null);
  const saved = (row?.value ?? {}) as { agentId?: string; version?: string };
  const id = fixed || saved.agentId;
  if (id) {
    if (saved.version !== version) {
      await eleven(`/convai/agents/${encodeURIComponent(id)}`, { method: "PATCH", body: config }).catch((error) => console.error("[peggy-voice] agent update failed", error));
      await db.platformSetting.upsert({ where: { key: SETTING }, create: { key: SETTING, value: { agentId: id, version } }, update: { value: { agentId: id, version } } });
    }
    return id;
  }
  const created = await eleven("/convai/agents/create", { method: "POST", body: config });
  const newId = typeof created.agent_id === "string" ? created.agent_id : null;
  if (!newId) throw new PeggyVoiceError("ElevenLabs didn't return an agent.");
  await db.platformSetting.upsert({ where: { key: SETTING }, create: { key: SETTING, value: { agentId: newId, version } }, update: { value: { agentId: newId, version } } });
  return newId;
}

const ROLE_WORDS = { supplier: "supplier", logistics_partner: "delivery partner", seller: "seller" } as const;

/** A signed URL to start a call, and who Peggy is talking to. */
export async function startPeggyCall(userId: string) {
  if (!peggyVoiceReady()) throw new PeggyVoiceError("Calls with Peggy aren't switched on yet. Chat with her instead, or message us on WhatsApp.");
  const status = await setupStatus(userId);
  if (!status) throw new PeggyVoiceError("Finish signing up first, then call Peggy.");
  const id = await agentId();
  const signed = await eleven(`/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(id)}`);
  const signedUrl = typeof signed.signed_url === "string" ? signed.signed_url : null;
  if (!signedUrl) throw new PeggyVoiceError("ElevenLabs didn't return a call link.");
  return {
    signedUrl,
    dynamicVariables: { first_name: status.firstName, business: status.business, role: ROLE_WORDS[status.role], setup: setupText(status) },
  };
}

// ─── A link for the mobile app (the call runs in the browser, signed in by this token) ───

const secret = () => process.env.PEGGY_CALL_SECRET || process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

/** A token for /call-peggy?t=…, valid 15 minutes, for this user only. */
export function callToken(userId: string, now = Date.now()) {
  const payload = `${userId}.${Math.floor(now / 1000) + 900}`;
  return `${payload}.${createHmac("sha256", secret()).update(payload).digest("base64url")}`;
}

export function userFromCallToken(token: string, now = Date.now()) {
  const [userId, exp, sig] = token.split(".");
  if (!userId || !exp || !sig || !secret()) return null;
  const expected = createHmac("sha256", secret()).update(`${userId}.${exp}`).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return Number(exp) * 1000 > now ? userId : null;
}
