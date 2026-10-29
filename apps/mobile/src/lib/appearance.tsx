import "expo-sqlite/localStorage/install";
import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { Appearance, Platform, useColorScheme } from "react-native";
import { currentScheme, setColorScheme } from "@/theme";
import { APPEARANCE_KEY, parseAppearance, resolveScheme, storedAppearance, type AppearancePref, type Scheme } from "@/lib/appearance-pure";

// Settings > Appearance: Light, Dark or Auto (the default: follow the phone's setting). The choice is kept on the
// phone (expo-sqlite localStorage, like the language and tips). The live `colors` (theme.ts) take the scheme's
// palette in place and the AppearanceProvider redraws the app (app/_layout.tsx keys the screens on the scheme).

function readPref(): AppearancePref {
  try {
    return parseAppearance(globalThis.localStorage?.getItem(APPEARANCE_KEY));
  } catch {
    return "auto";
  }
}

let prefNow = readPref();
const listeners = new Set<() => void>();

/** Native pieces (alerts, date pickers, the keyboard) follow the choice too; Auto hands them back to the phone. */
function tellNative(pref: AppearancePref) {
  if (Platform.OS === "web") return;
  try {
    Appearance.setColorScheme?.(pref === "auto" ? "unspecified" : pref);
  } catch {
    // Older React Native: the native pieces keep following the phone.
  }
}

// Before the first screen draws: the saved choice (or the phone's setting), so the app never flashes the other scheme.
tellNative(prefNow);
setColorScheme(resolveScheme(prefNow, Appearance.getColorScheme()));

export function getAppearance(): AppearancePref {
  return prefNow;
}

export function setAppearance(pref: AppearancePref) {
  if (pref === prefNow) return;
  prefNow = pref;
  try {
    const stored = storedAppearance(pref);
    if (stored) globalThis.localStorage?.setItem(APPEARANCE_KEY, stored);
    else globalThis.localStorage?.removeItem(APPEARANCE_KEY);
  } catch {
    // No storage: the choice holds until the app closes.
  }
  tellNative(pref);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The saved choice: "auto", "light" or "dark". */
export function useAppearance(): AppearancePref {
  return useSyncExternalStore(subscribe, getAppearance, getAppearance);
}

const SchemeContext = createContext<Scheme>(currentScheme());

/** The scheme drawn now ("light" or "dark"). Reading it redraws the component when the scheme changes. */
export function useScheme(): Scheme {
  return useContext(SchemeContext);
}

/** Works out the scheme (the choice, or the phone's on Auto), swaps the live colours and hands it down. */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const pref = useAppearance();
  const phone = useColorScheme();
  const scheme = resolveScheme(pref, phone);
  // Swapped while rendering so every child below draws with the new palette in this same pass (idempotent).
  if (scheme !== currentScheme()) setColorScheme(scheme);
  return <SchemeContext.Provider value={scheme}>{children}</SchemeContext.Provider>;
}
