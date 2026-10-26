import { useEffect, useRef, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { api } from "./api";
import { inAppCallPossible, type SavedItem, type SetupView } from "./peggy-call-pure";
import { supabase } from "./supabase";

// "Call Peggy" in the app: the API calls and a small app-wide store the call (components/peggy/PeggyCallHost.tsx)
// writes and the rest of the app reads: whether calls can happen here, the call's phase, what Peggy saved so far
// and the setup status after each save. Setup screens refresh when she saves (usePeggySaved) and can take the
// "Continue" after the call to their own next step (usePeggyContinue). No web or browser fallback anywhere.
//
//   GET  /api/mobile/peggy-call          → { ready }
//   POST /api/mobile/peggy-call          → { conversationToken, dynamicVariables, maxSeconds }
//   POST /api/mobile/peggy-call/action   → { result, saved, status }   (Peggy's tools)
//   GET  /api/app/setup-peggy            → { status }                   (the checklist at the start of a call)

export interface CallStart {
  conversationToken: string;
  dynamicVariables: Record<string, string>;
  maxSeconds?: number;
}
export interface ToolResult {
  result: string;
  saved: SavedItem[];
  status: SetupView | null;
}

export const fetchCallInfo = () => api<{ ready: boolean }>("/api/mobile/peggy-call");
export const startCallSession = () => api<CallStart>("/api/mobile/peggy-call", { method: "POST", json: {} });
export const runCallTool = (tool: string, params: unknown, conversationId: string | null) =>
  api<ToolResult>("/api/mobile/peggy-call/action", { method: "POST", json: { tool, params: params && typeof params === "object" ? params : {}, ...(conversationId ? { conversationId } : {}) } });

/** The setup status as the call shows it (from the setup chat's GET). */
export async function fetchSetupView(): Promise<SetupView | null> {
  const data = await api<{ status: { done: number; steps: { id: string; done: boolean }[]; next: { id: string } | null } | null }>("/api/app/setup-peggy");
  const status = data.status;
  return status ? { done: status.done, total: status.steps.length, next: status.next?.id ?? null, steps: status.steps.map((step) => ({ id: step.id, done: step.done })) } : null;
}

/** This build can run the call (not Expo Go, not the web build). */
export const callsPossibleHere = () => inAppCallPossible({ platform: Platform.OS, expoGo: Constants.executionEnvironment === ExecutionEnvironment.StoreClient });

// ─── The store ────────────────────────────────────────────────────────────────

export type CallPhase = "idle" | "connecting" | "live" | "summary";
export interface SavedEntry extends SavedItem {
  id: number;
}
export interface CallState {
  /** null while unknown; false when calls aren't switched on or can't run on this build. */
  available: boolean | null;
  /** The call engine is loaded in this build (components/peggy/PeggyCallHost.tsx). */
  engine: boolean;
  phase: CallPhase;
  minimized: boolean;
  saved: SavedEntry[];
  status: SetupView | null;
  error: string | null;
  /** Who ended the last call: Peggy herself (her end_call tool), the person, or a dropped line. */
  endedBy: "agent" | "user" | "error" | null;
  /** When Peggy last opened a screen (open_screen), so tips stay away from the screen she opened. */
  openedAt: number | null;
}

const INITIAL: CallState = { available: null, engine: false, phase: "idle", minimized: false, saved: [], status: null, error: null, endedBy: null, openedAt: null };
let state: CallState = INITIAL;
const listeners = new Set<() => void>();
const saveListeners = new Set<(item: SavedItem) => void>();
let continueHandler: ((status: SetupView | null) => boolean) | null = null;
let controls: { start: () => void; end: () => void } | null = null;
let checkedAt = 0;
let nextId = 1;

function emit() {
  listeners.forEach((listener) => listener());
}

export function patchCall(patch: Partial<CallState>) {
  state = { ...state, ...patch };
  emit();
}

export const callState = () => state;

/** Listens to every change of the call (the tips' audio guard stops sound when a call starts). */
export function subscribeCall(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The call's state, re-rendering when it changes. */
export function usePeggyCall() {
  return useSyncExternalStore(subscribeCall, callState, callState);
}

/** A call is going on: connecting, live (open or minimized) or its summary is showing. */
export const callOn = (current: CallState) => current.phase !== "idle";

/** The minimized call bar is showing (the app keeps a strip free for it, so it never covers the screen). */
export const callBarShown = (current: CallState) => current.engine && current.minimized && (current.phase === "connecting" || current.phase === "live");

/** Peggy opened a screen on the call. */
export function notePeggyOpened(now = Date.now()) {
  patchCall({ openedAt: now });
}

/** Whether "Call Peggy" can be offered here (for rows in a List, which shouldn't hold an empty row). */
export function useCanCallPeggy() {
  return canCall(usePeggyCall());
}

/** Peggy saved things: kept for the summary, the status refreshed, and every screen listening told. */
export function recordSaved(items: SavedItem[], status: SetupView | null) {
  if (!items.length && !status) return;
  const entries = items.map((item) => ({ ...item, id: nextId++ }));
  patchCall({ saved: [...state.saved, ...entries], ...(status ? { status } : {}) });
  for (const item of items) saveListeners.forEach((listener) => listener(item));
}

/** Runs `onSaved` each time Peggy saves something on a call (for screens to refresh what they show). */
export function usePeggySaved(onSaved: (item: SavedItem) => void) {
  const latest = useRef(onSaved);
  useEffect(() => {
    latest.current = onSaved;
  });
  useEffect(() => {
    const listener = (item: SavedItem) => latest.current(item);
    saveListeners.add(listener);
    return () => {
      saveListeners.delete(listener);
    };
  }, []);
}

/**
 * A setup screen takes "Continue" after the call: it gets the status and moves to its own next step (true), or
 * leaves it to the app (false), which opens the next missing step's screen.
 */
export function usePeggyContinue(handler: (status: SetupView | null) => boolean) {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    const mine = (status: SetupView | null) => latest.current(status);
    continueHandler = mine;
    return () => {
      if (continueHandler === mine) continueHandler = null;
    };
  }, []);
}

export function runContinue(status: SetupView | null) {
  return continueHandler ? continueHandler(status) : false;
}

/** The call host registers how to start and end a call. */
export function setCallControls(next: typeof controls) {
  controls = next;
  // Only tell listeners when it changes, so registering can never re-render in a loop.
  if (state.engine !== Boolean(next)) patchCall({ engine: Boolean(next) });
}

/** Whether "Call Peggy" can be offered here: calls are on, and this build runs them. */
export const canCall = (current: CallState) => current.available === true && current.engine;

/** Start a call from anywhere (a button, a Shopinbos status). False when calls can't happen here. */
export function requestPeggyCall(): boolean {
  if (!controls || !canCall(state)) return false;
  controls.start();
  return true;
}

export function endPeggyCall() {
  controls?.end();
}

/** Asks the server whether calls are on (at most every 5 minutes), unless this build can't run them. */
export function checkCallsAvailable(force = false) {
  if (!callsPossibleHere()) {
    if (state.available !== false) patchCall({ available: false });
    return;
  }
  if (!force && Date.now() - checkedAt < 5 * 60_000 && state.available !== null) return;
  checkedAt = Date.now();
  fetchCallInfo()
    .then((info) => patchCall({ available: Boolean(info.ready) }))
    .catch(() => {
      checkedAt = 0;
    });
}

// Signing out ends any call and forgets what was saved.
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    controls?.end();
    checkedAt = 0;
    state = { ...INITIAL, engine: state.engine };
    emit();
  }
});
