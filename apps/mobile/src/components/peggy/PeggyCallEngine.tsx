import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { router } from "expo-router";
import { requestRecordingPermissionsAsync } from "expo-audio";
import { ConversationProvider, useConversation } from "@elevenlabs/react-native";
import { ApiError } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { callState, checkCallsAvailable, endCallSession, fetchSetupView, notePeggyOpened, patchCall, recordSaved, runCallTool, runContinue, setCallControls, startCallSession, usePeggyCall, usePeggySaved } from "@/lib/peggy-call";
import { ONE_MINUTE_LEFT_NOTE, PAID_CALL_MAX_SECONDS, callTimeline } from "@shared/peggy-call-limits";
import { CALL_TOOLS, editPath, nextStepPath, openScreenOnPhone, stepKey, type CallRole } from "@/lib/peggy-call-pure";
import { HANG_UP_AFTER_MS, HANG_UP_FALLBACK_MS, shouldHangUp } from "@shared/peggy-goodbye";
import { useRole } from "@/lib/role";
import { CallBar, CallSheet, CallSummary, useSavedLine } from "./PeggyCallViews";

// "Call Peggy" inside the app: ElevenLabs' React Native SDK (WebRTC through LiveKit's native modules), so this file
// is only loaded in builds that have them (EAS builds, never Expo Go: PeggyCallHost decides). The server gives a
// conversation token and the person's details (POST /api/mobile/peggy-call); Peggy's client tools save to the
// account through POST /api/mobile/peggy-call/action with the person's own sign-in, and each save shows as a line
// in the call, a toast while minimized, and ticks on the setup screens behind (lib/peggy-call.ts store). After the
// call: "Here's what Peggy saved", with Edit links, then the next setup step that's still missing. Peggy can end the
// call herself (ElevenLabs' end_call: the same summary, "Peggy ended the call"), and open screens while she talks
// (open_screen, run here: an allow-listed route for the role, shared/peggy-screens.ts; the call minimizes so the
// screen shows, with a "Peggy opened Delivery" toast). get_dashboard and the saving tools go to the server.
//
// Length (shared/peggy-call-limits.ts): free-plan calls last up to 10 minutes. ElevenLabs closes the line at 10:00 on
// its side (the free agent's max_duration_seconds); here, at 9:00 Peggy is told to sum up and the call shows "1 minute
// left", and at 10:00 the app hangs up and shows the summary. When a call ends the server is told (callRef and
// ElevenLabs' conversation id), so a call paid with credits is settled from ElevenLabs' own length.

const clockNow = () => Date.now();

export function PeggyCallEngine() {
  return (
    <ConversationProvider>
      <Engine />
    </ConversationProvider>
  );
}

function Engine() {
  const t = useT("m_help");
  const { role } = useRole();
  const callRole: CallRole = role === "supplier" || role === "logistics_partner" ? role : "seller";
  const state = usePeggyCall();
  const conversationId = useRef<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [toast, setToast] = useState<{ key: number; text: string } | null>(null);
  const savedLine = useSavedLine();
  const roleRef = useRef<CallRole>(callRole);
  useEffect(() => {
    roleRef.current = callRole;
  });
  const limit = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // This call: its reference (for settling), cap and the credits held.
  const callInfo = useRef<{ ref: string | null; maxSeconds: number; held: number; connectedAt: number | null }>({ ref: null, maxSeconds: PAID_CALL_MAX_SECONDS, held: 0, connectedAt: null });
  const [warning, setWarning] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Peggy hangs up when they're done. Her end_call tool ends the call from ElevenLabs' side (reason "agent"); as a
  // safety net the app also hangs up itself when they've said they're done and Peggy has said goodbye
  // (shared/peggy-goodbye.ts), once she has finished speaking. Either way the summary says Peggy ended the call.
  const lastUserLine = useRef("");
  const goodbye = useRef<{ pending: boolean; byPeggy: boolean; soon: ReturnType<typeof setTimeout> | null; fallback: ReturnType<typeof setTimeout> | null }>({ pending: false, byPeggy: false, soon: null, fallback: null });
  const clearGoodbyeTimers = () => {
    if (goodbye.current.soon) clearTimeout(goodbye.current.soon);
    if (goodbye.current.fallback) clearTimeout(goodbye.current.fallback);
    goodbye.current.soon = null;
    goodbye.current.fallback = null;
  };
  const cancelGoodbye = () => {
    clearGoodbyeTimers();
    goodbye.current.pending = false;
  };
  const hangUpForPeggy = () => {
    if (!goodbye.current.pending) return;
    clearGoodbyeTimers();
    goodbye.current.byPeggy = true;
    void conversationRef.current.endSession();
  };
  const armGoodbye = () => {
    clearGoodbyeTimers();
    goodbye.current.pending = true;
    // If the app never hears that she stopped talking, it still hangs up a little later (unless she's still talking).
    goodbye.current.fallback = setTimeout(() => (conversationRef.current.isSpeaking ? null : hangUpForPeggy()), HANG_UP_FALLBACK_MS);
  };

  const conversation = useConversation({
    onConnect: ({ conversationId: id }: { conversationId: string }) => {
      conversationId.current = id;
      const now = clockNow();
      setStartedAt(now);
      setWarning(false);
      callInfo.current = { ...callInfo.current, connectedAt: now };
      patchCall({ phase: "live" });
      // 9:00: "1 minute left" (Peggy sums up); 10:00: the app hangs up (ElevenLabs ends it then on its side too).
      const { warnAt, endAt } = callTimeline(callInfo.current.maxSeconds);
      if (warnTimer.current) clearTimeout(warnTimer.current);
      warnTimer.current = setTimeout(() => {
        setWarning(true);
        try {
          conversationRef.current.sendContextualUpdate(ONE_MINUTE_LEFT_NOTE);
        } catch {
          // The banner still shows.
        }
      }, warnAt * 1000);
      if (limit.current) clearTimeout(limit.current);
      limit.current = setTimeout(() => void conversationRef.current.endSession(), endAt * 1000);
    },
    onMessage: ({ message, source }: { message: string; source: "user" | "ai" }) => {
      if (source === "user") {
        lastUserLine.current = message;
        // They said something after her goodbye: the call carries on.
        cancelGoodbye();
      } else if (shouldHangUp(lastUserLine.current, message)) {
        armGoodbye();
      }
    },
    onModeChange: ({ mode }: { mode: "speaking" | "listening" }) => {
      if (!goodbye.current.pending) return;
      if (goodbye.current.soon) clearTimeout(goodbye.current.soon);
      goodbye.current.soon = mode === "listening" ? setTimeout(hangUpForPeggy, HANG_UP_AFTER_MS) : null;
    },
    onDisconnect: (details?: { reason?: string }) => {
      if (limit.current) clearTimeout(limit.current);
      if (warnTimer.current) clearTimeout(warnTimer.current);
      setStartedAt(null);
      setWarning(false);
      // Tell the server the call ended (it reads the length from ElevenLabs, never from here) and show what it used.
      const info = callInfo.current;
      callInfo.current = { ref: null, maxSeconds: PAID_CALL_MAX_SECONDS, held: 0, connectedAt: null };
      if (info.ref) {
        const atLimit = info.connectedAt !== null && (clockNow() - info.connectedAt) / 1000 >= info.maxSeconds - 2;
        patchCall({ lastCall: { atLimit, maxSeconds: info.maxSeconds, held: info.held, bill: null } });
        const ref = info.ref;
        void endCallSession(ref, conversationId.current)
          .then((result) => {
            if (result.settled && typeof result.charged === "number") {
              const last = callState().lastCall;
              if (last) patchCall({ lastCall: { ...last, bill: { charged: result.charged, refunded: result.refunded ?? 0, minutes: result.minutes ?? 0 } } });
            }
            checkCallsAvailable(true);
          })
          .catch(() => null);
      }
      const current = callState();
      // Peggy ended it: her end_call (reason "agent"), the app hanging up after her goodbye, or the line closing
      // right after her goodbye (LiveKit can report that as an error).
      const peggyEnded = goodbye.current.byPeggy || (goodbye.current.pending && details?.reason !== "user");
      cancelGoodbye();
      goodbye.current.byPeggy = false;
      lastUserLine.current = "";
      const endedBy = peggyEnded ? "agent" : details?.reason === "agent" || details?.reason === "user" || details?.reason === "error" ? details.reason : null;
      // A call that never connected just closes; one that did (also when Peggy hung up) shows what Peggy saved.
      if (current.phase === "live" || current.saved.length) patchCall({ phase: "summary", minimized: false, endedBy });
      else if (current.phase === "connecting") patchCall({ phase: "idle", minimized: false });
    },
    onError: () => patchCall({ error: t("call.dropped") }),
  });
  // useConversation hands back a new object on every render: keep the latest in a ref so start/end (and the controls
  // registered below) stay the same functions. Depending on it directly re-registered the controls on each render,
  // which re-rendered this component again: "Maximum update depth exceeded".
  const conversationRef = useRef(conversation);
  const tRef = useRef(t);
  useEffect(() => {
    conversationRef.current = conversation;
    tRef.current = t;
  });

  const showToast = useCallback((text: string) => {
    setToast({ key: Date.now(), text });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // open_screen: only allow-listed screens for this role. The call minimizes so the screen shows; nothing is pressed.
  const openScreen = useCallback(
    (params: Record<string, unknown>) => {
      const { screen, route, reply } = openScreenOnPhone(roleRef.current, params);
      if (!screen || !route) return reply;
      patchCall({ minimized: true });
      router.push(route as never);
      // Tips stay away from the screen she opened (lib/setup-gate.ts), and any open tip closes (LearnHost).
      notePeggyOpened();
      showToast(t("call.opened", { screen: t.dynamic(`call.screen.${screen.id}`, screen.name) }));
      return reply;
    },
    [showToast, t],
  );
  const openScreenRef = useRef(openScreen);
  useEffect(() => {
    openScreenRef.current = openScreen;
  });

  // Each other tool Peggy calls goes to the server with this person's sign-in; what it saved shows straight away.
  const clientTools = useMemo(
    () =>
      Object.fromEntries(
        CALL_TOOLS.map((tool) => [
          tool,
          async (params: Record<string, unknown>) => {
            if (tool === "open_screen") return openScreenRef.current(params ?? {});
            try {
              const result = await runCallTool(tool, params, conversationId.current);
              recordSaved(result.saved, result.status);
              return result.result;
            } catch (error) {
              return error instanceof ApiError && error.status === 429 ? "Not saved: too many saves today. Tell them to finish in the app." : "Not saved: something went wrong on our side. Tell them you've noted it and carry on.";
            }
          },
        ]),
      ),
    [],
  );

  const start = useCallback(async () => {
    const phase = callState().phase;
    if (phase === "connecting" || phase === "live") return patchCall({ minimized: false });
    patchCall({ phase: "connecting", minimized: false, saved: [], error: null, endedBy: null, lastCall: null });
    const mic = await requestRecordingPermissionsAsync().catch(() => null);
    if (!mic?.granted) return patchCall({ phase: "idle", error: tRef.current("call.micOff") });
    try {
      const [session, status] = await Promise.all([startCallSession(), fetchSetupView().catch(() => null)]);
      patchCall({ status });
      callInfo.current = { ref: session.callRef ?? null, maxSeconds: session.maxSeconds ?? PAID_CALL_MAX_SECONDS, held: session.heldCredits ?? 0, connectedAt: null };
      conversationRef.current.startSession({ conversationToken: session.conversationToken, connectionType: "webrtc", dynamicVariables: session.dynamicVariables, clientTools });
      // The agent ends calls at its own maximum (10 minutes on free plans); the app's own timer starts when it connects.
      // This is the safety net for a call that connects late.
      if (limit.current) clearTimeout(limit.current);
      limit.current = setTimeout(() => conversationRef.current.endSession(), (callInfo.current.maxSeconds + 45) * 1000);
      // A call that never connects gives up after 30 seconds, so the button works again.
      setTimeout(() => {
        if (callState().phase !== "connecting") return;
        conversationRef.current.endSession();
        patchCall({ phase: "idle", minimized: false, error: tRef.current("call.failed") });
      }, 30_000);
    } catch (error) {
      // Shown under the button the call was started from.
      patchCall({ phase: "idle", error: error instanceof ApiError && error.message ? error.message : tRef.current("call.failed") });
    }
  }, [clientTools]);

  const end = useCallback(() => {
    const phase = callState().phase;
    if (phase === "connecting" || phase === "live") conversationRef.current.endSession();
  }, []);

  // Registered once: start and end are stable (see conversationRef).
  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  });
  useEffect(() => {
    setCallControls({ start: () => void startRef.current(), end });
    return () => setCallControls(null);
  }, [end]);

  // A toast for each save while the call is minimized (open, the call lists it).
  usePeggySaved(() => {
    const current = callState();
    const last = current.saved[current.saved.length - 1];
    if (!current.minimized || !last) return;
    showToast(savedLine(last));
  });
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (limit.current) clearTimeout(limit.current);
      if (warnTimer.current) clearTimeout(warnTimer.current);
      if (goodbye.current.soon) clearTimeout(goodbye.current.soon);
      if (goodbye.current.fallback) clearTimeout(goodbye.current.fallback);
    },
    [],
  );

  const call = { phase: state.phase, speaking: conversation.isSpeaking, muted: conversation.isMuted, startedAt, saved: state.saved, status: state.status, error: state.error, maxSeconds: callInfo.current.maxSeconds, warning, paid: callInfo.current.held > 0 };
  const onMute = () => conversation.setMuted(!conversation.isMuted);

  if (state.phase === "summary") {
    const next = state.status?.next ?? null;
    const close = () => patchCall({ phase: "idle", saved: [] });
    return (
      <CallSummary
        saved={state.saved}
        status={state.status}
        endedByPeggy={state.endedBy === "agent"}
        lastCall={state.lastCall}
        editPathOf={(item) => editPath(callRole, item.kind)}
        nextLabel={next ? t.dynamic(stepKey(next), next) : null}
        onEdit={(path) => {
          close();
          router.push(path as never);
        }}
        onContinue={() => {
          close();
          // The setup screen behind takes it to its own next step; otherwise open the next missing step's screen.
          if (runContinue(state.status)) return;
          const path = nextStepPath(callRole, next);
          if (path) router.push(path as never);
        }}
        onClose={close}
      />
    );
  }
  if (state.phase === "idle") return null;
  if (!state.minimized) return <CallSheet call={call} onMinimize={() => patchCall({ minimized: true })} onMute={onMute} onEnd={end} />;
  // The latest "Peggy opened …" / "Peggy saved …" line shows inside the bar, never over the screen she opened.
  return <CallBar call={call} note={toast?.text ?? null} onOpen={() => patchCall({ minimized: false })} onMute={onMute} onEnd={end} />;
}
