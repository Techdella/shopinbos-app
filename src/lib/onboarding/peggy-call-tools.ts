// Peggy's tools on a voice call ("Call Peggy"): what she can save while she talks. They're ElevenLabs client tools
// (the agent config in src/lib/ai/peggy-voice.server.ts), run by the phone app, which posts each call to
// POST /api/mobile/peggy-call/action. The server turns a tool call into the same setup actions as the text setup
// chat (setup-peggy-pure.ts cleanActions), saves them and answers Peggy with one short English line.
// Pure, unit-tested in tests/peggy-call.test.mjs.

import { areasOfCity } from "../../../shared/ng-places.ts";
import { actionsFor, cleanActions, coverageTokens, type SetupAction, type SetupRole } from "./setup-peggy-pure.ts";

type Param = { type: "string" | "number" | "array"; description: string; items?: { type: "string"; description: string } };
export interface VoiceTool {
  name: string;
  description: string;
  required: string[];
  properties: Record<string, Param>;
}

const ENGLISH = "Always in English, even when the call is in Pidgin.";

export const VOICE_TOOLS: readonly VoiceTool[] = [
  {
    name: "save_pickup_address",
    description: `Save where riders collect orders from this business (suppliers and sellers). Only after they told you the address and you read it back. ${ENGLISH}`,
    required: ["address"],
    properties: { address: { type: "string", description: "Full street address with area, e.g. 12 Kuto Road, Kuto, Abeokuta" }, city: { type: "string", description: "The city, e.g. Abeokuta" } },
  },
  {
    name: "add_pickup_point",
    description: `Add a pickup point (an office or hub where parcels are dropped or collected) for a delivery partner. ${ENGLISH}`,
    required: ["address", "state"],
    properties: {
      name: { type: "string", description: "Short name, e.g. Kuto office" },
      address: { type: "string", description: "Street address" },
      state: { type: "string", description: "Nigerian state, e.g. Ogun" },
      area: { type: "string", description: "Neighbourhood or LGA, e.g. Kuto" },
      hours: { type: "string", description: "Opening hours, e.g. Mon-Sat 8am-6pm" },
      phone: { type: "string", description: "Phone number for the point" },
    },
  },
  {
    name: "add_coverage",
    description: `Save the places they deliver to (or, for sellers and suppliers, sell to). When they name a city, first ask which areas, confirm them back, then call this with the city and the areas. A city with no areas means all of it; a state alone means the whole state. ${ENGLISH}`,
    required: ["areas"],
    properties: {
      city: { type: "string", description: "The city the areas are in, e.g. Abeokuta" },
      state: { type: "string", description: "The state, e.g. Ogun" },
      areas: { type: "array", description: "Neighbourhoods, LGAs, cities or states, e.g. Lafenwa, Kuto", items: { type: "string", description: "One place" } },
    },
  },
  {
    name: "set_starting_price",
    description: "Save a delivery partner's starting delivery price within their city, in naira, after they confirm the amount.",
    required: ["naira"],
    properties: { naira: { type: "number", description: "Whole naira, e.g. 2500" } },
  },
  {
    name: "set_description",
    description: `Save one or two sentences describing the business, after reading it back to them. ${ENGLISH}`,
    required: ["text"],
    properties: { text: { type: "string", description: "The description" } },
  },
  {
    name: "save_note",
    description: `Save anything else useful the team should know (vehicles, opening days, plans, problems, what they asked for). ${ENGLISH}`,
    required: ["text"],
    properties: { text: { type: "string", description: "The note, in English" } },
  },
  {
    name: "save_call_summary",
    description: `At the end of every call, before saying goodbye, save a short summary of the call: what was saved, what is still to do and anything they asked for. ${ENGLISH}`,
    required: ["text"],
    properties: { text: { type: "string", description: "The summary, in English" } },
  },
  {
    name: "lookup_areas",
    description: "Get the well-known neighbourhoods of a Nigerian city, so you can ask which ones they cover.",
    required: ["city"],
    properties: { city: { type: "string", description: "The city, e.g. Ijebu-Ode" } },
  },
];

export const VOICE_TOOL_NAMES = VOICE_TOOLS.map((tool) => tool.name);

/** The ElevenLabs agent config for the tools (client tools: the app runs them and answers Peggy). */
export function elevenLabsTools() {
  return VOICE_TOOLS.map((tool) => ({
    type: "client",
    name: tool.name,
    description: tool.description,
    expects_response: true,
    response_timeout_secs: 20,
    parameters: { type: "object", required: tool.required, properties: tool.properties },
  }));
}

const TOOL_ACTION: Record<string, SetupAction["type"]> = {
  save_pickup_address: "save_pickup_address",
  add_pickup_point: "add_pickup_point",
  add_coverage: "add_coverage",
  set_starting_price: "set_base_price",
  set_description: "set_description",
  save_note: "save_note",
  save_call_summary: "save_note",
};

/** A tool call → the setup actions it means (cleaned; nothing a role may not do). */
export function toolActions(tool: string, params: unknown, role: SetupRole): SetupAction[] {
  const type = TOOL_ACTION[tool];
  if (!type) return [];
  const p = params && typeof params === "object" && !Array.isArray(params) ? (params as Record<string, unknown>) : {};
  const raw = { ...p, type, ...(tool === "set_starting_price" ? { naira: p.naira } : {}), ...(tool === "save_call_summary" ? { kind: "summary" } : tool === "save_note" ? { kind: "note" } : {}) };
  return cleanActions([raw], role);
}

/** Whether a role can use a tool at all (lookup_areas is for everyone). */
export function toolAllowed(tool: string, role: SetupRole) {
  if (tool === "lookup_areas") return true;
  const type = TOOL_ACTION[tool];
  return Boolean(type && actionsFor(role).includes(type));
}

const ROLE_WORDS: Record<SetupRole, string> = { supplier: "a supplier", logistics_partner: "a delivery partner", seller: "a seller" };

/**
 * Peggy's answer for a tool call: what was saved, or why not and what to ask instead. Short and in English (it's
 * read by Peggy, not shown to anyone).
 */
export function toolReply(tool: string, params: unknown, role: SetupRole, saved: readonly string[]): string {
  const p = params && typeof params === "object" ? (params as Record<string, unknown>) : {};
  if (tool === "lookup_areas") {
    const found = areasOfCity(typeof p.city === "string" ? p.city : "");
    if (!found.length) return "I don't have a list for that city. Ask them to name the areas and which state it's in.";
    return found.map((city) => `${city.city} (${city.state}): ${city.areas.join(", ")}.`).join(" ");
  }
  if (!VOICE_TOOL_NAMES.includes(tool)) return "That isn't something I can do on this call.";
  if (!toolAllowed(tool, role)) return `That can't be saved for ${ROLE_WORDS[role]}. Tell them where to set it in the app instead.`;
  if (saved.length) {
    const unknown = tool === "add_coverage" ? coverageTokens(p).unknown : [];
    const done = `Saved. ${saved.join(". ")}.`;
    return unknown.length ? `${done} I couldn't place ${unknown.join(", ")}: ask which city or state, then save them.` : done;
  }
  if (tool === "add_coverage") {
    const unknown = coverageTokens(p).unknown;
    return unknown.length ? `Not saved: I couldn't place ${unknown.join(", ")}. Ask which city or state it's in.` : "Not saved: tell me the places (areas, a city or a state).";
  }
  if (tool === "set_starting_price") return "Not saved: the price must be a whole naira amount between 200 and 500,000.";
  if (tool === "save_pickup_address") return "Not saved: I need the full street address with the area.";
  if (tool === "add_pickup_point") return "Not saved: I need the street address and the state.";
  if (tool === "set_description") return "Not saved: the description needs at least one full sentence.";
  return "Not saved: there was nothing to save.";
}
