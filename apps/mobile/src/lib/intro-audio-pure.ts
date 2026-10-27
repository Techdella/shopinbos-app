// The one place that stops every sound the tips make: the 60-second intros' narrator and music (useIntroSound), the
// getting-started videos (StoryViewer) and the help videos (HelpVideoPlayer, /video/[id]). Each player registers a
// stop while it's mounted; the guard calls them all when the app leaves the foreground or a Peggy call starts, and
// says whether sound may play right now (never in the background, never during a call). Pure (no React Native), so
// tests can drive it; lib/intro-audio.ts wires it to AppState and the call store.

export type StopReason = "close" | "background" | "call" | "blur";
export type CallPhaseLike = "idle" | "connecting" | "live" | "summary";

export function createAudioGuard() {
  const stops = new Set<(reason: StopReason) => void>();
  let appActive = true;
  let onCall = false;

  /** Stops every registered player (each stop is safe to call twice). */
  function stopAll(reason: StopReason) {
    for (const stop of [...stops]) {
      try {
        stop(reason);
      } catch {
        // A player that's already gone: nothing to stop.
      }
    }
  }

  return {
    /** Adds a player's stop; returns the unregister. */
    register(stop: (reason: StopReason) => void) {
      stops.add(stop);
      return () => {
        stops.delete(stop);
      };
    },
    stopAll,
    /** AppState changed: anything but "active" (background, inactive) stops all sound. */
    appStateChanged(state: string) {
      appActive = state === "active";
      if (!appActive) stopAll("background");
    },
    /** The Peggy call's phase changed: connecting or live stops all sound and keeps it off until the call ends. */
    callPhaseChanged(phase: CallPhaseLike) {
      const was = onCall;
      onCall = phase === "connecting" || phase === "live";
      if (onCall && !was) stopAll("call");
    },
    /** Whether a tip may make sound now: the app is in front and no call is on. */
    allowed: () => appActive && !onCall,
    /** How many players are registered (tests). */
    size: () => stops.size,
  };
}

export type AudioGuard = ReturnType<typeof createAudioGuard>;

/** The app's single guard. */
export const introAudio = createAudioGuard();
