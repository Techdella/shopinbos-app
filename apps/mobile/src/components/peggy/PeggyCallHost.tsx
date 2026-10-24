import { useEffect, type ComponentType } from "react";
import { useSession } from "@/lib/session";
import { callsPossibleHere, checkCallsAvailable } from "@/lib/peggy-call";

// Mounted once in app/_layout.tsx, next to the screens: the "Call Peggy" call lives here, so it carries on (minimized
// to a small bar) while people move around the app. The call engine needs native WebRTC, which only EAS builds have:
// in Expo Go (and the web build) it's never loaded and every "Call Peggy" button hides itself.

function loadEngine(): ComponentType | null {
  if (!callsPossibleHere()) return null;
  try {
    // Loaded only here: importing the SDK starts LiveKit's native WebRTC module, which Expo Go doesn't have.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require("./PeggyCallEngine") as typeof import("./PeggyCallEngine")).PeggyCallEngine;
  } catch (error) {
    console.warn("[peggy-call] in-app calls unavailable", error);
    return null;
  }
}

const Engine = loadEngine();

export function PeggyCallHost() {
  const { session } = useSession();
  const signedIn = Boolean(session);
  useEffect(() => {
    if (signedIn) checkCallsAvailable(true);
  }, [signedIn]);
  return signedIn && Engine ? <Engine /> : null;
}
