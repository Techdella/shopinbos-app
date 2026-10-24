import "server-only";

import { db } from "@/lib/db/client";
import { aiConfigured } from "@/lib/ai/client";
import { aiText, firstJsonObject, type ChatTurn } from "@/lib/ai/text";
import { PEGGY_FACTS } from "@/lib/support/peggy-knowledge";
import { setupStatus, setupText, type SetupStatus } from "./setup-status.server";
import { NATIONWIDE, NG_REGIONS, parseArea } from "@shared/delivery-market";
import { actionLabel, actionsFor, cleanActions, type SetupAction } from "./setup-peggy-pure";
import { savePeggyNote } from "./peggy-notes.server";

// Peggy in the supplier, delivery partner and seller dashboards, helping people finish setting up. Free: it
// never uses AI credits (it's support, not a feature they pay for). She asks for one thing at a time, and when
// they answer she saves it for them (pickup address or points, delivery areas, starting price, description).
// The voice call ("Call Peggy") saves through the same actions (applySetupActions, from
// /api/mobile/peggy-call/action), plus notes for the team.

export class SetupPeggyError extends Error {}

// The text chat can't save notes (those are the call's, kept for the team).
const ACTION_HELP: Partial<Record<SetupAction["type"], string>> = {
  save_pickup_address: '{"type":"save_pickup_address","address":"<full street address>","city":"<city>"} — the supplier\'s pickup address',
  add_pickup_point: '{"type":"add_pickup_point","name":"<e.g. Ikeja office>","address":"<street address>","state":"<state>","area":"<area>","hours":"<e.g. Mon-Sat 8am-6pm>","phone":"<phone>"}',
  add_coverage: '{"type":"add_coverage","city":"<city, if they named one>","areas":["<neighbourhood, LGA, city or state>", "..."]} — places they deliver (or sell) to',
  set_base_price: '{"type":"set_base_price","naira":<number>} — their starting delivery price',
  set_description: '{"type":"set_description","text":"<one or two sentences about the business>"}',
};

function system(status: SetupStatus) {
  const allowed = actionsFor(status.role).filter((type) => ACTION_HELP[type]);
  return `You are Peggy, Shopinbos's AI customer support, inside ${status.business}'s dashboard. You help ${status.firstName} finish setting up, warmly and simply, like a patient Nigerian colleague. Plain English (Pidgin is fine if they use it). Short messages: 1-3 sentences, no Markdown.

How to help:
- Work through the setup below in order. Ask for ONE missing thing at a time, with an example of the answer you need.
- When they give you the details for something you can save, save it with an action and say what you saved. Don't ask them to fill a form for things you can save.
- For things you can't save here (documents, products, bank), tell them exactly which page and what to tap: give the link from the setup list.
- If they ask a general question about Shopinbos, answer from the facts. If you don't know, say a person on the team will help (WhatsApp +1 711-695-1381).
- Never ask for passwords, card numbers, BVN or one-time codes.

THEIR SETUP NOW
${setupText(status)}

${allowed.length ? `ACTIONS YOU CAN TAKE (only these, only with details they gave you):\n${allowed.map((a) => `- ${ACTION_HELP[a]}`).join("\n")}` : "You can't save anything here; guide them to the right page."}

${PEGGY_FACTS}

Reply with JSON only: {"reply": "<your message>", "actions": [<zero or more actions>]}`;
}

/** The states a list of coverage tokens covers ("Ogun: Lafenwa" → Ogun; "South-West" → its six states). */
function statesOf(tokens: readonly string[]) {
  const states = new Set<string>();
  for (const token of tokens) {
    const parsed = parseArea(token);
    if (!parsed) continue;
    if (parsed.kind === "state" || parsed.kind === "area") states.add(parsed.state);
    else if (parsed.kind === "region") for (const state of NG_REGIONS[parsed.region] ?? []) states.add(state);
  }
  return [...states];
}

/** A seller's or supplier's "where I sell": the states the places are in, added to what's there (or nationwide). */
async function addSellAreas(userId: string, tokens: readonly string[]) {
  const current = await db.deliverySettings.findUnique({ where: { userId }, select: { sellArea: true, sellStates: true } });
  if (tokens.includes(NATIONWIDE)) {
    await db.deliverySettings.upsert({ where: { userId }, create: { userId, sellArea: "nationwide" }, update: { sellArea: "nationwide" } });
    return;
  }
  // Already selling everywhere (their own choice): those places are covered, nothing to narrow.
  if (current?.sellArea === "nationwide") return;
  const states = [...new Set([...(current?.sellStates ?? []), ...statesOf(tokens)])];
  if (!states.length) return;
  await db.deliverySettings.upsert({ where: { userId }, create: { userId, sellArea: "selected", sellStates: states }, update: { sellArea: "selected", sellStates: states } });
}

/**
 * Saves setup actions (already cleaned for the role) and returns what was saved, in Peggy's words. Used by the
 * dashboard chat and by the voice call's tools.
 */
export async function applySetupActions(userId: string, status: SetupStatus, actions: SetupAction[], context: { conversationId?: string | null } = {}) {
  const done: { action: SetupAction; label: string }[] = [];
  for (const action of actions) {
    try {
      if (action.type === "save_note") {
        await savePeggyNote({ userId, role: status.role, text: action.text, kind: action.kind, conversationId: context.conversationId });
      } else if (status.role === "supplier") {
        const supplier = await db.supplier.findUnique({ where: { userId }, select: { id: true } });
        if (!supplier) continue;
        if (action.type === "save_pickup_address") {
          await db.supplier.update({ where: { id: supplier.id }, data: { address: action.address, ...(action.city ? { city: action.city } : {}) } });
          await db.deliverySettings.upsert({ where: { userId }, create: { userId, originAddress: action.address, ...(action.city ? { originArea: action.city } : {}) }, update: { originAddress: action.address, ...(action.city ? { originArea: action.city } : {}) } });
        } else if (action.type === "set_description") await db.supplier.update({ where: { id: supplier.id }, data: { description: action.text } });
        else if (action.type === "add_coverage") await addSellAreas(userId, action.areas);
        else continue;
      } else if (status.role === "logistics_partner") {
        const partner = await db.logisticsPartner.findUnique({ where: { userId }, select: { id: true, coverageZones: true, pickupAreas: true, deliveryAreas: true } });
        if (!partner) continue;
        if (action.type === "add_pickup_point") {
          await db.logisticsPickupPoint.create({ data: { logisticsPartnerId: partner.id, name: action.name, address: action.address, state: action.state, area: action.area ?? null, hours: action.hours ?? null, phone: action.phone ?? null } });
        } else if (action.type === "add_coverage") {
          // Where they deliver: the setup checklist reads coverageZones, the marketplace and the app read
          // deliveryAreas (and the states they collect from, pickupAreas, when none are set yet).
          const known = new Set(partner.coverageZones.map((z) => z.toLowerCase()));
          const zones = action.areas.filter((a) => !known.has(a.toLowerCase()));
          const nationwide = partner.deliveryAreas.includes(NATIONWIDE);
          const delivery = nationwide ? [] : action.areas.filter((a) => !partner.deliveryAreas.includes(a));
          const pickup = partner.pickupAreas.length ? [] : statesOf(action.areas);
          if (!zones.length && !delivery.length && !pickup.length) continue;
          await db.logisticsPartner.update({
            where: { id: partner.id },
            data: { ...(zones.length ? { coverageZones: { push: zones } } : {}), ...(delivery.length ? { deliveryAreas: { push: delivery } } : {}), ...(pickup.length ? { pickupAreas: pickup } : {}) },
          });
        } else if (action.type === "set_base_price") await db.logisticsPartner.update({ where: { id: partner.id }, data: { basePrice: action.naira } });
        else if (action.type === "set_description") await db.logisticsPartner.update({ where: { id: partner.id }, data: { description: action.text } });
        else continue;
      } else if (status.role === "seller") {
        if (action.type === "save_pickup_address") {
          await db.deliverySettings.upsert({ where: { userId }, create: { userId, originAddress: action.address, ...(action.city ? { originArea: action.city } : {}) }, update: { originAddress: action.address, ...(action.city ? { originArea: action.city } : {}) } });
        } else if (action.type === "set_description") await db.store.update({ where: { userId }, data: { description: action.text } });
        else if (action.type === "add_coverage") await addSellAreas(userId, action.areas);
        else continue;
      } else continue;
      done.push({ action, label: actionLabel(action) });
    } catch (error) {
      console.error("[setup-peggy] action failed", action.type, error);
    }
  }
  return done;
}

/** One turn of the setup chat: Peggy's reply, what she saved, and the setup afterwards. */
export async function setupChat(userId: string, messages: ChatTurn[]) {
  if (!aiConfigured()) throw new SetupPeggyError("Peggy is resting right now. Message us on WhatsApp and a person will help.");
  const status = await setupStatus(userId);
  if (!status) throw new SetupPeggyError("Finish signing up first, then Peggy can help.");
  const turns = messages.filter((m) => m.content.trim()).slice(-16);
  while (turns.length && turns[0].role === "assistant") turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== "user") throw new SetupPeggyError("Type a message first.");
  const result = await aiText({ system: system(status), messages: turns, fast: true, maxTokens: 2000 });
  const json = firstJsonObject(result?.text ?? null);
  const reply = typeof json?.reply === "string" ? json.reply.trim() : (result?.text ?? "").trim();
  if (!reply) throw new SetupPeggyError("Peggy couldn't answer just now. Try again.");
  const saved = (await applySetupActions(userId, status, cleanActions(json?.actions, status.role).filter((action) => action.type !== "save_note"))).map((item) => item.label);
  const after = saved.length ? await setupStatus(userId) : status;
  return { reply, saved, status: after };
}
