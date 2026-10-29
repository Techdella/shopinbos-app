// Settings > Appearance: Light, Dark or Auto (follow the phone). Pure helpers, no React Native imports, so the tests
// load this file directly (tests/mobile-appearance.test.mjs).

export type AppearancePref = "light" | "dark" | "auto";
export type Scheme = "light" | "dark";

export const APPEARANCE_PREFS: readonly AppearancePref[] = ["auto", "light", "dark"];

/** Where the choice is kept on the phone (expo-sqlite localStorage, like the language and tips). */
export const APPEARANCE_KEY = "shopinbos.appearance";

/** A saved value back to a choice; anything missing or unknown is Auto (the default). */
export function parseAppearance(raw: unknown): AppearancePref {
  return raw === "light" || raw === "dark" || raw === "auto" ? raw : "auto";
}

/** What to keep on the phone: nothing for Auto (the default), so clearing it is the same as choosing Auto. */
export function storedAppearance(pref: AppearancePref): string | null {
  return pref === "auto" ? null : pref;
}

/** The scheme to draw: the choice, or the phone's setting on Auto (light when the phone doesn't say). */
export function resolveScheme(pref: AppearancePref, phone: string | null | undefined): Scheme {
  if (pref === "light" || pref === "dark") return pref;
  return phone === "dark" ? "dark" : "light";
}

/**
 * Copies `palette` into `target` in place. The phone app's `colors` is one live object read while screens draw, so a
 * scheme change is this copy plus a redraw (lib/appearance.tsx). Returns whether any value changed.
 */
export function applyPalette<P extends Record<string, string>>(target: P, palette: P): boolean {
  let changed = false;
  for (const key of Object.keys(palette) as (keyof P)[]) {
    if (target[key] !== palette[key]) {
      target[key] = palette[key];
      changed = true;
    }
  }
  return changed;
}

/**
 * A module-level value built from `colors` (a table of tones at the top of a file) that follows the scheme: `build`
 * runs again the first time the value is read after a scheme change. Reads, `Object.keys`, spreads and iteration work
 * as on a plain object or array.
 */
export function createThemed(getVersion: () => number) {
  return function themed<V extends object>(build: () => V): V {
    let version = getVersion();
    let value = build();
    const current = (): V => {
      const now = getVersion();
      if (now !== version) {
        version = now;
        value = build();
      }
      return value;
    };
    const target = (Array.isArray(value) ? [] : {}) as V;
    return new Proxy(target, {
      get: (_target, key) => {
        const live = current();
        const read = Reflect.get(live, key, live);
        return typeof read === "function" ? read.bind(live) : read;
      },
      has: (_target, key) => Reflect.has(current(), key),
      ownKeys: () => Reflect.ownKeys(current()),
      getOwnPropertyDescriptor: (_target, key) => {
        const descriptor = Reflect.getOwnPropertyDescriptor(current(), key);
        // An array's `length` can't be reported as configurable; everything else is (the proxy target is empty).
        return descriptor && key !== "length" ? { ...descriptor, configurable: true } : descriptor;
      },
      set: () => false,
    });
  };
}

// WCAG 2 contrast, for the tests and for picking text on a fill.
function channel(value: number) {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
