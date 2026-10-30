import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db/client";
import { setupStatus, setupText } from "@/lib/onboarding/setup-status.server";
import { PEGGY_FACTS } from "@/lib/support/peggy-knowledge";
import { actionsFor } from "@/lib/onboarding/setup-peggy-pure";
import { clientEventsWithToolResponse, elevenLabsBuiltInTools, elevenLabsTools } from "@/lib/onboarding/peggy-call-tools";
import { peggyDashboard } from "./peggy-dashboard.server";
import { screenList } from "@shared/peggy-screens";
import { canonicalState } from "@shared/delivery-market";
import { areasText, citiesText } from "@shared/ng-places";
import { PEGGY_LANGUAGE_QUESTION, peggyVoicePrompt } from "./peggy-voice-prompt";
import { planOfUser } from "@/lib/plan-limits";
import { addCredits, creditBalance, liveCreditPrices, spendCredits } from "@/lib/ai/credits.server";
import { FREE_PEGGY_CALLS_PER_MONTH, peggyCallsLeft, type PlanKey } from "@shared/plans";
import { PAID_CALL_MAX_SECONDS, FREE_CALL_MAX_SECONDS, PEGGY_CALL_MINUTE_CREDITS, lagosMonthStart, peggyCallTerms, settlePeggyCall, type PeggyCallTerms } from "@shared/peggy-call-limits";

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
/** Calls per person per day. How long one call may last is shared/peggy-call-limits.ts (10 minutes on free plans). */
export const VOICE_CALLS_PER_DAY = 5;

export class PeggyVoiceError extends Error {}

// Free plans get FREE_PEGGY_CALLS_PER_MONTH calls a month (Lagos month), counted as AiUsage rows of this kind; after
// those, calls are paid with AI credits (shared/peggy-call-limits.ts): held for 10 minutes, settled to the minute.
const CALL_KIND = "peggy_call";

/** Calls this person started this Lagos month. */
async function callsThisMonth(userId: string, now = new Date()) {
  return db.aiUsage.count({ where: { userId, kind: CALL_KIND, createdAt: { gte: lagosMonthStart(now) } } });
}

/** Calls with Peggy this person has left this month (null: no monthly cap on their plan). */
export async function peggyCallsLeftFor(userId: string): Promise<number | null> {
  const [plan, used] = await Promise.all([planOfUser(userId), callsThisMonth(userId)]);
  return peggyCallsLeft(plan, used);
}

/** What a minute of a paid call costs now (Admin › Pricing "credits.cost.peggy_call_minute"). */
async function minutePrice() {
  const costs = (await liveCreditPrices().catch(() => null))?.costs;
  return Math.max(1, Math.round(costs?.peggy_call_minute ?? PEGGY_CALL_MINUTE_CREDITS));
}

export interface PeggyCallQuote extends PeggyCallTerms {
  plan: PlanKey;
  /** Credits they have now (only read for free plans). */
  balance: number | null;
}

/** The terms of this person's next call: free, paid with credits (and what it holds), or their paid plan's. */
export async function peggyCallQuote(userId: string): Promise<PeggyCallQuote> {
  const [plan, used, perMinute] = await Promise.all([planOfUser(userId), callsThisMonth(userId), minutePrice()]);
  const terms = peggyCallTerms({ planKey: plan, usedThisMonth: used, perMinute });
  const balance = terms.mode === "plan" ? null : await creditBalance(userId).catch(() => null);
  return { ...terms, plan, balance };
}

/**
 * The words when a free plan has used this month's free calls and hasn't the credits for another (the phone app's
 * leave out buying: store rules).
 */
export function noCallsLeftMessage(inApp: boolean, quote?: { perMinute: number; hold: number } | null) {
  const used = `You've used your ${FREE_PEGGY_CALLS_PER_MONTH} free calls with Peggy this month.`;
  const price = quote ? ` More calls are ${quote.perMinute} AI credits a minute (up to 10 minutes, so ${quote.hold} credits are held and what you don't use comes back).` : "";
  return inApp
    ? `${used}${price} Chat with her instead; free calls come back on the 1st.`
    : `${used}${price} Top up your AI credits to call now, or chat with her instead. Free calls come back on the 1st.`;
}

/** A call paid with credits couldn't start: not enough credits for the 10-minute hold. */
export class PeggyCallCreditsError extends Error {
  constructor(
    message: string,
    readonly cost: number,
    readonly balance: number,
  ) {
    super(message);
  }
}

/** Counts a call that started (only once ElevenLabs gave a link or token). */
async function recordCall(userId: string) {
  await db.aiUsage.create({ data: { userId, kind: CALL_KIND, units: 1 } }).catch((error) => console.error("[peggy-call] count", error));
}

export function peggyVoiceReady() {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
}

const PROMPT = `${peggyVoicePrompt({ facts: PEGGY_FACTS, cities: citiesText() })}

# Call length
This call can last up to {{call_limit_minutes}} minutes, then the line closes by itself. Keep answers short and get to the point. If you are told there is one minute left, say so gently, sum up in two or three short sentences what you covered and what they should do next, and say goodbye.`;

const FIRST_MESSAGE = `Hi {{first_name}}! I'm Peggy, Shopinbos's AI customer support, here to help you set up {{business}}. ${PEGGY_LANGUAGE_QUESTION}`;

function voiceId() {
  return process.env.ELEVENLABS_PEGGY_VOICE_ID?.trim() || process.env.ELEVENLABS_VOICE_FEMALE?.trim() || "21m00Tcm4TlvDq8ikWAM";
}

/**
 * The agent: her prompt, voice, client tools and ElevenLabs' end_call system tool (prompt.built_in_tools), so she can
 * hang up when they say goodbye. `withSystemTools: false` is the same agent without it, only used to create her when
 * ElevenLabs rejects the full config; the saved version then differs, so the full config is tried again next call.
 */
function agentConfig({ withSystemTools = true, maxSeconds = PAID_CALL_MAX_SECONDS } = {}) {
  return {
    name: maxSeconds === PAID_CALL_MAX_SECONDS ? "Peggy (Shopinbos setup help)" : `Peggy (Shopinbos setup help, ${Math.round(maxSeconds / 60)}-minute calls)`,
    conversation_config: {
      agent: { first_message: FIRST_MESSAGE, language: "en", prompt: { prompt: PROMPT, tools: elevenLabsTools(), ...(withSystemTools ? { built_in_tools: elevenLabsBuiltInTools() } : {}) } },
      tts: { voice_id: voiceId() },
      // Enforced by ElevenLabs: the line closes at this length whatever the app does (free plans: 600).
      conversation: { max_duration_seconds: maxSeconds },
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

/**
 * Makes sure the agent sends agent_tool_response events to the app, so when Peggy calls end_call the app closes the
 * call at once and shows the summary (ElevenLabs' SDK ends the session on that event). The agent's own list is read
 * first and only added to, never replaced: the other events (audio, transcripts, client tool calls) must stay.
 */
async function ensureToolEvents(id: string) {
  try {
    const agent = await eleven(`/convai/agents/${encodeURIComponent(id)}`);
    const conversation = ((agent.conversation_config as Record<string, unknown> | undefined)?.conversation ?? {}) as Record<string, unknown>;
    const next = clientEventsWithToolResponse(conversation.client_events);
    if (next) await eleven(`/convai/agents/${encodeURIComponent(id)}`, { method: "PATCH", body: { conversation_config: { conversation: { client_events: next } } } });
  } catch (error) {
    // The app still hangs up after her goodbye by itself (shared/peggy-goodbye.ts).
    console.error("[peggy-voice] could not turn on agent_tool_response events", error);
  }
}

/**
 * The two agents: the paid plans' (calls up to 15 minutes; setting "voice.peggy", or ELEVENLABS_PEGGY_AGENT_ID) and
 * the free plans' (calls up to 10 minutes; setting "voice.peggy.free", or ELEVENLABS_PEGGY_FREE_AGENT_ID). The same
 * Peggy; only max_duration_seconds differs, which is how the 10-minute cap is enforced on ElevenLabs' side.
 */
function agentVariant(maxSeconds: number) {
  return maxSeconds >= PAID_CALL_MAX_SECONDS
    ? { setting: SETTING, fixed: process.env.ELEVENLABS_PEGGY_AGENT_ID?.trim(), maxSeconds: PAID_CALL_MAX_SECONDS }
    : { setting: `${SETTING}.free`, fixed: process.env.ELEVENLABS_PEGGY_FREE_AGENT_ID?.trim(), maxSeconds: FREE_CALL_MAX_SECONDS };
}

/** Peggy's agent id: the env one, else the one the server made (re-synced when her prompt or voice changes). */
async function agentId(maxSeconds = PAID_CALL_MAX_SECONDS) {
  const variant = agentVariant(maxSeconds);
  const SETTING_KEY = variant.setting;
  const fixed = variant.fixed;
  const config = agentConfig({ maxSeconds: variant.maxSeconds });
  const version = createHash("sha256").update(JSON.stringify(config)).digest("hex").slice(0, 16);
  const row = await db.platformSetting.findUnique({ where: { key: SETTING_KEY } }).catch(() => null);
  const saved = (row?.value ?? {}) as { agentId?: string; version?: string };
  const id = fixed || saved.agentId;
  if (id) {
    if (saved.version !== version) {
      // Only remembered once ElevenLabs took it, so a failed update (prompt, voice or tools) is tried again next call.
      const path = `/convai/agents/${encodeURIComponent(id)}`;
      let failure = "";
      const synced = await eleven(path, { method: "PATCH", body: config }).then(
        () => true,
        (error) => {
          console.error("[peggy-voice] agent update failed", error);
          failure = error instanceof Error ? error.message : String(error);
          return false;
        },
      );
      if (synced) await ensureToolEvents(id);
      if (synced) await db.platformSetting.upsert({ where: { key: SETTING_KEY }, create: { key: SETTING_KEY, value: { agentId: id, version } }, update: { value: { agentId: id, version } } });
      // Rejected (perhaps the system tools): her new prompt and tools still go out without them; the version isn't
      // saved, so the full config is tried again on the next call. Why it was rejected is kept in the setting
      // (lastSyncError) so it can be read without the server logs.
      else {
        await eleven(path, { method: "PATCH", body: agentConfig({ withSystemTools: false, maxSeconds: variant.maxSeconds }) }).catch((error) => console.error("[peggy-voice] agent update without system tools failed", error));
        const value = { ...saved, agentId: id, lastSyncError: failure.slice(0, 300), lastSyncAt: new Date().toISOString() };
        await db.platformSetting.upsert({ where: { key: SETTING_KEY }, create: { key: SETTING_KEY, value }, update: { value } }).catch(() => null);
      }
    }
    return id;
  }
  // If ElevenLabs rejects the full config, make her without the system tools (calls still work); "partial" is never
  // the current version, so the next call PATCHes the full config again.
  let saveAs = version;
  const created = await eleven("/convai/agents/create", { method: "POST", body: config }).catch(async (error) => {
    console.error("[peggy-voice] agent create failed, trying without system tools", error);
    saveAs = "partial";
    return eleven("/convai/agents/create", { method: "POST", body: agentConfig({ withSystemTools: false, maxSeconds: variant.maxSeconds }) });
  });
  const newId = typeof created.agent_id === "string" ? created.agent_id : null;
  if (!newId) throw new PeggyVoiceError("ElevenLabs didn't return an agent.");
  await ensureToolEvents(newId);
  await db.platformSetting.upsert({ where: { key: SETTING_KEY }, create: { key: SETTING_KEY, value: { agentId: newId, version: saveAs } }, update: { value: { agentId: newId, version: saveAs } } });
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
async function callVariables(userId: string, call: { ref: string; maxSeconds: number }) {
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
    // The call's PeggyCallSession (the post-call webhook settles it by this) and its length limit.
    call_ref: call.ref,
    call_limit_minutes: String(Math.round(call.maxSeconds / 60)),
  };
}

// ─── Starting a call: free, paid plan, or held credits ───────────────────────

interface OpenedCall {
  terms: PeggyCallQuote;
  ref: string;
  /** Gives back the hold when the call couldn't start after all. */
  cancel: () => Promise<void>;
}

/**
 * Decides the terms and, for a call paid with credits, takes the 10-minute hold and records the PeggyCallSession
 * (its id is the call's reference). No credits for the hold: PeggyCallCreditsError. From the phone app the saved card
 * is never charged (store rules).
 */
async function openCall(userId: string, options: { inApp: boolean }): Promise<OpenedCall> {
  const terms = await peggyCallQuote(userId);
  if (terms.mode !== "credits") {
    const session = await db.peggyCallSession
      .create({ data: { userId, mode: terms.mode, planKey: terms.plan, maxSeconds: terms.maxSeconds } })
      .catch((error) => {
        // Before the table exists: free and paid-plan calls still go ahead (nothing to settle).
        console.error("[peggy-call] session", error instanceof Error ? error.message : error);
        return null;
      });
    return { terms, ref: session?.id ?? `call-${userId}-${Date.now()}`, cancel: async () => undefined };
  }
  const left = await spendCredits(userId, terms.hold, { autoTopUp: !options.inApp }).catch((error) => {
    console.error("[peggy-call] hold failed", error);
    return null;
  });
  if (left === null) {
    const balance = await creditBalance(userId).catch(() => 0);
    throw new PeggyCallCreditsError(noCallsLeftMessage(options.inApp, terms), terms.hold, balance);
  }
  let session: { id: string } | null = null;
  try {
    session = await db.peggyCallSession.create({ data: { userId, mode: "credits", planKey: terms.plan, maxSeconds: terms.maxSeconds, perMinute: terms.perMinute, heldCredits: terms.hold } });
  } catch (error) {
    // No record, no charge: the hold goes straight back.
    await addCredits(userId, terms.hold, "refund").catch(() => undefined);
    console.error("[peggy-call] couldn't record the call", error);
    throw new PeggyVoiceError("Couldn't start the call just now. Nothing was taken: try again in a minute.");
  }
  const id = session.id;
  return {
    terms,
    ref: id,
    cancel: async () => {
      await settleCallSession({ ref: id, seconds: 0, by: "not_started" }).catch((error) => console.error("[peggy-call] cancel", error));
    },
  };
}

/** What every start answers with besides the link or token: the call's limits and price (for the timer and words). */
function callTermsOut(opened: OpenedCall) {
  const { terms } = opened;
  return { callRef: opened.ref, maxSeconds: terms.maxSeconds, mode: terms.mode, callsLeft: terms.callsLeft, perMinute: terms.perMinute, heldCredits: terms.hold };
}

/** A signed URL to start a call (the web call page), and who Peggy is talking to. */
export async function startPeggyCall(userId: string, options: { inApp?: boolean } = {}) {
  if (!peggyVoiceReady()) throw new PeggyVoiceError("Calls with Peggy aren't switched on yet. Chat with her instead, or message us on WhatsApp.");
  const opened = await openCall(userId, { inApp: Boolean(options.inApp) });
  try {
    const dynamicVariables = await callVariables(userId, { ref: opened.ref, maxSeconds: opened.terms.maxSeconds });
    const id = await agentId(opened.terms.maxSeconds);
    const signed = await eleven(`/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(id)}`);
    const signedUrl = typeof signed.signed_url === "string" ? signed.signed_url : null;
    if (!signedUrl) throw new PeggyVoiceError("ElevenLabs didn't return a call link.");
    await recordCall(userId);
    return { signedUrl, dynamicVariables, ...callTermsOut(opened) };
  } catch (error) {
    await opened.cancel();
    throw error;
  }
}

/**
 * A WebRTC conversation token for the in-app call (ElevenLabs' React Native SDK only does WebRTC), and who Peggy is
 * talking to. The token is good for one call, for a short while.
 */
export async function startPeggyAppCall(userId: string) {
  if (!peggyVoiceReady()) throw new PeggyVoiceError("Calls with Peggy aren't switched on yet. Chat with her instead, or message us on WhatsApp.");
  const opened = await openCall(userId, { inApp: true });
  try {
    const dynamicVariables = await callVariables(userId, { ref: opened.ref, maxSeconds: opened.terms.maxSeconds });
    const id = await agentId(opened.terms.maxSeconds);
    const issued = await eleven(`/convai/conversation/token?agent_id=${encodeURIComponent(id)}`);
    const conversationToken = typeof issued.token === "string" ? issued.token : null;
    if (!conversationToken) throw new PeggyVoiceError("ElevenLabs didn't return a call token.");
    await recordCall(userId);
    return { conversationToken, dynamicVariables, ...callTermsOut(opened) };
  } catch (error) {
    await opened.cancel();
    throw error;
  }
}

// ─── Settling a call paid with credits ───────────────────────────────────────

/**
 * Settles one call once (open → settled): `seconds` is its real length from ElevenLabs. A call paid with credits keeps
 * the started minutes and gives the rest of the hold back as a refund lot. Returns what happened, or null when it was
 * already settled (or isn't this person's).
 */
export async function settleCallSession(input: { ref: string; seconds: number; by: string; conversationId?: string | null; userId?: string }) {
  const session = await db.peggyCallSession.findUnique({ where: { id: input.ref } }).catch(() => null);
  if (!session || session.status !== "open" || (input.userId && session.userId !== input.userId)) return null;
  const result = settlePeggyCall({ held: session.heldCredits, perMinute: session.perMinute, seconds: input.seconds, maxSeconds: session.maxSeconds });
  const done = await db.$transaction(async (tx) => {
    const moved = await tx.peggyCallSession.updateMany({
      where: { id: session.id, status: "open" },
      data: { status: "settled", seconds: Math.max(0, Math.round(input.seconds)), chargedCredits: result.charge, refundedCredits: result.refund, settledAt: new Date(), settledBy: input.by, ...(input.conversationId && !session.conversationId ? { conversationId: input.conversationId } : {}) },
    });
    if (moved.count !== 1) return false;
    if (result.refund > 0) await addCredits(session.userId, result.refund, "refund", `peggy-call-${session.id}`, tx);
    return true;
  });
  return done ? { ...result, mode: session.mode } : null;
}

/** ElevenLabs' record of a conversation: its length when it's finished, and the call it belongs to. */
async function conversationFacts(conversationId: string) {
  const data = await eleven(`/convai/conversations/${encodeURIComponent(conversationId)}`);
  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  const init = (data.conversation_initiation_client_data ?? {}) as Record<string, unknown>;
  const vars = (init.dynamic_variables ?? {}) as Record<string, unknown>;
  const status = typeof data.status === "string" ? data.status : "";
  const seconds = typeof metadata.call_duration_secs === "number" ? metadata.call_duration_secs : null;
  return { finished: status === "done" || status === "failed", seconds, callRef: typeof vars.call_ref === "string" ? vars.call_ref : null, userRef: typeof vars.user_ref === "string" ? vars.user_ref : null };
}

/**
 * The app says a call ended (POST …/peggy-call/end { callRef, conversationId }). Its length is read from ElevenLabs,
 * never taken from the app, and only when the conversation is really this call; otherwise the post-call webhook (or
 * the hourly sweep) settles it later. Returns the settlement when it happened now.
 */
export async function endPeggyCall(userId: string, input: { callRef: string; conversationId?: string | null }) {
  const session = await db.peggyCallSession.findUnique({ where: { id: input.callRef } }).catch(() => null);
  if (!session || session.userId !== userId) return { settled: false as const };
  if (session.status !== "open") return { settled: true as const, minutes: Math.ceil((session.seconds ?? 0) / 60), charged: session.chargedCredits, refunded: session.refundedCredits };
  const conversationId = input.conversationId?.trim().slice(0, 120) || null;
  if (conversationId && !session.conversationId) {
    await db.peggyCallSession.updateMany({ where: { id: session.id, conversationId: null }, data: { conversationId } }).catch(() => null);
  }
  const id = conversationId ?? session.conversationId;
  if (!id || session.heldCredits <= 0) {
    // Nothing held (a free or paid-plan call): settle the record now, with ElevenLabs' length when it has it.
    if (session.heldCredits <= 0) {
      const facts = id ? await conversationFacts(id).catch(() => null) : null;
      await settleCallSession({ ref: session.id, seconds: facts?.callRef === session.id ? facts.seconds ?? 0 : 0, by: "app" });
    }
    return { settled: false as const };
  }
  const facts = await conversationFacts(id).catch(() => null);
  if (!facts?.finished || facts.seconds === null || facts.callRef !== session.id || facts.userRef !== userId) return { settled: false as const };
  const result = await settleCallSession({ ref: session.id, seconds: facts.seconds, by: "api", conversationId: id });
  return result ? { settled: true as const, minutes: result.minutes, charged: result.charge, refunded: result.refund } : { settled: false as const };
}

/** ElevenLabs' post-call webhook: settles the call it names (call_ref) with the length ElevenLabs measured. */
export async function settleFromWebhook(call: { callRef: string | null; userId: string; conversationId: string | null; seconds: number | null }) {
  if (!call.callRef || call.seconds === null) return null;
  return settleCallSession({ ref: call.callRef, seconds: call.seconds, by: "webhook", conversationId: call.conversationId, userId: call.userId });
}

/**
 * Hourly (the lifecycle cron): credits calls still open after 30 minutes. With a conversation id, ElevenLabs' length
 * settles it. After 3 hours with no sign of a conversation (no id, and the post-call webhook never came), no call
 * happened: the whole hold goes back.
 */
export async function sweepPeggyCallHolds(now = new Date()) {
  const open = await db.peggyCallSession.findMany({ where: { status: "open", createdAt: { lte: new Date(now.getTime() - 30 * 60_000) } }, orderBy: { createdAt: "asc" }, take: 200 });
  let settled = 0;
  for (const session of open) {
    if (session.conversationId) {
      const facts = await conversationFacts(session.conversationId).catch(() => null);
      if (facts?.finished && facts.seconds !== null && facts.callRef === session.id) {
        if (await settleCallSession({ ref: session.id, seconds: facts.seconds, by: "sweep" })) settled += 1;
        continue;
      }
    }
    if (now.getTime() - session.createdAt.getTime() >= 3 * 60 * 60_000) {
      if (await settleCallSession({ ref: session.id, seconds: 0, by: session.heldCredits > 0 ? "sweep_no_call" : "sweep" })) settled += 1;
    }
  }
  return { checked: open.length, settled };
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
