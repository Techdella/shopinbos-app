// When tips may show (the floating Tips button, the first-run Home tour). A new person thought a tip that opened by
// itself WAS the page, so tips wait until their setup is done, never show during a Peggy call, and stay away for a
// moment after Peggy opens a screen. Pure, unit-tested in tests/mobile-tips-gate.test.mjs; used by
// lib/setup-gate.ts, components/learn/LearnHost.tsx and app/(tabs)/home.tsx.

/** Steps the person can't finish themselves (the team reviewing their documents) don't hold tips back. */
const WAITING_ON_US = new Set(["verified"]);

/** How long tips stay away after Peggy opens a screen (the call has usually ended by then). */
export const AFTER_PEGGY_OPENED_MS = 60_000;

/** A seller's setup from the Start checklist (GET /api/app/setup): done when the checklist is complete. */
export function sellerSetupDone(overview: { checklist?: { complete?: boolean } | null } | null | undefined): boolean | null {
  const complete = overview?.checklist?.complete;
  return typeof complete === "boolean" ? complete : null;
}

/** A supplier's or delivery partner's setup (GET /api/app/setup-peggy): done when every step they do is done. */
export function roleSetupDone(view: { steps?: { id: string; done: boolean }[] } | null | undefined): boolean | null {
  const steps = view?.steps;
  if (!Array.isArray(steps) || !steps.length) return null;
  return steps.every((step) => step.done || WAITING_ON_US.has(step.id));
}

export interface TipsGate {
  /** Setup done (true), still going (false) or unknown (null: not loaded, or the server didn't say). */
  setupDone: boolean | null;
  /** The person's tips switch (Settings → Tips and tooltips). */
  tipsOn: boolean;
  /** The Peggy call's phase. */
  callPhase: "idle" | "connecting" | "live" | "summary";
  /** When Peggy last opened a screen. */
  peggyOpenedAt: number | null;
  now: number;
}

/** Whether tips may show now: setup done, tips on, no call (or its summary), not just after Peggy opened a screen. */
export function tipsMayShow(gate: TipsGate) {
  if (gate.setupDone !== true || !gate.tipsOn) return false;
  if (gate.callPhase !== "idle") return false;
  if (gate.peggyOpenedAt !== null && gate.now - gate.peggyOpenedAt < AFTER_PEGGY_OPENED_MS) return false;
  return true;
}

/** Whether the first-run Home tour may start: the same rules (the tour ignores the tips switch: it runs once). */
export const tourMayShow = (gate: Omit<TipsGate, "tipsOn">) => tipsMayShow({ ...gate, tipsOn: true });

/** The floating Tips button hidden on these screens (intro keys), with `key` added. Kept short and unique. */
export function withHidden(list: readonly string[], key: string, max = 100) {
  return [...list.filter((item) => item !== key), key].slice(-max);
}
