// Peggy's call notes as stored (OnboardingResponse rows with source "peggy_call"): reading one back safely.
// Pure, unit-tested in tests/peggy-call.test.mjs.

export const PEGGY_NOTE_SOURCE = "peggy_call";
export const PEGGY_NOTE_PREFIX = "peggy_call:";

export interface PeggyNote {
  id: string;
  /** note: something she noted during the call · summary: the end-of-call summary. */
  kind: "note" | "summary";
  text: string;
  /** peggy: saved by Peggy during a call · chat: sent from Ask Peggy (note_to_team) · elevenlabs: the post-call summary. */
  via: "peggy" | "chat" | "elevenlabs";
  conversationId: string | null;
  createdAt: string;
}

export function readPeggyNote(row: { id: string; answer: unknown; createdAt: Date | string }): PeggyNote | null {
  const answer = row.answer && typeof row.answer === "object" && !Array.isArray(row.answer) ? (row.answer as Record<string, unknown>) : null;
  const text = typeof answer?.text === "string" ? answer.text.trim() : "";
  if (!text) return null;
  return {
    id: row.id,
    kind: answer?.kind === "summary" ? "summary" : "note",
    text,
    via: answer?.via === "elevenlabs" ? "elevenlabs" : answer?.via === "chat" ? "chat" : "peggy",
    conversationId: typeof answer?.conversationId === "string" ? answer.conversationId : null,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}
