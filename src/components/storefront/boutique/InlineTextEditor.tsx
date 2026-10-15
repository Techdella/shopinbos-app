"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

// Inline text editing in the store builder for the 2026 themes: click a heading, paragraph or label on the page and
// type over it. A text box is laid exactly over the words, in their own font, size and colour, so the page itself is
// never edited by the browser (React keeps drawing it); Enter or clicking away saves, Esc cancels.

/** The section's words a click can edit, in the order they're matched against what was clicked. */
export const INLINE_COPY_KEYS = ["title", "body", "eyebrow", "summary", "primaryCta", "cta", "buttonLabel", "discountLabel"] as const;
export type InlineCopyKey = (typeof INLINE_COPY_KEYS)[number];

const MAX_LENGTH: Record<InlineCopyKey, number> = { title: 140, body: 600, eyebrow: 60, summary: 300, primaryCta: 40, cta: 40, buttonLabel: 40, discountLabel: 40 };

const clean = (value: string) => value.replace(/\s+/g, " ").trim();

/**
 * Which of the section's words a clicked element shows: the element whose text is exactly one of them, or, for a
 * section still showing its default words, its heading (title) or first paragraph (body). Null: not editable here.
 */
export function inlineTargetFor(target: Element, section: Element, copy: Record<string, unknown>): { element: HTMLElement; key: InlineCopyKey } | null {
  for (let node: Element | null = target; node && node !== section; node = node.parentElement) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.closest("input, textarea, select, [data-inline-editor]")) return null;
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

/** The text box laid over the words being edited (positioned inside the section wrapper). */
export function InlineTextEditor({ edit, container, onSave, onClose }: { edit: InlineEdit; container: HTMLElement; onSave: (value: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(edit.value);
  const [box, setBox] = useState<React.CSSProperties | null>(null);
  const done = useRef(false);

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

  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    const next = clean(value);
    if (save && next && next !== clean(edit.value)) onSave(next);
    onClose();
  };

  if (!box) return null;
  return (
    <textarea
      ref={ref}
      data-inline-editor
      aria-label="Edit text"
      value={value}
      maxLength={MAX_LENGTH[edit.key]}
      rows={1}
      onChange={(event) => setValue(event.target.value)}
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
  );
}
