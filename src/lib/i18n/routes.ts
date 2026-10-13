import { ROUTE_NAMESPACES } from "./route-namespaces.generated";

// Which message namespaces the page at a path needs (see scripts/i18n-route-namespaces.mjs). The root layout sends
// only these to the browser; anything else a later client-side navigation needs is loaded then.

/** Words every page can show without loading anything: buttons, menus, the shell. */
export const CORE_NAMESPACES = ["common", "nav", "shell", "ui", "settings"] as const;

type Pattern = { segments: string[]; namespaces: readonly string[] };

const PATTERNS: Pattern[] = ROUTE_NAMESPACES.map(([route, namespaces]) => ({ segments: route.split("/").filter(Boolean), namespaces }));

function matches(pattern: string[], path: string[]) {
  for (let i = 0; i < pattern.length; i++) {
    const part = pattern[i]!;
    if (/^\[\[\.\.\..+\]\]$/.test(part)) return true; // [[...rest]]: zero or more
    if (/^\[\.\.\..+\]$/.test(part)) return path.length > i; // [...rest]: one or more
    if (i >= path.length) return false;
    if (/^\[.+\]$/.test(part)) continue; // [id]: any one segment
    if (part !== path[i]) return false;
  }
  return pattern.length === path.length;
}

/** Static segments beat dynamic ones, so /home/orders/new wins over /home/orders/[id]. */
function score(pattern: string[]) {
  return pattern.reduce((total, part) => total * 3 + (part.startsWith("[") ? (part.startsWith("[...") || part.startsWith("[[") ? 0 : 1) : 2), 0);
}

export function namespacesForPath(pathname: string | null | undefined): string[] {
  const path = (pathname ?? "").split(/[?#]/)[0]!.split("/").filter(Boolean).map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
  let best: Pattern | null = null;
  let bestScore = -1;
  for (const pattern of PATTERNS) {
    if (!matches(pattern.segments, path)) continue;
    const s = score(pattern.segments) + pattern.segments.length * 1e6;
    if (s > bestScore) {
      best = pattern;
      bestScore = s;
    }
  }
  return [...new Set<string>([...CORE_NAMESPACES, ...(best?.namespaces ?? [])])];
}
