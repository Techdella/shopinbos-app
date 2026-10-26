import { useEffect, type ComponentType, type ReactNode } from "react";
import { View } from "react-native";
import { useSession } from "@/lib/session";
import { callBarShown, callsPossibleHere, checkCallsAvailable, usePeggyCall } from "@/lib/peggy-call";
import { colors } from "@/theme";
import { CALL_BAR_HEIGHT } from "./PeggyCallViews";

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

/**
 * Wraps the screens (app/_layout.tsx): while the call is minimized they end CALL_BAR_HEIGHT above the bottom, so the
 * call bar sits in its own strip under the tab bar and never covers a screen, its buttons or the "+". The bar's
 * safe-area padding only overlaps each screen's own bottom inset padding, which is empty.
 */
export function CallSpace({ children }: { children: ReactNode }) {
  const shown = callBarShown(usePeggyCall());
  return <View style={{ flex: 1, backgroundColor: colors.canvas, paddingBottom: shown ? CALL_BAR_HEIGHT : 0 }}>{children}</View>;
}

export function PeggyCallHost() {
  const { session } = useSession();
  const signedIn = Boolean(session);
  useEffect(() => {
    if (signedIn) checkCallsAvailable(true);
  }, [signedIn]);
  return signedIn && Engine ? <Engine /> : null;
}
