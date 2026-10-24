import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db/client";
import { setupStatus, setupText } from "@/lib/onboarding/setup-status.server";
import { PEGGY_FACTS } from "@/lib/support/peggy-knowledge";
import { actionsFor } from "@/lib/onboarding/setup-peggy-pure";
import { elevenLabsBuiltInTools, elevenLabsTools } from "@/lib/onboarding/peggy-call-tools";
import { peggyDashboard } from "./peggy-dashboard.server";
import { screenList } from "@shared/peggy-screens";
import { canonicalState } from "@shared/delivery-market";
import { areasText, citiesText } from "@shared/ng-places";
import { PEGGY_LANGUAGE_QUESTION, peggyVoicePrompt } from "./peggy-voice-prompt";

// "Call Peggy": a free voice call with Peggy (ElevenLabs Conversational AI) while people set up on Shopinbos. She
// says she's Shopinbos's AI customer support, knows where they are in setup, and talks them through the next step.
//
// The agent is made (and kept up to date) by the server: ELEVENLABS_PEGGY_AGENT_ID uses one made by hand; otherwise
// it's created on the first call and its id kept in PlatformSetting "voice.peggy". Each call gets a signed URL
// (the web, valid 15 minutes) or a WebRTC conversation token (the phone app's in-app call) and the person's details
// as dynamic variables. Peggy saves while she talks through client tools (src/lib/onboarding/peggy-call-tools.ts),
// which the phone app runs against POST /api/mobile/peggy-call/action. She speaks English or Nigerian Pidgin only,
// and everything she saves is written in English.
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

const PROMPT = peggyVoicePrompt({ facts: PEGGY_FACTS, cities: citiesText() });

const FIRST_MESSAGE = `Hi {{first_name}}! I'm Peggy, Shopinbos's AI customer support, here to help you set up {{business}}. ${PEGGY_LANGUAGE_QUESTION}`;

function voiceId() {
  return process.env.ELEVENLABS_PEGGY_VOICE_ID?.trim() || process.env.ELEVENLABS_VOICE_FEMALE?.trim() || "21m00Tcm4TlvDq8ikWAM";
}

/**
 * The agent: her prompt, voice, client tools and ElevenLabs' end_call system tool (prompt.built_in_tools), so she can
 * hang up when they say goodbye. `withSystemTools: false` is the same agent without it, only used to create her when
 * ElevenLabs rejects the full config; the saved version then differs, so the full config is tried again next call.
 */
function agentConfig({ withSystemTools = true } = {}) {
  return {
    name: "Peggy (Shopinbos setup help)",
    conversation_config: {
      agent: { first_message: FIRST_MESSAGE, language: "en", prompt: { prompt: PROMPT, tools: elevenLabsTools(), ...(withSystemTools ? { built_in_tools: elevenLabsBuiltInTools() } : {}) } },
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
      // Only remembered once ElevenLabs took it, so a failed update (prompt, voice or tools) is tried again next call.
      const path = `/convai/agents/${encodeURIComponent(id)}`;
      const synced = await eleven(path, { method: "PATCH", body: config }).then(() => true, (error) => (console.error("[peggy-voice] agent update failed", error), false));
      if (synced) await db.platformSetting.upsert({ where: { key: SETTING }, create: { key: SETTING, value: { agentId: id, version } }, update: { value: { agentId: id, version } } });
      // Rejected (perhaps the system tools): her new prompt and tools still go out without them; the version isn't
      // saved, so the full config is tried again on the next call.
      else await eleven(path, { method: "PATCH", body: agentConfig({ withSystemTools: false }) }).catch((error) => console.error("[peggy-voice] agent update without system tools failed", error));
    }
    return id;
  }
  // If ElevenLabs rejects the full config, make her without the system tools (calls still work); "partial" is never
  // the current version, so the next call PATCHes the full config again.
  let saveAs = version;
  const created = await eleven("/convai/agents/create", { method: "POST", body: config }).catch(async (error) => {
    console.error("[peggy-voice] agent create failed, trying without system tools", error);
    saveAs = "partial";
    return eleven("/convai/agents/create", { method: "POST", body: agentConfig({ withSystemTools: false }) });
  });
  const newId = typeof created.agent_id === "string" ? created.agent_id : null;
  if (!newId) throw new PeggyVoiceError("ElevenLabs didn't return an agent.");
  await db.platformSetting.upsert({ where: { key: SETTING }, create: { key: SETTING, value: { agentId: newId, version: saveAs } }, update: { value: { agentId: newId, version: saveAs } } });
  return newId;
}

const ROLE_WORDS = { supplier: "supplier", logistics_partner: "delivery partner", seller: "seller" } as const;

const SAVE_WORDS: Record<string, string> = {
  save_pickup_address: "pickup address (save_pickup_address)",
  add_pickup_point: "pickup points (add_pickup_point)",
  add_coverage: "places they deliver or sell to (add_coverage)",
  set_base_price: "starting delivery price (set_starting_price)",
  set_description: "business description (set_description)",
  save_note: "notes for the team (save_note, save_call_summary)",
};

/** The states the person is in, as far as we know (their city, their coverage), for Peggy's area lists. */
async function homeStates(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { city: true, supplier: { select: { city: true } }, logisticsPartner: { select: { city: true, pickupAreas: true, coverageZones: true } }, deliverySettings: { select: { originState: true, sellStates: true } } },
  }).catch(() => null);
  const names = [user?.city, user?.supplier?.city, user?.logisticsPartner?.city, user?.deliverySettings?.originState, ...(user?.logisticsPartner?.pickupAreas ?? []), ...(user?.logisticsPartner?.coverageZones ?? []), ...(user?.deliverySettings?.sellStates ?? [])];
  const states = [...new Set(names.map((name) => canonicalState(String(name ?? "").split(":")[0])).filter((state): state is NonNullable<typeof state> => Boolean(state)))];
  return states.slice(0, 4);
}

/** Who Peggy is talking to and where they are in setup (the agent's dynamic variables). */
async function callVariables(userId: string) {
  const status = await setupStatus(userId);
  if (!status) throw new PeggyVoiceError("Finish signing up first, then call Peggy.");
  const [states, dashboard] = await Promise.all([homeStates(userId), peggyDashboard(userId, status)]);
  const near = areasText(states.length ? states : ["Lagos"]);
  return {
    first_name: status.firstName,
    business: status.business,
    role: ROLE_WORDS[status.role],
    setup: setupText(status),
    can_save: actionsFor(status.role).map((type) => SAVE_WORDS[type]).filter(Boolean).join(", ") || "nothing",
    home_areas: near || "none listed",
    dashboard: dashboard || "Not available right now: go by their setup above.",
    screens: screenList(status.role),
    user_ref: userId,
  };
}

/** A signed URL to start a call (the web call page), and who Peggy is talking to. */
export async function startPeggyCall(userId: string) {
  if (!peggyVoiceReady()) throw new PeggyVoiceError("Calls with Peggy aren't switched on yet. Chat with her instead, or message us on WhatsApp.");
  const dynamicVariables = await callVariables(userId);
  const id = await agentId();
  const signed = await eleven(`/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(id)}`);
  const signedUrl = typeof signed.signed_url === "string" ? signed.signed_url : null;
  if (!signedUrl) throw new PeggyVoiceError("ElevenLabs didn't return a call link.");
  return { signedUrl, dynamicVariables };
}

/**
 * A WebRTC conversation token for the in-app call (ElevenLabs' React Native SDK only does WebRTC), and who Peggy is
 * talking to. The token is good for one call, for a short while.
 */
export async function startPeggyAppCall(userId: string) {
  if (!peggyVoiceReady()) throw new PeggyVoiceError("Calls with Peggy aren't switched on yet. Chat with her instead, or message us on WhatsApp.");
  const dynamicVariables = await callVariables(userId);
  const id = await agentId();
  const issued = await eleven(`/convai/conversation/token?agent_id=${encodeURIComponent(id)}`);
  const conversationToken = typeof issued.token === "string" ? issued.token : null;
  if (!conversationToken) throw new PeggyVoiceError("ElevenLabs didn't return a call token.");
  return { conversationToken, dynamicVariables, maxSeconds: MAX_CALL_SECONDS };
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
