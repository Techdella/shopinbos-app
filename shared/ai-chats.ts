// Saved Rex Studio and Peggy conversations (AiChat rows): what a save request may hold and the title a chat gets.
// Pure, unit-tested in tests/behaviour.test.mjs; stored by src/lib/ai/chats.server.ts.

export const AI_CHAT_ASSISTANTS = ["rex", "peggy"] as const;
export type AiChatAssistant = (typeof AI_CHAT_ASSISTANTS)[number];

export const AI_CHAT_MAX_MESSAGES = 200;
/** Serialised size cap for one chat (cards and links included). */
export const AI_CHAT_MAX_BYTES = 400_000;
/** Chats kept per assistant; older ones are removed when a new one is saved. */
export const AI_CHAT_KEEP = 50;

export function isAiChatAssistant(value: unknown): value is AiChatAssistant {
  return typeof value === "string" && (AI_CHAT_ASSISTANTS as readonly string[]).includes(value);
}

/** The seller's first words, shortened, as the chat's title ("Make a banner for my Sallah sale"). */
export function aiChatTitle(messages: unknown[]): string {
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const entry = message as Record<string, unknown>;
    if (entry.role !== "seller" && entry.role !== "user") continue;
    const text = typeof entry.text === "string" ? entry.text : typeof entry.content === "string" ? entry.content : "";
    const clean = text.replace(/\[(?:Photos attached|Stills from a video)[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
    if (clean) return clean.length > 70 ? `${clean.slice(0, 67)}…` : clean;
  }
  return "New chat";
}

export type AiChatSave = { id: string | null; assistant: AiChatAssistant; messages: unknown[] };

/** Checks a save request: { id?, assistant, messages: [...] }. */
export function parseAiChatSave(body: unknown): { ok: true; save: AiChatSave } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Nothing to save." };
  const input = body as Record<string, unknown>;
  if (!isAiChatAssistant(input.assistant)) return { ok: false, error: "Say whose chat this is." };
  if (!Array.isArray(input.messages) || !input.messages.length) return { ok: false, error: "Nothing to save." };
  if (input.messages.length > AI_CHAT_MAX_MESSAGES) return { ok: false, error: "This chat is too long to save. Start a new one." };
  if (JSON.stringify(input.messages).length > AI_CHAT_MAX_BYTES) return { ok: false, error: "This chat is too long to save. Start a new one." };
  const id = typeof input.id === "string" && /^[\w-]{1,40}$/.test(input.id) ? input.id : null;
  return { ok: true, save: { id, assistant: input.assistant, messages: input.messages } };
}

/** The day buckets of the chat sidebar, newest first. */
export const AI_CHAT_GROUPS = ["today", "yesterday", "week", "month", "older"] as const;
export type AiChatGroup = (typeof AI_CHAT_GROUPS)[number];

/** Which bucket a chat last touched at `iso` falls in, counted from the start of today (local time). */
export function aiChatGroup(iso: string, now = new Date()): AiChatGroup {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const at = new Date(iso).getTime();
  const day = 24 * 60 * 60 * 1000;
  if (at >= start) return "today";
  if (at >= start - day) return "yesterday";
  if (at >= start - 7 * day) return "week";
  if (at >= start - 30 * day) return "month";
  return "older";
}
