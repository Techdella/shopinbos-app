// Formatted words in a store section (the phone editor's text toolbar, design SE-04): a word or a few in bold, a
// size (S / M / L / XL) or a colour. Never HTML. A section's words stay plain strings in its copy block (copy.title,
// copy.body, …), so every plain-text reader (search titles and descriptions, previews, Rex, the web builder, emails)
// keeps working untouched. The formatting sits beside them in copy.richText[key] as "runs": pieces of the same words,
// each with a whitelisted style. The storefront draws runs as React <span>s with a style object (never
// dangerouslySetInnerHTML), and only when the runs spell exactly the plain words: change the words somewhere that
// doesn't know about runs (the web builder, Rex) and the formatting simply falls away, never the words.
//
// Sanitised on the server when a draft is saved (sanitizeSnapshotRich) and again where it is drawn (richRunsFor), so a
// hand-made request can't smuggle anything in: only text, bold, one of four sizes and a theme colour or #RRGGBB.
// Pure, no imports: the tests load it with Node's type stripping (tests/store-editor-extras.test.mjs).

export type RichSize = "s" | "m" | "l" | "xl";

export interface RichRun {
  text: string;
  bold?: boolean;
  size?: RichSize;
  /** "theme:accent" | "theme:ink" | "theme:muted" | "theme:cta" (follows the shop's theme) or "#RRGGBB". */
  color?: string;
}

/** Where a section keeps its formatting, beside its plain words in the copy block. */
export const RICH_KEY = "richText";

/** The four sizes, as a share of the words' own size (so a headline's L is bigger than a paragraph's L). */
export const RICH_SIZES: Record<RichSize, number> = { s: 0.8, m: 1, l: 1.25, xl: 1.5 };
export const RICH_SIZE_ORDER: RichSize[] = ["s", "m", "l", "xl"];

/** The shop's own colours (they follow a theme change) and a few fixed ones (SE-04's colour dot). */
export const RICH_THEME_COLORS = ["theme:accent", "theme:ink", "theme:muted", "theme:cta"] as const;
export const RICH_FIXED_COLORS = ["#FFFFFF", "#16141F", "#E86A4F", "#F2A93B", "#2E7E78", "#1F4FD8", "#6B4F8A", "#D6336C"] as const;

const MAX_RUNS = 200;
const MAX_TEXT = 4000;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** A colour we draw: one of the theme names or a 6-digit hex (upper-cased). Anything else is null. */
export function safeRichColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if ((RICH_THEME_COLORS as readonly string[]).includes(clean)) return clean;
  return /^#[0-9a-f]{6}$/i.test(clean) ? clean.toUpperCase() : null;
}

export function safeRichSize(value: unknown): RichSize | null {
  return typeof value === "string" && (RICH_SIZE_ORDER as string[]).includes(value) ? (value as RichSize) : null;
}

const sameStyle = (a: RichRun, b: RichRun) => Boolean(a.bold) === Boolean(b.bold) && (a.size ?? "m") === (b.size ?? "m") && (a.color ?? "") === (b.color ?? "");

/** One clean run: only the whitelisted fields, defaults dropped (M size, not bold, no colour). */
function cleanRun(raw: unknown): RichRun | null {
  if (!isRecord(raw) || typeof raw.text !== "string") return null;
  const run: RichRun = { text: raw.text };
  if (raw.bold === true) run.bold = true;
  const size = safeRichSize(raw.size);
  if (size && size !== "m") run.size = size;
  const color = safeRichColor(raw.color);
  if (color) run.color = color;
  return run;
}

/** Joins neighbours with the same style and drops empty pieces. */
export function normalizeRuns(runs: RichRun[]): RichRun[] {
  const out: RichRun[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const last = out[out.length - 1];
    if (last && sameStyle(last, run)) last.text += run.text;
    else out.push({ ...run });
  }
  return out;
}

export const runsText = (runs: RichRun[]) => runs.map((run) => run.text).join("");

/** Nothing formatted: no need to keep runs at all. */
export const isPlainRuns = (runs: RichRun[]) => runs.every((run) => !run.bold && !run.size && !run.color);

/**
 * Runs we accept: an array of whitelisted runs, at most 200, joined where they can be. With `plain`, they must spell
 * exactly those words (else null: the plain words win). Null for anything else, or when nothing is formatted.
 */
export function sanitizeRuns(raw: unknown, plain?: string): RichRun[] | null {
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_RUNS) return null;
  const runs: RichRun[] = [];
  for (const entry of raw) {
    const run = cleanRun(entry);
    if (!run) return null;
    runs.push(run);
  }
  const joined = normalizeRuns(runs);
  const words = runsText(joined);
  if (!words || words.length > MAX_TEXT) return null;
  if (plain !== undefined && words !== plain) return null;
  return isPlainRuns(joined) ? null : joined;
}

/** The formatting to draw for copy[key]: sanitised runs that spell the words shown, else null (draw plain words). */
export function richRunsFor(copy: Record<string, unknown> | null | undefined, key: string, shown: string): RichRun[] | null {
  const map = copy?.[RICH_KEY];
  if (!isRecord(map)) return null;
  return sanitizeRuns(map[key], shown);
}

/** The plain words of anything that might hold runs (a string, runs, or neither). */
export function plainText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((entry) => (isRecord(entry) && typeof entry.text === "string" ? entry.text : "")).join("");
  return "";
}

/** Splits runs at a character offset (so a format can start or end mid-run). */
function splitAt(runs: RichRun[], at: number): RichRun[] {
  const out: RichRun[] = [];
  let pos = 0;
  for (const run of runs) {
    const end = pos + run.text.length;
    if (at > pos && at < end) {
      out.push({ ...run, text: run.text.slice(0, at - pos) }, { ...run, text: run.text.slice(at - pos) });
    } else out.push({ ...run });
    pos = end;
  }
  return out;
}

export interface RichPatch {
  /** true / false, or "toggle": bold unless the whole selection already is. */
  bold?: boolean | "toggle";
  size?: RichSize;
  /** A colour, or null for the words' own colour. */
  color?: string | null;
}

/** The style of the selected words: bold only when all are, size and colour when they share one. */
export function formatAt(runs: RichRun[] | null, start: number, end: number): { bold: boolean; size: RichSize; color: string | null } {
  const list = runs ?? [];
  let pos = 0;
  const hit: RichRun[] = [];
  const caret = start === end;
  for (const run of list) {
    const runEnd = pos + run.text.length;
    if (caret ? start >= pos && start <= runEnd && (start < runEnd || run === list[list.length - 1]) : runEnd > start && pos < end) hit.push(run);
    pos = runEnd;
  }
  if (!hit.length) return { bold: false, size: "m", color: null };
  const sizes = new Set(hit.map((run) => run.size ?? "m"));
  const colors = new Set(hit.map((run) => run.color ?? ""));
  return {
    bold: hit.every((run) => run.bold),
    size: sizes.size === 1 ? ([...sizes][0] as RichSize) : "m",
    color: colors.size === 1 ? [...colors][0] || null : null,
  };
}

/**
 * Formats the words from `start` to `end` (character offsets in `plain`; an empty selection formats all of them).
 * `runs` are the words' runs now (null: none yet). Returns the new runs, or null when nothing is formatted any more.
 */
export function applyRichFormat(runs: RichRun[] | null, plain: string, start: number, end: number, patch: RichPatch): RichRun[] | null {
  const base = runs && runsText(runs) === plain ? runs.map((run) => ({ ...run })) : [{ text: plain }];
  let from = Math.max(0, Math.min(plain.length, Math.min(start, end)));
  let to = Math.max(0, Math.min(plain.length, Math.max(start, end)));
  if (from === to) {
    from = 0;
    to = plain.length;
  }
  if (!plain || from === to) return runs && runsText(runs) === plain ? sanitizeRuns(runs) : null;
  const bold = patch.bold === "toggle" ? !formatAt(base, from, to).bold : patch.bold;
  const pieces = splitAt(splitAt(base, from), to);
  let pos = 0;
  const next = pieces.map((run) => {
    const runStart = pos;
    pos += run.text.length;
    if (runStart < from || runStart >= to) return run;
    const out: RichRun = { ...run };
    if (bold !== undefined) {
      if (bold) out.bold = true;
      else delete out.bold;
    }
    if (patch.size) {
      if (patch.size === "m") delete out.size;
      else out.size = patch.size;
    }
    if (patch.color !== undefined) {
      const color = safeRichColor(patch.color);
      if (color) out.color = color;
      else delete out.color;
    }
    return out;
  });
  return sanitizeRuns(next);
}

/**
 * The words were changed (typed over): keeps the formatting of what stayed the same at the start and the end, and
 * gives new words the style of the word they were typed after. Null when nothing formatted is left.
 */
export function remapRuns(runs: RichRun[] | null, before: string, after: string): RichRun[] | null {
  if (!runs || runsText(runs) !== before) return null;
  if (before === after) return sanitizeRuns(runs);
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix += 1;
  // Each character's style, before.
  const styles: RichRun[] = [];
  for (const run of runs) for (let i = 0; i < run.text.length; i += 1) styles.push(run);
  const style = (run: RichRun | undefined): RichRun => ({ text: "", ...(run?.bold ? { bold: true } : {}), ...(run?.size ? { size: run.size } : {}), ...(run?.color ? { color: run.color } : {}) });
  const inserted = after.slice(prefix, after.length - suffix);
  const typedStyle = style(styles[prefix - 1] ?? styles[prefix]);
  const out: RichRun[] = [];
  for (let i = 0; i < prefix; i += 1) out.push({ ...style(styles[i]), text: after[i]! });
  if (inserted) out.push({ ...typedStyle, text: inserted });
  for (let i = before.length - suffix; i < before.length; i += 1) out.push({ ...style(styles[i]), text: before[i]! });
  return sanitizeRuns(normalizeRuns(out), after);
}

/** A copy block's richText map, cleaned against its plain words (keys whose runs don't fit are dropped). */
export function sanitizeRichMap(content: Record<string, unknown>): Record<string, RichRun[]> | null {
  const map = content[RICH_KEY];
  if (!isRecord(map)) return null;
  const out: Record<string, RichRun[]> = {};
  for (const [key, value] of Object.entries(map)) {
    if (key === RICH_KEY || typeof content[key] !== "string") continue;
    const runs = sanitizeRuns(value, content[key] as string);
    if (runs) out[key] = runs;
  }
  return Object.keys(out).length ? out : null;
}

/** Cleans the formatting of one copy block's content (returns the same object when there's none to clean). */
export function sanitizeCopyContent<T extends Record<string, unknown>>(content: T): T {
  if (!(RICH_KEY in content)) return content;
  const map = sanitizeRichMap(content);
  const next: Record<string, unknown> = { ...content };
  if (map) next[RICH_KEY] = map;
  else delete next[RICH_KEY];
  return next as T;
}

/** Every copy block in a draft, cleaned (the server runs this before saving a draft). */
export function sanitizeSnapshotRich<T>(snapshot: T): T {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.pages)) return snapshot;
  return {
    ...snapshot,
    pages: snapshot.pages.map((page) => {
      if (!isRecord(page) || !Array.isArray(page.sections)) return page;
      return {
        ...page,
        sections: page.sections.map((section) => {
          if (!isRecord(section) || !Array.isArray(section.blocks)) return section;
          return {
            ...section,
            blocks: section.blocks.map((block) => (isRecord(block) && block.type === "copy" && isRecord(block.content) ? { ...block, content: sanitizeCopyContent(block.content) } : block)),
          };
        }),
      };
    }),
  } as T;
}

/** The CSS a run is drawn with (React style object values; colours already checked). */
export function richRunStyle(run: RichRun, themeColor: (name: "accent" | "ink" | "muted" | "cta") => string | undefined): { fontWeight?: number; fontSize?: string; color?: string } {
  const style: { fontWeight?: number; fontSize?: string; color?: string } = {};
  if (run.bold) style.fontWeight = 800;
  if (run.size && run.size !== "m") style.fontSize = `${RICH_SIZES[run.size]}em`;
  const color = safeRichColor(run.color);
  if (color) {
    const resolved = color.startsWith("theme:") ? themeColor(color.slice(6) as "accent" | "ink" | "muted" | "cta") : color;
    if (resolved && /^#[0-9a-f]{3,8}$|^rgba?\([\d\s.,%]+\)$/i.test(resolved.trim())) style.color = resolved.trim();
  }
  return style;
}
