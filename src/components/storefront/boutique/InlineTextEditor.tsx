"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { RICH_FIXED_COLORS, RICH_SIZE_ORDER, RICH_THEME_COLORS, formatAt, formatTyped, remapRuns, type RichPatch, type RichRun, type RichSize } from "@shared/rich-text";
import type { ThemeColorOf } from "../rich-copy";
import { englishText, type EditorText } from "../editor-text";

// Inline text editing in the store builder for the 2026 themes: click a heading, paragraph or label on the page and
// type over it. A text box is laid exactly over the words, in their own font, size and colour, so the page itself is
// never edited by the browser (React keeps drawing it); Enter or clicking away saves, Esc cancels.
// In the web builder a small text toolbar sits above the box (bold, size S/M/L/XL, colour), giving the selected words
// (or all of them) the same validated runs the phone's toolbar makes (shared/rich-text.ts): never HTML.

/** The section's words a click can edit, in the order they're matched against what was clicked. */
export const INLINE_COPY_KEYS = ["title", "body", "eyebrow", "summary", "primaryCta", "cta", "buttonLabel", "discountLabel", "faqTitle"] as const;
export type InlineCopyKey = (typeof INLINE_COPY_KEYS)[number];

const MAX_LENGTH: Record<InlineCopyKey, number> = { title: 140, body: 600, eyebrow: 60, summary: 300, primaryCta: 40, cta: 40, buttonLabel: 40, discountLabel: 40, faqTitle: 60 };

function isInlineKey(value: string | undefined): value is InlineCopyKey {
  return Boolean(value) && (INLINE_COPY_KEYS as readonly string[]).includes(value!);
}

const clean = (value: string) => value.replace(/\s+/g, " ").trim();

/**
 * Which of the section's words a clicked element shows: the element whose text is exactly one of them, or, for a
 * section still showing its default words, its heading (title) or first paragraph (body). Null: not editable here.
 */
export function inlineTargetFor(target: Element, section: Element, copy: Record<string, unknown>): { element: HTMLElement; key: InlineCopyKey } | null {
  for (let node: Element | null = target; node && node !== section; node = node.parentElement) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.closest("input, textarea, select, [data-inline-editor]")) return null;
    // Words that say which copy they show (data-inline-key), even while they show the default wording.
    if (isInlineKey(node.dataset.inlineKey)) {
      // Formatted words are drawn in a <span data-rich> inside the heading or paragraph; the box is laid over (and
      // hides) the heading itself, which stays on the page when the formatting is taken off again.
      const parent = node.parentElement;
      const holder = node.dataset.rich !== undefined && parent instanceof HTMLElement && parent !== section && parent.children.length === 1 && clean(parent.textContent ?? "") === clean(node.textContent ?? "") ? parent : node;
      return { element: holder, key: node.dataset.inlineKey };
    }
    // Only elements that hold just text (a heading, a paragraph, a button label), not whole cards.
    if (node.children.length > 2 || node.querySelector("img, svg, video, input")) continue;
    const shown = clean(node.textContent ?? "");
    if (!shown) continue;
    const exact = INLINE_COPY_KEYS.find((key) => typeof copy[key] === "string" && clean(copy[key] as string) === shown);
    if (exact) return { element: node, key: exact };
    if (/^H[1-3]$/.test(node.tagName) && !clean(String(copy.title ?? ""))) return { element: node, key: "title" };
    if (node.tagName === "P" && !clean(String(copy.body ?? "")) && section.querySelector("p") === node) return { element: node, key: "body" };
  }
  return null;
}

export interface InlineEdit {
  key: InlineCopyKey;
  element: HTMLElement;
  value: string;
}

/** The text toolbar's part: what the words are in the draft now and where formatted words go. */
export interface InlineFormatting {
  /** copy[key] as saved in the draft ("" while the section shows its default words). */
  saved: string;
  /** Its formatting in the draft (null: none). */
  runs: RichRun[] | null;
  /** The shop's colours, for the colour dots. */
  tone: ThemeColorOf;
  /** The builder's words (English when absent). */
  say?: EditorText;
  /** Words formatted: what they say now (cleaned) and their runs (null: no formatting left). Saved at once. */
  onFormat: (value: string, runs: RichRun[] | null) => void;
}

const SIZE_LABEL: Record<RichSize, string> = { s: "Small", m: "Medium", l: "Large", xl: "Extra large" };
const THEME_LABEL: Record<(typeof RICH_THEME_COLORS)[number], string> = { "theme:accent": "Shop colour", "theme:ink": "Dark text", "theme:muted": "Soft grey", "theme:cta": "Button colour" };

/** The text box laid over the words being edited (positioned inside the section wrapper). */
export function InlineTextEditor({ edit, container, onSave, onClose, format }: { edit: InlineEdit; container: HTMLElement; onSave: (value: string) => void; onClose: () => void; format?: InlineFormatting }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(edit.value);
  const [box, setBox] = useState<React.CSSProperties | null>(null);
  const done = useRef(false);
  // The formatting as last saved and the words it spells (the draft isn't re-read while typing).
  const formatted = useRef<{ base: string; runs: RichRun[] | null }>({ base: format?.saved ?? "", runs: format?.runs ?? null });
  const [selection, setSelection] = useState<{ start: number; end: number }>({ start: 0, end: edit.value.length });
  const [colours, setColours] = useState(false);

  useLayoutEffect(() => {
    const measure = () => {
      const el = edit.element;
      const r = el.getBoundingClientRect();
      const c = container.getBoundingClientRect();
      const cs = getComputedStyle(el);
      // The builder shrinks the page to fit (a CSS scale): screen sizes are divided back to page sizes, since the box
      // sits inside the scaled page (its font from getComputedStyle is already in page sizes).
      const scale = container.offsetWidth ? c.width / container.offsetWidth || 1 : 1;
      setBox({
        left: (r.left - c.left) / scale - 4,
        top: (r.top - c.top) / scale - 4,
        width: Math.max(r.width / scale + 8, 120),
        minHeight: r.height / scale + 8,
        // One by one: the `font` shorthand reads back empty in Chrome when the text uses font features.
        fontFamily: cs.fontFamily,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight as React.CSSProperties["fontWeight"],
        fontStyle: cs.fontStyle,
        letterSpacing: cs.letterSpacing,
        textTransform: cs.textTransform as React.CSSProperties["textTransform"],
        textAlign: cs.textAlign as React.CSSProperties["textAlign"],
        lineHeight: cs.lineHeight,
        color: cs.color,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [container, edit.element]);

  // The words underneath stay in place (so nothing jumps) but are hidden while the box is over them.
  useEffect(() => {
    const el = edit.element;
    const before = el.style.visibility;
    el.style.visibility = "hidden";
    return () => {
      el.style.visibility = before;
    };
  }, [edit.element]);

  useEffect(() => {
    const area = ref.current;
    if (!box || !area) return;
    area.focus();
    area.select();
  }, [box]);

  // Grows with the text so long paragraphs stay readable.
  useLayoutEffect(() => {
    const area = ref.current;
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${area.scrollHeight}px`;
  }, [value, box]);

  const say = format?.say ?? englishText;
  const state = format ? formatAt(remapRuns(formatted.current.runs, formatted.current.base, value), selection.start, selection.end) : null;

  const readSelection = () => {
    const area = ref.current;
    if (area) setSelection({ start: area.selectionStart ?? 0, end: area.selectionEnd ?? 0 });
  };

  const applyFormat = (patch: RichPatch) => {
    if (!format) return;
    const area = ref.current;
    const start = area?.selectionStart ?? selection.start;
    const end = area?.selectionEnd ?? selection.end;
    const runs = formatTyped(formatted.current.runs, formatted.current.base, value, start, end, patch);
    // Saved with the words as they're kept (spaces tidied), so the draft's words and runs always match.
    const tidy = clean(value);
    const kept = tidy === value ? runs : remapRuns(runs, value, tidy);
    formatted.current = { base: value, runs };
    format.onFormat(tidy, kept);
    setSelection({ start, end });
    area?.focus();
  };

  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    const next = clean(value);
    if (save && next && next !== clean(edit.value)) onSave(next);
    onClose();
  };

  if (!box) return null;
  const keep = (event: React.MouseEvent) => {
    // Pressing a button mustn't take the typing away from the text box (nor its selection).
    event.preventDefault();
    event.stopPropagation();
  };
  const toolbar = format && state ? (
    <div
      data-inline-editor
      role="toolbar"
      aria-label={say("Text style")}
      onMouseDown={keep}
      onClick={(event) => event.stopPropagation()}
      className="absolute z-30 flex items-center gap-1 rounded-full border border-[#E4E2EA] bg-white p-1 text-[#16141F] shadow-[0_8px_24px_rgba(22,20,31,.18)]"
      style={{ left: Math.max(0, Number(box.left) || 0), top: Math.max(-6, (Number(box.top) || 0) - 46), fontFamily: "system-ui, sans-serif", fontSize: 13, lineHeight: 1, textTransform: "none", letterSpacing: 0, fontStyle: "normal", fontWeight: 600 }}
    >
      <button type="button" aria-pressed={state.bold} title={say("Bold")} aria-label={say("Bold")} onMouseDown={keep} onClick={() => applyFormat({ bold: "toggle" })} className="grid h-8 w-8 place-items-center rounded-full" style={{ background: state.bold ? "#16141F" : "transparent", color: state.bold ? "#FFFFFF" : "#16141F", fontWeight: 800 }}>B</button>
      <span aria-hidden className="mx-0.5 h-5 w-px bg-[#E4E2EA]" />
      <div role="radiogroup" aria-label={say("Text size")} className="flex items-center gap-0.5">
        {RICH_SIZE_ORDER.map((size) => (
          <button key={size} type="button" role="radio" aria-checked={state.size === size} title={say(SIZE_LABEL[size])} aria-label={say(SIZE_LABEL[size])} onMouseDown={keep} onClick={() => applyFormat({ size })} className="h-8 min-w-8 rounded-full px-1.5" style={{ background: state.size === size ? "#EAF0FF" : "transparent", color: state.size === size ? "#2F66F6" : "#16141F" }}>
            {size.toUpperCase()}
          </button>
        ))}
      </div>
      <span aria-hidden className="mx-0.5 h-5 w-px bg-[#E4E2EA]" />
      <div className="relative">
        <button type="button" aria-expanded={colours} title={say("Text colour")} aria-label={say("Text colour")} onMouseDown={keep} onClick={() => setColours((open) => !open)} className="grid h-8 w-8 place-items-center rounded-full">
          <span aria-hidden className="h-4 w-4 rounded-full border border-black/15" style={{ background: state.color ? (state.color.startsWith("theme:") ? format.tone(state.color.slice(6) as "accent") ?? "#16141F" : state.color) : "conic-gradient(#E86A4F, #F2A93B, #2E7E78, #1F4FD8, #6B4F8A, #E86A4F)" }} />
        </button>
        {colours ? (
          <div role="group" aria-label={say("Text colour")} onMouseDown={keep} className="absolute left-0 top-full mt-1.5 grid w-[188px] grid-cols-5 gap-1.5 rounded-[14px] border border-[#E4E2EA] bg-white p-2 shadow-[0_12px_32px_rgba(22,20,31,.18)]">
            <button type="button" title={say("Own colour")} aria-label={say("Own colour")} aria-pressed={!state.color} onMouseDown={keep} onClick={() => { applyFormat({ color: null }); setColours(false); }} className="grid h-7 w-7 place-items-center rounded-full border border-[#D9D6E0] text-[13px]" style={{ outline: !state.color ? "2px solid #2F66F6" : undefined, outlineOffset: 1 }}>∅</button>
            {RICH_THEME_COLORS.map((color) => (
              <button key={color} type="button" title={say(THEME_LABEL[color])} aria-label={say(THEME_LABEL[color])} aria-pressed={state.color === color} onMouseDown={keep} onClick={() => { applyFormat({ color }); setColours(false); }} className="h-7 w-7 rounded-full border border-black/15" style={{ background: format.tone(color.slice(6) as "accent") ?? "#16141F", outline: state.color === color ? "2px solid #2F66F6" : undefined, outlineOffset: 1 }} />
            ))}
            {RICH_FIXED_COLORS.map((color) => (
              <button key={color} type="button" title={color} aria-label={`${say("Colour")} ${color}`} aria-pressed={state.color === color} onMouseDown={keep} onClick={() => { applyFormat({ color }); setColours(false); }} className="h-7 w-7 rounded-full border border-black/15" style={{ background: color, outline: state.color === color ? "2px solid #2F66F6" : undefined, outlineOffset: 1 }} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  ) : null;
  return (
    <>
    {toolbar}
    <textarea
      ref={ref}
      data-inline-editor
      // Which words these are, for the phone editor's text toolbar (src/app/store-canvas formats the selection).
      data-inline-key={edit.key}
      aria-label="Edit text"
      value={value}
      maxLength={MAX_LENGTH[edit.key]}
      rows={1}
      onChange={(event) => setValue(event.target.value)}
      onSelect={readSelection}
      onKeyUp={readSelection}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          finish(false);
        } else if (event.key === "Enter" && !event.shiftKey && edit.key !== "body" && edit.key !== "summary") {
          event.preventDefault();
          finish(true);
        }
      }}
      className="absolute z-20 resize-none overflow-hidden rounded-[6px] border-0 bg-transparent p-1 outline-none ring-2 ring-[#0E9E85]"
      // Transparent, in the words' own colour: it reads like typing on the page (light words on a dark photo too).
      style={{ ...box, boxShadow: "0 0 0 4px rgba(14,158,133,.18)" }}
    />
    </>
  );
}
