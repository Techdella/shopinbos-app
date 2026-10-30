import type React from "react";
import { richRunStyle, richRunsFor } from "@shared/rich-text";

// Draws a section's words with the formatting the phone's text toolbar gave them (shared/rich-text.ts): bold, a size
// and a colour per run, as <span>s with a style object. Never HTML: the words are React text, and the runs are
// re-checked here (they must spell exactly the words shown, with whitelisted styles), so anything odd in a saved
// draft just shows the plain words. Without formatting this returns the plain string, unchanged.

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
