"use client";

// Drag and drop between columns, with pointer events (mouse, pen and touch) and no library. Shared by the builder's
// canvas (LayoutRow) and the panel's column lists (LayoutColumnsField). The container marks each column with
// data-drop-column="<index>" and each element inside it with data-drop-item; start() goes on a drag handle's
// pointerdown. While dragging, `state.target` says which column and gap the pointer is over, and `top` is where to
// draw the drop line inside that column (in the column's own pixels, so it works inside the scaled canvas frame).
// Escape or a cancelled touch abandons the drag; near the edges of the scrolling panel or canvas it scrolls.

import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import { dropIndexAt, nearestDropColumn } from "./layout-logic";

export interface ColumnDropTarget {
  column: number;
  index: number;
  top: number;
}

export interface ColumnDragState {
  id: string;
  target: ColumnDropTarget | null;
}

interface Session {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
  target: ColumnDropTarget | null;
  scroller: HTMLElement | null;
}

/** Pixels the pointer must travel before a press on the handle counts as a drag (a tap still selects). */
const DRAG_THRESHOLD = 4;
/** Distance from the scroll area's top or bottom edge where it starts scrolling, and its top speed per frame. */
const EDGE = 56;
const MAX_SPEED = 18;

function scrollParent(node: HTMLElement | null): HTMLElement | null {
  for (let current = node?.parentElement ?? null; current; current = current.parentElement) {
    const { overflowY } = getComputedStyle(current);
    if ((overflowY === "auto" || overflowY === "scroll") && current.scrollHeight > current.clientHeight) return current;
  }
  return (document.scrollingElement as HTMLElement | null) ?? null;
}

function sameTarget(a: ColumnDropTarget | null, b: ColumnDropTarget | null) {
  return a === b || (!!a && !!b && a.column === b.column && a.index === b.index && Math.abs(a.top - b.top) < 0.5);
}

export function useColumnDrag({ containerRef, onDrop }: {
  containerRef: React.RefObject<HTMLElement | null>;
  /** The element, its target column and the gap in that column (as drawn, before the move). */
  onDrop: (id: string, column: number, index: number) => void;
}) {
  const [state, setState] = useState<ColumnDragState | null>(null);
  const session = useRef<Session | null>(null);
  const onDropRef = useRef(onDrop);
  useEffect(() => {
    onDropRef.current = onDrop;
  });

  const measure = useCallback((x: number, y: number): ColumnDropTarget | null => {
    const root = containerRef.current;
    if (!root) return null;
    const columns = Array.from(root.querySelectorAll<HTMLElement>("[data-drop-column]"));
    const rects = columns.map((column) => column.getBoundingClientRect());
    const picked = nearestDropColumn(rects, x, y);
    if (picked === -1) return null;
    const host = columns[picked]!;
    const hostRect = rects[picked]!;
    const items = Array.from(host.querySelectorAll<HTMLElement>("[data-drop-item]")).map((item) => item.getBoundingClientRect());
    const index = dropIndexAt(items.map((rect) => rect.top + rect.height / 2), y);
    // The canvas frame is scaled with a CSS transform: screen pixels → the column's own pixels.
    const scale = host.offsetWidth ? hostRect.width / host.offsetWidth : 1;
    const edge =
      items.length === 0 ? hostRect.top + 6 * scale :
      index === 0 ? items[0]!.top - 3 * scale :
      index >= items.length ? items[items.length - 1]!.bottom + 3 * scale :
      (items[index - 1]!.bottom + items[index]!.top) / 2;
    const column = Number(host.dataset.dropColumn);
    return { column: Number.isFinite(column) ? column : picked, index, top: (edge - hostRect.top) / (scale || 1) };
  }, [containerRef]);

  const start = useCallback((event: React.PointerEvent<HTMLElement>, id: string) => {
    if (session.current || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    event.stopPropagation();
    session.current = {
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      target: null,
      scroller: scrollParent(containerRef.current),
    };
    setState({ id, target: null });
  }, [containerRef]);

  const dragging = state !== null;
  useEffect(() => {
    if (!dragging) return;
    let frame = 0;
    const body = document.body;
    const previous = { cursor: body.style.cursor, userSelect: body.style.userSelect };
    body.style.cursor = "grabbing";
    body.style.userSelect = "none";

    const update = () => {
      const current = session.current;
      if (!current || !current.moved) return;
      const target = measure(current.x, current.y);
      if (sameTarget(target, current.target)) return;
      current.target = target;
      setState({ id: current.id, target });
    };

    // Scrolls the canvas or panel while the pointer rests near its top or bottom edge.
    const tick = () => {
      frame = 0;
      const current = session.current;
      if (!current?.moved || !current.scroller) return;
      const scroller = current.scroller;
      const page = scroller === document.scrollingElement;
      const top = page ? 0 : scroller.getBoundingClientRect().top;
      const bottom = page ? window.innerHeight : scroller.getBoundingClientRect().bottom;
      const speed =
        current.y < top + EDGE ? -Math.ceil(((top + EDGE - current.y) / EDGE) * MAX_SPEED) :
        current.y > bottom - EDGE ? Math.ceil(((current.y - (bottom - EDGE)) / EDGE) * MAX_SPEED) : 0;
      if (!speed) return;
      const before = scroller.scrollTop;
      scroller.scrollTop = before + Math.max(-MAX_SPEED, Math.min(MAX_SPEED, speed));
      if (scroller.scrollTop !== before) update();
      frame = requestAnimationFrame(tick);
    };

    const finish = (commit: boolean) => {
      const current = session.current;
      session.current = null;
      setState(null);
      if (!current) return;
      if (current.moved) {
        // The press ends in a click on the handle or wherever it was let go; it shouldn't pick or follow anything.
        const swallow = (click: MouseEvent) => { click.preventDefault(); click.stopPropagation(); };
        window.addEventListener("click", swallow, { capture: true, once: true });
        window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
      }
      if (commit && current.moved && current.target) onDropRef.current(current.id, current.target.column, current.target.index);
    };

    const onMove = (event: PointerEvent) => {
      const current = session.current;
      if (!current || event.pointerId !== current.pointerId) return;
      event.preventDefault();
      current.x = event.clientX;
      current.y = event.clientY;
      if (!current.moved && Math.hypot(current.x - current.startX, current.y - current.startY) < DRAG_THRESHOLD) return;
      current.moved = true;
      update();
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const onUp = (event: PointerEvent) => {
      if (event.pointerId === session.current?.pointerId) finish(true);
    };
    const onCancel = (event: PointerEvent) => {
      if (event.pointerId === session.current?.pointerId) finish(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Escape only cancels the drag: the builder's own Escape (clear the selection) waits for the next press.
        event.preventDefault();
        event.stopPropagation();
        finish(false);
      }
    };
    const onBlur = () => finish(false);

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener("blur", onBlur);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      body.style.cursor = previous.cursor;
      body.style.userSelect = previous.userSelect;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("blur", onBlur);
    };
  }, [dragging, measure]);

  return { state, start };
}
