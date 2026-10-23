import React from "react";

// React 19 crashes ("TypeError: i is not a function") when an effect returns something other than a cleanup function
// or nothing, e.g. null: in production it calls whatever came back when the component unmounts. Our own effects are
// typed and checked (tests/effect-guard.test.mjs), but a library's can still do it, and it took down whole pages on
// navigation. This wraps useEffect and useLayoutEffect once, before the app loads: a bad return is dropped (no
// cleanup) and reported to Admin › App errors with the effect's source, so it can be fixed at the root.

type Report = (error: Error) => void;
type EffectHook = (create: () => unknown, deps?: readonly unknown[]) => void;

const GUARDED = Symbol.for("shopinbos.effectGuard");

/** The value an effect may return: undefined or a function. Anything else becomes undefined (and is reported). */
export function safeCleanup(value: unknown, create: () => unknown, report: Report) {
  if (value === undefined || typeof value === "function") return value as (() => void) | undefined;
  report(new Error(`An effect returned ${value === null ? "null" : typeof value} instead of a cleanup function: ${String(create).replace(/\s+/g, " ").slice(0, 300)}`));
  return undefined;
}

export function guardEffects(report: Report, target: Record<string, unknown> = React as unknown as Record<string, unknown>) {
  for (const name of ["useEffect", "useLayoutEffect"] as const) {
    const original = target[name] as (EffectHook & { [GUARDED]?: true }) | undefined;
    if (typeof original !== "function" || original[GUARDED]) continue;
    const guarded: EffectHook & { [GUARDED]?: true } = (create, deps) => original(() => safeCleanup(create(), create, report), deps);
    guarded[GUARDED] = true;
    try {
      target[name] = guarded;
    } catch {
      // A frozen module: nothing to do.
    }
  }
}
