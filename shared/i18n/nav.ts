// Sidebar labels → "nav" catalog keys. src/lib/nav.ts keeps English labels (tests read them); the sidebar, top bar
// and search translate at render with navLabel(). Pure; tested in tests/i18n.test.mjs.
import type { TFunction } from "./index.ts";
import navEn from "./messages/nav/en.ts";

const ROLE_PREFIX: Record<string, string> = { seller: "", supplier: "supplier.", logistics_partner: "logistics.", admin: "admin." };
const EN = navEn as Record<string, string>;

/**
 * The nav catalog key for a menu item: "<role>.<id>" when the role has its own word, else "<id>", but only when
 * that key's English is this exact label (so an edited label shows in English instead of a stale translation).
 */
export function navLabelKey(role: string | null | undefined, id: string, label: string): string | null {
  const own = `${ROLE_PREFIX[role ?? "seller"] ?? ""}${id}`;
  if (EN[own] === label) return own;
  if (EN[id] === label) return id;
  return null;
}

/** The label in the person's language (English when there's no key for it yet). */
export function navLabel(t: Pick<TFunction, "dynamic">, role: string | null | undefined, item: { id: string; label: string }): string {
  const key = navLabelKey(role, item.id, item.label);
  return key ? t.dynamic(key, item.label) : item.label;
}

/** A sidebar group heading ("Sourcing", "People"…). */
export function navGroupLabel(t: Pick<TFunction, "dynamic">, group: { group: string; label?: string }): string {
  if (!group.label) return "";
  const key = `group.${group.group}`;
  return EN[key] === group.label ? t.dynamic(key, group.label) : group.label;
}
