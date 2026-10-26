import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { callState, subscribeCall } from "./peggy-call";
import { introAudio, type StopReason } from "./intro-audio-pure";

// Wires the tips' audio guard (intro-audio-pure.ts) to the app: AppState (background or inactive stops everything)
// and the Peggy call (a call starting stops everything). Started once from app/_layout.tsx (useIntroAudioGuard).
// Players register with useIntroAudioStop while they're mounted.

export { introAudio } from "./intro-audio-pure";

/** Mounted once at the root: stops all tip sound when the app goes to the background or a Peggy call starts. */
export function useIntroAudioGuard() {
  useEffect(() => {
    introAudio.appStateChanged(AppState.currentState ?? "active");
    const app = AppState.addEventListener("change", (state) => introAudio.appStateChanged(state));
    introAudio.callPhaseChanged(callState().phase);
    const unsubscribe = subscribeCall(() => introAudio.callPhaseChanged(callState().phase));
    return () => {
      app.remove();
      unsubscribe();
    };
  }, []);
}

/** Registers `stop` with the guard while the calling component is mounted (always the latest `stop`). */
export function useIntroAudioStop(stop: (reason: StopReason) => void) {
  const latest = useRef(stop);
  useEffect(() => {
    latest.current = stop;
  });
  useEffect(() => introAudio.register((reason) => latest.current(reason)), []);
}
