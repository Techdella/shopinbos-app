import "server-only";

import { db } from "@/lib/db/client";
import { aiConfigured } from "@/lib/ai/client";
import { aiText, firstJsonObject, type ChatTurn } from "@/lib/ai/text";
import { PEGGY_FACTS } from "@/lib/support/peggy-knowledge";
import { coverageStateCount, logisticsPlanLimits } from "@/lib/plan-limits";
import { pickupPointLimitProblem } from "@/lib/plans/market.server";
import { setupStatus, setupText, type SetupStatus } from "./setup-status.server";
import { actionLabel, actionsFor, cleanActions, type SetupAction } from "./setup-peggy-pure";

// Peggy in the supplier, delivery partner and seller dashboards, helping people finish setting up. Free: it
// never uses AI credits (it's support, not a feature they pay for). She asks for one thing at a time, and when
// they answer she saves it for them (pickup address or points, delivery areas, starting price, description).

export class SetupPeggyError extends Error {}

const ACTION_HELP: Record<SetupAction["type"], string> = {
  save_pickup_address: '{"type":"save_pickup_address","address":"<full street address>","city":"<city>"} — the supplier\'s pickup address',
  add_pickup_point: '{"type":"add_pickup_point","name":"<e.g. Ikeja office>","address":"<street address>","state":"<state>","area":"<area>","hours":"<e.g. Mon-Sat 8am-6pm>","phone":"<phone>"}',
  add_coverage: '{"type":"add_coverage","areas":["<area or state>", "..."]} — places they deliver to',
  set_base_price: '{"type":"set_base_price","naira":<number>} — their starting delivery price',
  set_description: '{"type":"set_description","text":"<one or two sentences about the business>"}',
};

function system(status: SetupStatus) {
  const allowed = actionsFor(status.role);
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

async function apply(userId: string, status: SetupStatus, actions: SetupAction[]) {
  const done: string[] = [];
  for (const action of actions) {
    try {
      if (status.role === "supplier") {
        const supplier = await db.supplier.findUnique({ where: { userId }, select: { id: true } });
        if (!supplier) continue;
        if (action.type === "save_pickup_address") await db.supplier.update({ where: { id: supplier.id }, data: { address: action.address, ...(action.city ? { city: action.city } : {}) } });
        else if (action.type === "set_description") await db.supplier.update({ where: { id: supplier.id }, data: { description: action.text } });
        else continue;
      } else if (status.role === "logistics_partner") {
        const partner = await db.logisticsPartner.findUnique({ where: { userId }, select: { id: true, coverageZones: true } });
        if (!partner) continue;
        if (action.type === "add_pickup_point") {
          // The plan's pickup points and states (shared/plans.ts), as on the forms.
          if (await pickupPointLimitProblem(partner.id)) continue;
          await db.logisticsPickupPoint.create({ data: { logisticsPartnerId: partner.id, name: action.name, address: action.address, state: action.state, area: action.area ?? null, hours: action.hours ?? null, phone: action.phone ?? null } });
        } else if (action.type === "add_coverage") {
          const known = new Set(partner.coverageZones.map((z) => z.toLowerCase()));
          const add = action.areas.filter((a) => !known.has(a.toLowerCase()));
          if (!add.length) continue;
          const limit = logisticsPlanLimits(await db.user.findUnique({ where: { id: userId }, select: { aiCredits: true } }) ?? {}).coverageStates;
          if (limit !== null && coverageStateCount([...partner.coverageZones, ...add]) > limit) continue;
          await db.logisticsPartner.update({ where: { id: partner.id }, data: { coverageZones: { push: add } } });
        } else if (action.type === "set_base_price") await db.logisticsPartner.update({ where: { id: partner.id }, data: { basePrice: action.naira } });
        else if (action.type === "set_description") await db.logisticsPartner.update({ where: { id: partner.id }, data: { description: action.text } });
        else continue;
      } else continue;
      done.push(actionLabel(action));
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
  const saved = await apply(userId, status, cleanActions(json?.actions, status.role));
  const after = saved.length ? await setupStatus(userId) : status;
  return { reply, saved, status: after };
}
