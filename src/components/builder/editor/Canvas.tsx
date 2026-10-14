"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
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
}

const PAD = 24;

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

  useEffect(() => {
    if (!props.scrollToken || !props.selectedId) return;
    const element = frameRef.current?.querySelector<HTMLElement>(`[data-section-id="${CSS.escape(props.selectedId)}"]`);
    element?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [props.scrollToken, props.selectedId]);

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
      >
        <div
          ref={frameRef}
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
      </div>
    </div>
  );
}
