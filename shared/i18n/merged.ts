// Client-safe helpers for messages the server already merged (one language, English filling gaps). Kept apart from
// catalog.ts, which imports every namespace in every language: importing that in a client component would put the
// whole catalog in the browser bundle.
import type { Catalog } from "./index.ts";

/** One language's messages per namespace, with English filling the gaps: what the web server hands the browser. */
export type MergedMessages = Partial<Record<string, Record<string, string>>>;

/** Turns merged messages back into catalogs createT understands (English slot holds the merged text). */
export function catalogsFromMerged(messages: MergedMessages, namespaces: readonly string[]): Catalog[] {
  return namespaces.map((namespace) => ({ en: messages[namespace] ?? {} }));
}

/** One language's messages for a namespace, English filling gaps. */
export function mergeLocale(en: Record<string, string>, own: Record<string, string> | null | undefined): Record<string, string> {
  const merged: Record<string, string> = { ...en };
  for (const [key, text] of Object.entries(own ?? {})) if (typeof text === "string" && text) merged[key] = text;
  return merged;
}
