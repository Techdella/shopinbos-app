"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@/components/app-ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { InsertSlot } from "./editor-logic";
import { SELECT_BLUE } from "./ui";
import { useEditorT } from "./i18n";

export type Device = "desktop" | "tablet" | "mobile";

export const DEVICE_WIDTHS: Record<Device, number> = { desktop: 1440, tablet: 768, mobile: 390 };
export const DEVICE_LABELS: Record<Device, string> = { desktop: "Desktop", tablet: "Tablet", mobile: "Mobile" };

export interface CanvasToolbarAction {
  id: string;
  icon: IconName;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}

export interface CanvasProps {
  device: Device;
  /** Phones show the store at the screen's own width instead of a scaled device frame. */
  fit?: boolean;
  children: ReactNode;
  selectedId: string | null;
  selectedName: string | null;
  /** Draws the outline, name tag and toolbar over sections that mark themselves with data-section-id. */
  overlay: boolean;
  actions: CanvasToolbarAction[];
  /** Changes whenever the page content may have moved, so the outline follows. */
  layoutVersion: unknown;
  /** Bumped when a section is picked outside the canvas, to scroll it into view. */
  scrollToken: number;
  onBackgroundClick: () => void;
  /** "+" spots between sections (editing a 2026 theme on a computer). None: no inserter on the canvas. */
  slots?: InsertSlot[];
  onOpenSlot?: (slot: InsertSlot) => void;
  /** The page has no body sections yet: a big "Add your first section" button. */
  emptyPage?: boolean;
  /** The open inserter and where it is anchored: a "+" spot, or an element on the page (a column's "+"). */
  inserter?: { anchor: { slotKey: string } | { selector: string }; node: ReactNode } | null;
}

const PAD = 24;
const INSERTER_WIDTH = 440;
const INSERTER_HEIGHT = 470;

type Box = { top: number; left: number; width: number; height: number };

export function Canvas(props: CanvasProps) {
  const { t, tx } = useEditorT();
  const outerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [contentHeight, setContentHeight] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  useEffect(() => {
    const outer = outerRef.current;
    const frame = frameRef.current;
    if (!outer || !frame) return;
    const observer = new ResizeObserver(() => {
      setBox({ width: outer.clientWidth, height: outer.clientHeight });
      setContentHeight(frame.offsetHeight);
    });
    observer.observe(outer);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const pad = props.fit ? 0 : PAD;
  const available = Math.max(0, box.width - pad * 2);
  const frameWidth = props.fit ? available : DEVICE_WIDTHS[props.device];
  const scale = props.fit || !frameWidth ? 1 : Math.min(1, available / frameWidth);
  const minHeight = Math.max(0, (box.height - pad * 2 - 28) / scale);

  // Outline position, read from the rendered section (works with the frame's scale transform).
  useLayoutEffect(() => {
    if (!props.overlay || !props.selectedId) {
      setRect(null);
      return;
    }
    const frame = requestAnimationFrame(() => {
      const wrapper = wrapperRef.current;
      const element = frameRef.current?.querySelector<HTMLElement>(`[data-section-id="${CSS.escape(props.selectedId!)}"]`);
      if (!wrapper || !element) {
        setRect(null);
        return;
      }
      const base = wrapper.getBoundingClientRect();
      const own = element.getBoundingClientRect();
      setRect({ top: own.top - base.top, left: own.left - base.left, width: own.width, height: own.height });
    });
    return () => cancelAnimationFrame(frame);
  }, [props.overlay, props.selectedId, props.layoutVersion, contentHeight, scale, frameWidth]);

  // "+" spots: the bottom of the section above (or the top of the one below), in the wrapper's own pixels.
  const [slotY, setSlotY] = useState<Record<string, number>>({});
  const [anchorBox, setAnchorBox] = useState<Box | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const { slots, inserter } = props;
  const anchorKey = inserter ? ("slotKey" in inserter.anchor ? `slot|${inserter.anchor.slotKey}` : `el|${inserter.anchor.selector}`) : "";
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      const wrapper = wrapperRef.current;
      const root = frameRef.current;
      if (!wrapper || !root) return;
      const base = wrapper.getBoundingClientRect();
      const boxOf = (element: Element | null): Box | null => {
        if (!element) return null;
        const own = element.getBoundingClientRect();
        return { top: own.top - base.top, left: own.left - base.left, width: own.width, height: own.height };
      };
      const sectionBox = (id: string | null) => (id ? boxOf(root.querySelector(`[data-section-id="${CSS.escape(id)}"]`)) : null);
      const next: Record<string, number> = {};
      for (const slot of slots ?? []) {
        const above = sectionBox(slot.afterId);
        const below = sectionBox(slot.beforeId);
        if (above) next[slot.key] = above.top + above.height;
        else if (below) next[slot.key] = below.top;
        else next[slot.key] = 0;
      }
      setSlotY((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
      if (!anchorKey) setAnchorBox(null);
      else if (anchorKey.startsWith("el|")) setAnchorBox(boxOf(root.querySelector(anchorKey.slice(3))));
      else setAnchorBox(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [slots, anchorKey, props.layoutVersion, contentHeight, scale, frameWidth]);

  useEffect(() => {
    if (!props.scrollToken || !props.selectedId) return;
    const element = frameRef.current?.querySelector<HTMLElement>(`[data-section-id="${CSS.escape(props.selectedId)}"]`);
    element?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [props.scrollToken, props.selectedId]);

  const wrapperWidth = frameWidth * scale;
  const wrapperHeight = Math.max(contentHeight, minHeight) * scale;
  const activeSlotKey = inserter && "slotKey" in inserter.anchor ? inserter.anchor.slotKey : null;
  const popover = (() => {
    if (!inserter) return null;
    const y = activeSlotKey !== null ? slotY[activeSlotKey] : anchorBox ? anchorBox.top + anchorBox.height : undefined;
    if (y === undefined) return null;
    const x = activeSlotKey === null && anchorBox ? anchorBox.left + anchorBox.width / 2 : wrapperWidth / 2;
    const width = Math.max(260, Math.min(INSERTER_WIDTH, wrapperWidth - 16));
    const left = Math.min(Math.max(8, x - width / 2), Math.max(8, wrapperWidth - width - 8));
    const above = y + 14 + INSERTER_HEIGHT > wrapperHeight && y - 14 - INSERTER_HEIGHT > 0;
    return { y, left, width, above };
  })();

  return (
    <div
      ref={outerRef}
      className="relative h-full min-h-0 w-full overflow-auto bg-[#ECEBF1]"
      style={{ padding: pad }}
      onClick={(event) => { if (event.target === event.currentTarget) props.onBackgroundClick(); }}
    >
      {!props.fit ? (
        <p className="pb-2 text-center text-[12.5px] font-semibold text-app-ink-soft" aria-live="polite">
          {DEVICE_LABELS[props.device]} · {DEVICE_WIDTHS[props.device]}
          {scale < 0.995 ? <span className="sr-only"> (shown at {Math.round(scale * 100)}%)</span> : null}
        </p>
      ) : null}
      <div
        ref={wrapperRef}
        className="relative mx-auto bg-white shadow-[0_1px_2px_rgba(22,20,31,.06),0_12px_40px_rgba(22,20,31,.08)]"
        style={{ width: frameWidth * scale, height: Math.max(contentHeight, minHeight) * scale }}
        onMouseOver={slots ? (event) => {
          const id = (event.target as HTMLElement | null)?.closest?.("[data-section-id]")?.getAttribute("data-section-id") ?? null;
          if (id) setHoverId(id);
        } : undefined}
        onMouseLeave={slots ? () => setHoverId(null) : undefined}
      >
        <div
          ref={frameRef}
          data-drop-scope=""
          className="absolute left-0 top-0 overflow-hidden"
          style={{ width: frameWidth, minHeight, transform: scale === 1 ? undefined : `scale(${scale})`, transformOrigin: "top left" }}
        >
          {props.children}
        </div>
        {rect ? (
          <div className="pointer-events-none absolute inset-0 z-20" aria-hidden={false}>
            <div className="absolute" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height, boxShadow: `inset 0 0 0 2.5px ${SELECT_BLUE}` }} />
            <div className="absolute flex max-w-[60%] items-center gap-1 truncate rounded-b-[6px] rounded-tr-[6px] px-2 py-[3px] text-[12px] font-semibold text-white" style={{ top: rect.top, left: rect.left, background: SELECT_BLUE }}>
              <Icon name="list" size={12} /> <span className="truncate">{tx(props.selectedName)}</span>
            </div>
            <div
              role="toolbar"
              aria-label={t("edk.sectionActions", { name: tx(props.selectedName ?? "Section") })}
              className="pointer-events-auto absolute flex items-center gap-0.5 rounded-[12px] bg-[#16141F] p-1 shadow-[0_10px_30px_rgba(22,20,31,.3)]"
              style={{ top: Math.min(rect.top + rect.height, Math.max(contentHeight, minHeight) * scale - 22), left: rect.left + rect.width / 2, transform: "translate(-50%, -50%)" }}
            >
              {props.actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  aria-label={tx(action.label)}
                  title={tx(action.label)}
                  disabled={action.disabled}
                  onClick={(event) => { event.stopPropagation(); action.onClick(); }}
                  className="grid h-9 w-9 place-items-center rounded-[9px] text-white hover:bg-white/15 disabled:opacity-35"
                  style={action.danger ? { color: "#FF7A6B" } : undefined}
                >
                  <Icon name={action.icon} size={16} />
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {slots && !props.emptyPage ? (
          <div className="pointer-events-none absolute inset-0 z-[25]">
            {slots.map((slot) => {
              const y = slotY[slot.key];
              // The selected section's toolbar sits on its bottom edge and has its own "Add below".
              if (y === undefined || (rect && slot.afterId === props.selectedId)) return null;
              const active = activeSlotKey === slot.key;
              const near = hoverId !== null && (slot.afterId === hoverId || slot.beforeId === hoverId);
              return (
                <div key={slot.key} className="absolute inset-x-0 flex items-center justify-center" style={{ top: y - 14, height: 28 }}>
                  <span aria-hidden className={cx("absolute inset-x-2 top-1/2 h-[2px] -translate-y-1/2 rounded-full transition-opacity", active ? "opacity-100" : "opacity-0")} style={{ background: SELECT_BLUE }} />
                  <button
                    type="button"
                    aria-label={slot.beforeId && slots.indexOf(slot) < slots.length - 1 ? tx("Add a section here") : tx("Add a section at the end")}
                    title={tx("Add a section here")}
                    aria-expanded={active}
                    onClick={(event) => { event.stopPropagation(); props.onOpenSlot?.(slot); }}
                    className={cx(
                      "peer pointer-events-auto relative grid h-7 w-7 place-items-center rounded-full text-white shadow-[0_4px_14px_rgba(47,102,246,.35)] transition hover:scale-110 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F66F6]",
                      active || near ? "opacity-100" : "opacity-0 hover:opacity-100",
                    )}
                    style={{ background: SELECT_BLUE }}
                  >
                    <Icon name="plus" size={15} strokeWidth={2.2} />
                  </button>
                  <span aria-hidden className="absolute inset-x-2 top-1/2 -z-10 h-[2px] -translate-y-1/2 rounded-full opacity-0 transition-opacity peer-hover:opacity-100 peer-focus-visible:opacity-100" style={{ background: SELECT_BLUE }} />
                </div>
              );
            })}
          </div>
        ) : null}
        {slots && props.emptyPage && slots[0] && slotY[slots[0].key] !== undefined ? (
          <div className="absolute inset-x-0 z-[25] flex justify-center px-6" style={{ top: slotY[slots[0].key]! + 24 * scale }}>
            <button
              type="button"
              onClick={(event) => { event.stopPropagation(); props.onOpenSlot?.(slots[0]!); }}
              className="flex w-full max-w-[520px] flex-col items-center gap-2 rounded-[18px] border-2 border-dashed border-[#2F66F6]/40 bg-white/80 px-6 py-8 text-center hover:border-[#2F66F6] hover:bg-[#F5F8FF]"
            >
              <span className="grid h-11 w-11 place-items-center rounded-full text-white" style={{ background: SELECT_BLUE }}><Icon name="plus" size={20} strokeWidth={2.2} /></span>
              <span className="text-[15px] font-bold text-app-ink">{tx("Add your first section")}</span>
              <span className="text-[13px] text-app-ink-soft">{tx("Pick a ready-made section, a row of columns or a single element.")}</span>
            </button>
          </div>
        ) : null}
        {inserter && popover ? (
          <div className="absolute z-40" style={{ left: popover.left, width: popover.width, ...(popover.above ? { bottom: wrapperHeight - popover.y + 14 } : { top: popover.y + 14 }) }}>
            {inserter.node}
          </div>
        ) : null}
      </div>
    </div>
  );
}
