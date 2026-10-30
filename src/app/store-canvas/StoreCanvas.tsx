"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { TemplateStorefrontSurface, type SurfaceStore } from "@/components/storefront/TemplateStorefrontSurface";
import { BOUTIQUE_FONT_CLASS } from "@/components/storefront/boutique/fonts";
import { useEditorT } from "@/components/builder/editor/i18n";
import type { StoreEditorSnapshot } from "@/lib/store-templates";
import { isChrome, isFooter, type CanvasInbound, type CanvasOutbound, type CanvasRect, type CanvasWords, type EdSnapshot } from "@shared/store-editor";

// The phone editor's canvas (design SE-02…SE-04, SE-08, SE-11, SE-12): the shop drawn by the storefront's own
// renderer, in editor mode. The phone sends the draft and every change (window.__sibCanvas); the page posts back
// what the seller taps (window.ReactNativeWebView.postMessage): a section (with where it is on screen, for the
// phone's floating toolbar), words typed on the page, a "+" between sections, a link to another page.
// The orange outline, the section's name tag and the "+" buttons are drawn here, inside the page, so they scroll with
// it exactly; the toolbars and sheets are the phone's own.

const ORANGE = "#FF6A2B";
const INK = "#16141F";
const DESKTOP_WIDTH = 1280;

declare global {
  interface Window {
    __sibCanvas?: (message: CanvasInbound) => void;
    __sibCanvasQueue?: CanvasInbound[];
    ReactNativeWebView?: { postMessage: (data: string) => void };
  }
}

function post(message: CanvasOutbound) {
  const data = JSON.stringify(message);
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(data);
  else if (window.parent !== window) window.parent.postMessage(data, "*");
}

interface Setup {
  store: SurfaceStore;
  snapshot: EdSnapshot;
  page: string;
  mode: "edit" | "preview";
  device: "mobile" | "desktop";
  labels: Record<string, string>;
  words: CanvasWords;
}

type Box = { top: number; left: number; width: number; height: number };

const sectionEl = (id: string) => document.querySelector<HTMLElement>(`[data-section-id="${CSS.escape(id)}"]`);

const toRect = (r: DOMRect): CanvasRect => ({ x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) });

/** The section's main picture on screen: its biggest image or video. */
function photoRect(section: HTMLElement): CanvasRect | null {
  let best: DOMRect | null = null;
  for (const media of Array.from(section.querySelectorAll("img, video"))) {
    const r = media.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) continue;
    if (!best || r.width * r.height > best.width * best.height) best = r;
  }
  return best ? toRect(best) : null;
}

/** The first words in the section a seller would edit (or its button's words). */
function firstText(section: HTMLElement, part: "text" | "button"): HTMLElement | null {
  const editable = Array.from(section.querySelectorAll<HTMLElement>("[contenteditable]"));
  const inControl = (el: Element) => Boolean(el.closest("a, button"));
  if (editable.length) return (part === "button" ? editable.find(inControl) : editable.find((el) => !inControl(el))) ?? null;
  const candidates = Array.from(section.querySelectorAll<HTMLElement>(part === "button" ? "a, button" : "h1, h2, h3, h4, p, span"));
  for (const el of candidates) {
    if (part === "text" && inControl(el)) continue;
    // The deepest element that holds the words.
    let target: HTMLElement = el;
    while (target.children.length === 1 && target.firstElementChild instanceof HTMLElement) target = target.firstElementChild;
    if ((target.textContent ?? "").trim()) return target;
  }
  return null;
}

export function StoreCanvas() {
  const { editorText } = useEditorT();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [marks, setMarks] = useState<Array<{ id: string; tag: string }>>([]);
  const [boxes, setBoxes] = useState<Record<string, Box>>({});
  const [scale, setScale] = useState(1);
  const [innerHeight, setInnerHeight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;
  const setupRef = useRef<Setup | null>(null);
  setupRef.current = setup;

  const reportSelected = useCallback((kind: "select" | "rect", moving = false) => {
    const id = selectedRef.current;
    if (!id) return;
    const el = sectionEl(id);
    const rect = el ? toRect(el.getBoundingClientRect()) : null;
    const photo = el ? photoRect(el) : null;
    if (kind === "select") post({ t: "select", id, rect, photo, viewport: { width: window.innerWidth, height: window.innerHeight } });
    else post({ t: "rect", rect, photo, moving });
  }, []);

  const handle = useCallback((message: CanvasInbound) => {
    switch (message.t) {
      case "init":
        setSetup({ store: message.store as SurfaceStore, snapshot: message.snapshot, page: message.page, mode: message.mode, device: message.device, labels: message.labels, words: message.words });
        setSelected(null);
        setMarks([]);
        window.scrollTo({ top: 0 });
        break;
      case "snapshot":
        setSetup((current) => (current ? { ...current, snapshot: message.snapshot, labels: message.labels } : current));
        break;
      case "page":
        setSetup((current) => (current ? { ...current, page: message.page } : current));
        setSelected(null);
        setMarks([]);
        window.scrollTo({ top: 0 });
        break;
      case "mode":
        setSetup((current) => (current ? { ...current, mode: message.mode, device: message.device } : current));
        if (message.mode === "preview") {
          setSelected(null);
          setMarks([]);
        }
        break;
      case "select":
        setSelected(message.id);
        setTag(message.tag ?? null);
        if (message.id) {
          requestAnimationFrame(() => {
            const el = sectionEl(message.id!);
            if (el && message.scroll) {
              const r = el.getBoundingClientRect();
              // Into view with room above it for the phone's toolbar.
              if (r.top < 60 || r.bottom > window.innerHeight - 40) window.scrollTo({ top: window.scrollY + r.top - 90, behavior: "smooth" });
            }
            setTimeout(() => reportSelected("select"), message.scroll ? 380 : 0);
          });
        }
        break;
      case "marks":
        setMarks(message.marks);
        break;
      case "editText": {
        const el = sectionEl(message.id);
        const target = el ? firstText(el, message.part) : null;
        if (!target) break;
        if (target.isContentEditable) {
          target.focus();
          const range = document.createRange();
          range.selectNodeContents(target);
          range.collapse(false);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        } else {
          // The 2026 themes open words for typing on a tap (a button's words on a double tap).
          target.dispatchEvent(new MouseEvent(message.part === "button" ? "dblclick" : "click", { bubbles: true, cancelable: true }));
        }
        break;
      }
      case "blur":
        (document.activeElement as HTMLElement | null)?.blur?.();
        break;
    }
  }, [reportSelected]);

  // The phone's door in: messages sent before the page was ready wait in a queue.
  useEffect(() => {
    window.__sibCanvas = handle;
    const queued = window.__sibCanvasQueue ?? [];
    window.__sibCanvasQueue = [];
    for (const message of queued) handle(message);
    post({ t: "ready" });
    return () => {
      window.__sibCanvas = undefined;
    };
  }, [handle]);

  // Typing on the page: the phone shows its text toolbar while words are open.
  useEffect(() => {
    const isText = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || target.tagName === "TEXTAREA" || target.tagName === "INPUT");
    const onIn = (event: FocusEvent) => {
      if (isText(event.target)) post({ t: "editing", on: true });
    };
    const onOut = (event: FocusEvent) => {
      if (isText(event.target)) post({ t: "editing", on: false });
    };
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, []);

  // While the page scrolls the phone hides its floating toolbar, then puts it back where the section is.
  useEffect(() => {
    let frame = 0;
    let settle: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (!selectedRef.current) return;
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          reportSelected("rect", true);
        });
      }
      if (settle) clearTimeout(settle);
      settle = setTimeout(() => reportSelected("rect", false), 160);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
      if (settle) clearTimeout(settle);
    };
  }, [reportSelected]);

  // Where the outlined sections are, in the page's own pixels (so the outline scrolls with the page).
  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const base = root.getBoundingClientRect();
    const ids = [selectedRef.current, ...marks.map((mark) => mark.id)].filter((id): id is string => Boolean(id));
    const next: Record<string, Box> = {};
    for (const id of ids) {
      const el = sectionEl(id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      next[id] = { top: r.top - base.top, left: r.left - base.left, width: r.width, height: r.height };
    }
    setBoxes((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
  }, [marks]);

  useLayoutEffect(() => {
    measure();
  }, [measure, selected, setup]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new ResizeObserver(() => {
      measure();
      if (selectedRef.current) reportSelected("rect", false);
    });
    observer.observe(root);
    // Pictures loading change heights without resizing the root first.
    const onLoad = () => measure();
    root.addEventListener("load", onLoad, true);
    return () => {
      observer.disconnect();
      root.removeEventListener("load", onLoad, true);
    };
  }, [measure, reportSelected, setup?.device]);

  // A computer preview (SE-12): the shop at a computer's width, shrunk to fit the phone.
  useLayoutEffect(() => {
    if (setup?.device !== "desktop") {
      setScale(1);
      return;
    }
    const fit = () => setScale(Math.min(1, window.innerWidth / DESKTOP_WIDTH));
    fit();
    const inner = innerRef.current;
    const observer = inner ? new ResizeObserver(() => setInnerHeight(inner.offsetHeight)) : null;
    if (inner && observer) observer.observe(inner);
    window.addEventListener("resize", fit);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [setup?.device]);

  if (!setup) return <div style={{ minHeight: "100dvh", background: "#FFFFFF" }} />;

  const editing = setup.mode === "edit";
  const snapshot = setup.snapshot as unknown as StoreEditorSnapshot;
  const sections = setup.snapshot.pages.find((page) => page.pageType === setup.page)?.sections ?? [];
  const selectedIndex = sections.findIndex((section) => section.id === selected);
  const selectedSection = selectedIndex >= 0 ? sections[selectedIndex] : null;
  const box = selected ? boxes[selected] : undefined;
  const above = selectedIndex > 0 ? sections[selectedIndex - 1] : null;

  const surface = (
    <TemplateStorefrontSurface
      store={setup.store}
      snapshot={snapshot}
      storeBasePath={`/s/${setup.store.slug}`}
      mode="editor"
      device={setup.device}
      selectedPage={setup.page}
      selectedSectionId={null}
      onSelectPage={(page) => post({ t: "navigate", page })}
      onSelectSection={editing ? (id) => {
        if (!id) return;
        setSelected(id);
        setTag(null);
        setMarks([]);
        requestAnimationFrame(() => reportSelected("select"));
      } : undefined}
      onUpdateSectionCopy={editing ? (id, key, value) => post({ t: "copy", id, key, value }) : undefined}
      editorText={editorText}
      cartCount={0}
    />
  );

  return (
    <div
      ref={rootRef}
      className={BOUTIQUE_FONT_CLASS}
      style={{ position: "relative", minHeight: "100dvh", overflowX: "hidden", WebkitTapHighlightColor: "transparent" }}
      onClick={() => {
        if (!editing || !selectedRef.current) return;
        setSelected(null);
        post({ t: "deselect" });
      }}
    >
      {setup.device === "desktop" ? (
        <div style={{ height: innerHeight * scale, overflow: "hidden" }}>
          <div ref={innerRef} style={{ width: DESKTOP_WIDTH, transform: `scale(${scale})`, transformOrigin: "top left" }}>{surface}</div>
        </div>
      ) : (
        surface
      )}

      {editing
        ? marks.map((mark) => {
            const at = boxes[mark.id];
            return at && mark.id !== selected ? <Outline key={mark.id} box={at} tag={mark.tag} /> : null;
          })
        : null}

      {editing && box && selectedSection ? (
        <>
          <Outline box={box} tag={tag ?? setup.labels[selectedSection.id] ?? selectedSection.name} />
          {/* "+" above (not above the header) and below (not below the footer): drop a section in right there. */}
          {!isChrome(selectedSection.kind) || selectedSection.kind !== "header" ? (
            selectedSection.kind !== "announcement-bar" && selectedSection.kind !== "header" ? (
              <PlusButton
                label={setup.words.addAbove}
                top={box.top}
                left={box.left + box.width / 2}
                onPress={() => post({ t: "add", afterId: above?.id ?? null })}
              />
            ) : null
          ) : null}
          {!isFooter(selectedSection.kind) ? (
            <PlusButton label={setup.words.addBelow} top={box.top + box.height} left={box.left + box.width / 2} onPress={() => post({ t: "add", afterId: selectedSection.id })} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Outline({ box, tag }: { box: Box; tag: string }) {
  return (
    <div aria-hidden style={{ position: "absolute", top: box.top, left: box.left, width: box.width, height: box.height, boxShadow: `inset 0 0 0 2.5px ${ORANGE}`, pointerEvents: "none", zIndex: 40 }}>
      <span
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          maxWidth: "70%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          background: ORANGE,
          color: INK,
          font: "800 11px/1.3 system-ui, -apple-system, 'Segoe UI', sans-serif",
          borderRadius: 6,
          padding: "3px 8px",
        }}
      >
        {tag}
      </span>
    </div>
  );
}

function PlusButton({ label, top, left, onPress }: { label: string; top: number; left: number; onPress: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onPress();
      }}
      style={{
        position: "absolute",
        top: top - 15,
        left: left - 15,
        width: 30,
        height: 30,
        borderRadius: 999,
        border: 0,
        background: ORANGE,
        color: INK,
        boxShadow: "0 0 0 4px #fff",
        display: "grid",
        placeItems: "center",
        zIndex: 45,
        padding: 0,
        cursor: "pointer",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  );
}
