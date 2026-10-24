import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { router } from "expo-router";
import { requestRecordingPermissionsAsync } from "expo-audio";
import { ConversationProvider, useConversation } from "@elevenlabs/react-native";
import { ApiError } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { callState, fetchSetupView, patchCall, recordSaved, runCallTool, runContinue, setCallControls, startCallSession, usePeggyCall, usePeggySaved} from "@/lib/peggy-call";
import { CALL_TOOLS, editPath, nextStepPath, openScreenOnPhone, stepKey, type CallRole } from "@/lib/peggy-call-pure";
import { useRole } from "@/lib/role";
import { CallBar, CallSheet, CallSummary, SavedToast, useSavedLine } from "./PeggyCallViews";

// "Call Peggy" inside the app: ElevenLabs' React Native SDK (WebRTC through LiveKit's native modules), so this file
// is only loaded in builds that have them (EAS builds, never Expo Go: PeggyCallHost decides). The server gives a
// conversation token and the person's details (POST /api/mobile/peggy-call); Peggy's client tools save to the
// account through POST /api/mobile/peggy-call/action with the person's own sign-in, and each save shows as a line
// in the call, a toast while minimized, and ticks on the setup screens behind (lib/peggy-call.ts store). After the
// call: "Here's what Peggy saved", with Edit links, then the next setup step that's still missing. Peggy can end the
// call herself (ElevenLabs' end_call: the same summary, "Peggy ended the call"), and open screens while she talks
// (open_screen, run here: an allow-listed route for the role, shared/peggy-screens.ts; the call minimizes so the
// screen shows, with a "Peggy opened Delivery" toast). get_dashboard and the saving tools go to the server.

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
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const conversation = useConversation({
    onConnect: ({ conversationId: id }: { conversationId: string }) => {
      conversationId.current = id;
      setStartedAt(clockNow());
      patchCall({ phase: "live" });
    },
    onDisconnect: (details?: { reason?: string }) => {
      if (limit.current) clearTimeout(limit.current);
      setStartedAt(null);
      const current = callState();
      const endedBy = details?.reason === "agent" || details?.reason === "user" || details?.reason === "error" ? details.reason : null;
      // A call that never connected just closes; one that did (also when Peggy hung up) shows what Peggy saved.
      if (current.phase === "live" || current.saved.length) patchCall({ phase: "summary", minimized: false, endedBy });
      else if (current.phase === "connecting") patchCall({ phase: "idle", minimized: false });
    },
    onError: () => patchCall({ error: t("call.dropped") }),
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
    patchCall({ phase: "connecting", minimized: false, saved: [], error: null, endedBy: null });
    const mic = await requestRecordingPermissionsAsync().catch(() => null);
    if (!mic?.granted) return patchCall({ phase: "idle", error: t("call.micOff") });
    try {
      const [session, status] = await Promise.all([startCallSession(), fetchSetupView().catch(() => null)]);
      patchCall({ status });
      conversation.startSession({ conversationToken: session.conversationToken, connectionType: "webrtc", dynamicVariables: session.dynamicVariables, clientTools });
      // The agent ends calls at its own maximum; this is a safety net a little after it.
      if (limit.current) clearTimeout(limit.current);
      limit.current = setTimeout(() => conversation.endSession(), ((session.maxSeconds ?? 900) + 15) * 1000);
      // A call that never connects gives up after 30 seconds, so the button works again.
      setTimeout(() => {
        if (callState().phase !== "connecting") return;
        conversation.endSession();
        patchCall({ phase: "idle", minimized: false, error: t("call.failed") });
      }, 30_000);
    } catch (error) {
      // Shown under the button the call was started from.
      patchCall({ phase: "idle", error: error instanceof ApiError && error.message ? error.message : t("call.failed") });
    }
  }, [clientTools, conversation, t]);

  const end = useCallback(() => {
    const phase = callState().phase;
    if (phase === "connecting" || phase === "live") conversation.endSession();
  }, [conversation]);

  useEffect(() => {
    setCallControls({ start: () => void start(), end });
    return () => setCallControls(null);
  }, [start, end]);

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
    },
    [],
  );

  const call = { phase: state.phase, speaking: conversation.isSpeaking, muted: conversation.isMuted, startedAt, saved: state.saved, status: state.status, error: state.error };
  const onMute = () => conversation.setMuted(!conversation.isMuted);

  if (state.phase === "summary") {
    const next = state.status?.next ?? null;
    const close = () => patchCall({ phase: "idle", saved: [] });
    return (
      <CallSummary
        saved={state.saved}
        status={state.status}
        endedByPeggy={state.endedBy === "agent"}
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
  return (
    <>
      <CallBar call={call} onOpen={() => patchCall({ minimized: false })} onMute={onMute} onEnd={end} />
      <SavedToast key={toast?.key} text={toast?.text ?? null} />
    </>
  );
}
