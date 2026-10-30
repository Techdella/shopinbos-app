import type React from "react";
import { richRunStyle, richRunsFor } from "@shared/rich-text";

// Draws a section's words with the formatting the text toolbar gave them (shared/rich-text.ts; the phone's toolbar
// and the web builder's): bold, a size and a colour per run, as <span>s with a style object. Never HTML: the words
// are React text, and the runs are re-checked here (they must spell exactly the words shown, with whitelisted
// styles), so anything odd in a saved draft just shows the plain words. Without formatting this returns the plain
// string, unchanged.

export type ThemeColorOf = (name: "accent" | "ink" | "muted" | "cta") => string | undefined;

export function richCopy(copy: Record<string, unknown> | null | undefined, key: string, shown: string, themeColor: ThemeColorOf): React.ReactNode {
  if (!shown) return shown;
  const runs = richRunsFor(copy, key, shown);
  if (!runs) return shown;
  return (
    <span data-inline-key={key} data-rich="">
      {runs.map((run, index) => {
        const style = richRunStyle(run, themeColor);
        return Object.keys(style).length ? <span key={index} style={style}>{run.text}</span> : <span key={index}>{run.text}</span>;
      })}
    </span>
  );
}

/** The shop's colours for "theme:…" runs, from a 2026 theme's (or a classic theme's) colour tokens. */
export function themeTone(tokens: { accent?: string; ink?: string; muted?: string; ctaBg?: string }): ThemeColorOf {
  return (name) => (name === "cta" ? tokens.ctaBg : name === "accent" ? tokens.accent : name === "ink" ? tokens.ink : tokens.muted);
}

/**
 * The words of copy[key] as shown (trimmed; `fallback` when there are none), with their formatting. The fallback
 * (a theme's default heading) never carries runs: the runs are kept for the seller's own words only.
 */
export function richWords(copy: Record<string, unknown> | null | undefined, key: string, themeColor: ThemeColorOf, fallback = ""): React.ReactNode {
  const own = typeof copy?.[key] === "string" ? (copy[key] as string).trim() : "";
  if (!own) return fallback;
  return richCopy(copy, key, own, themeColor);
}
