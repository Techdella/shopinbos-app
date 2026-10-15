"use client";

// Drag and drop between columns, with pointer events (mouse, pen and touch) and no library. Shared by the builder's
// canvas (LayoutRow) and the panel's column lists (LayoutColumnsField). The container marks each column with
// data-drop-column="<index>" and each element inside it with data-drop-item; start() goes on a drag handle's
// pointerdown. While dragging, `state.target` says which column and gap the pointer is over, and `top` is where to
// draw the drop line inside that column (in the column's own pixels, so it works inside the scaled canvas frame).
// Escape or a cancelled touch abandons the drag; near the edges of the scrolling panel or canvas it scrolls.
//
// Across rows (the canvas): with `acrossRows`, every rows / columns section on the canvas is a drop target. Each one
// marks its outer box with data-drop-row="<section id>" (inside the canvas frame's data-drop-scope); the target then
// carries the row it is in, and the drag is shared through usePageColumnDrag() so every row can draw its columns as
// targets while one of them is being dragged from. The builder panel's column lists use the same rows, inside their
// own data-drop-scope, with `sharePage: false` so the canvas doesn't react to a drag in the panel. A column marked
// data-drop-append (a compact target with no element list, like a hidden row's strip) always takes a drop at its end.
//
// The floating preview: the caller renders a small copy of the element (DragGhost) with `previewRef` once
// `state.moved`; the hook places it next to the pointer with a transform, once per animation frame.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type React from "react";
import { MAX_ELEMENTS_PER_COLUMN, dragPreviewPosition, dropIndexAt, nearestDropColumn, pickDropRow } from "./layout-logic";

export interface ColumnDropTarget {
  column: number;
  index: number;
  top: number;
  /** Across rows: the section id of the row the pointer is over. */
  row?: string;
}

export interface ColumnDragState {
  id: string;
  /** Across rows: the dragged element's own row (section id). */
  from?: string;
  /** The pointer has travelled far enough for the press to count as a drag. */
  moved: boolean;
  target: ColumnDropTarget | null;
}

interface Session {
  id: string;
  from?: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
  target: ColumnDropTarget | null;
  scroller: HTMLElement | null;
  /** prefers-reduced-motion: the preview neither tilts nor animates. */
  still: boolean;
}

/** Pixels the pointer must travel before a press on the handle counts as a drag (a tap still selects). */
const DRAG_THRESHOLD = 4;
/** Distance from the scroll area's top or bottom edge where it starts scrolling, and its top speed per frame. */
const EDGE = 56;
const MAX_SPEED = 18;

// ─── The drag shared by the canvas's rows ───────────────────────────────────

let pageDrag: ColumnDragState | null = null;
const pageListeners = new Set<() => void>();

function publishPageDrag(next: ColumnDragState | null) {
  if (pageDrag === next) return;
  pageDrag = next;
  pageListeners.forEach((listener) => listener());
}

function subscribePageDrag(listener: () => void) {
  pageListeners.add(listener);
  return () => {
    pageListeners.delete(listener);
  };
}

/** The drag in progress on the canvas (from any row), so rows other than the dragged element's own draw targets too. */
export function usePageColumnDrag(): ColumnDragState | null {
  return useSyncExternalStore(subscribePageDrag, () => pageDrag, () => null);
}

// ─── Measuring ───────────────────────────────────────────────────────────────

function scrollParent(node: HTMLElement | null): HTMLElement | null {
  for (let current = node?.parentElement ?? null; current; current = current.parentElement) {
    const { overflowY } = getComputedStyle(current);
    if ((overflowY === "auto" || overflowY === "scroll") && current.scrollHeight > current.clientHeight) return current;
  }
  return (document.scrollingElement as HTMLElement | null) ?? null;
}

function sameTarget(a: ColumnDropTarget | null, b: ColumnDropTarget | null) {
  return a === b || (!!a && !!b && a.row === b.row && a.column === b.column && a.index === b.index && Math.abs(a.top - b.top) < 0.5);
}

/** The column and gap under the pointer among the columns inside `root`. */
function measureColumns(root: HTMLElement, x: number, y: number): ColumnDropTarget | null {
  const columns = Array.from(root.querySelectorAll<HTMLElement>("[data-drop-column]"));
  const rects = columns.map((column) => column.getBoundingClientRect());
  const picked = nearestDropColumn(rects, x, y);
  if (picked === -1) return null;
  const host = columns[picked]!;
  const hostRect = rects[picked]!;
  const pickedColumn = Number(host.dataset.dropColumn);
  // Clamped to the column's end by the move.
  if (host.hasAttribute("data-drop-append")) return { column: Number.isFinite(pickedColumn) ? pickedColumn : picked, index: MAX_ELEMENTS_PER_COLUMN, top: 0 };
  const items = Array.from(host.querySelectorAll<HTMLElement>("[data-drop-item]")).map((item) => item.getBoundingClientRect());
  const index = dropIndexAt(items.map((rect) => rect.top + rect.height / 2), y);
  // The canvas frame is scaled with a CSS transform: screen pixels → the column's own pixels.
  const scale = host.offsetWidth ? hostRect.width / host.offsetWidth : 1;
  const edge =
    items.length === 0 ? hostRect.top + 6 * scale :
    index === 0 ? items[0]!.top - 3 * scale :
    index >= items.length ? items[items.length - 1]!.bottom + 3 * scale :
    (items[index - 1]!.bottom + items[index]!.top) / 2;
  return { column: Number.isFinite(pickedColumn) ? pickedColumn : picked, index, top: (edge - hostRect.top) / (scale || 1) };
}

function ownRow(root: HTMLElement | null) {
  return root?.closest<HTMLElement>("[data-drop-row]") ?? null;
}

export function useColumnDrag({ containerRef, onDrop, acrossRows = false, sharePage = acrossRows }: {
  containerRef: React.RefObject<HTMLElement | null>;
  /** The element, its target column and the gap in that column (as drawn, before the move), and across rows the target row. */
  onDrop: (id: string, column: number, index: number, row?: string) => void;
  /** Every data-drop-row on the canvas takes drops (see the note at the top). */
  acrossRows?: boolean;
  /** Publishes the drag through usePageColumnDrag() (the canvas's rows). Defaults to `acrossRows`. */
  sharePage?: boolean;
}) {
  const [state, setState] = useState<ColumnDragState | null>(null);
  const session = useRef<Session | null>(null);
  const preview = useRef<{ node: HTMLElement; width: number; height: number } | null>(null);
  const onDropRef = useRef(onDrop);
  const acrossRowsRef = useRef(acrossRows);
  const sharePageRef = useRef(sharePage);
  useEffect(() => {
    onDropRef.current = onDrop;
    acrossRowsRef.current = acrossRows;
    sharePageRef.current = sharePage;
  });

  const show = useCallback((next: ColumnDragState | null) => {
    setState(next);
    if (sharePageRef.current) publishPageDrag(next);
  }, []);

  const measure = useCallback((x: number, y: number): ColumnDropTarget | null => {
    const root = containerRef.current;
    if (!root) return null;
    const own = acrossRowsRef.current ? ownRow(root) : null;
    if (!own) return measureColumns(root, x, y);
    const scope: ParentNode = own.parentElement?.closest("[data-drop-scope]") ?? own.ownerDocument;
    const rows = Array.from(scope.querySelectorAll<HTMLElement>("[data-drop-row]"));
    const picked = rows[pickDropRow(rows.map((row) => row.getBoundingClientRect()), x, y, rows.indexOf(own))] ?? own;
    const target = measureColumns(picked === own ? root : picked, x, y);
    return target ? { ...target, row: picked.dataset.dropRow } : null;
  }, [containerRef]);

  /** Moves the floating preview next to the pointer (transform only: no layout work). */
  const placePreview = useCallback(() => {
    const current = session.current;
    const ghost = preview.current;
    if (!current || !ghost) return;
    const { left, top } = dragPreviewPosition(current.x, current.y, ghost, { width: window.innerWidth, height: window.innerHeight });
    ghost.node.style.transform = `translate3d(${left}px, ${top}px, 0)${current.still ? "" : " rotate(2.5deg)"}`;
  }, []);

  /** Ref for the floating preview: measured once when it appears, then only moved. */
  const previewRef = useCallback((node: HTMLElement | null) => {
    preview.current = node ? { node, width: node.offsetWidth, height: node.offsetHeight } : null;
    placePreview();
  }, [placePreview]);

  const start = useCallback((event: React.PointerEvent<HTMLElement>, id: string) => {
    if (session.current || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    event.stopPropagation();
    const from = acrossRowsRef.current ? ownRow(containerRef.current)?.dataset.dropRow : undefined;
    session.current = {
      id,
      from,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      target: null,
      scroller: scrollParent(containerRef.current),
      still: typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    };
    show({ id, from, moved: false, target: null });
  }, [containerRef, show]);

  const dragging = state !== null;
  useEffect(() => {
    if (!dragging) return;
    let frame = 0;
    let pointerFrame = 0;
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
      show({ id: current.id, from: current.from, moved: true, target });
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

    // Pointer moves are handled once per frame: measure the target, move the preview.
    const onFrame = () => {
      pointerFrame = 0;
      update();
      placePreview();
    };

    const finish = (commit: boolean) => {
      const current = session.current;
      session.current = null;
      show(null);
      if (!current) return;
      if (current.moved) {
        // The press ends in a click on the handle or wherever it was let go; it shouldn't pick or follow anything.
        const swallow = (click: MouseEvent) => { click.preventDefault(); click.stopPropagation(); };
        window.addEventListener("click", swallow, { capture: true, once: true });
        window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
      }
      if (commit && current.moved) {
        // The last move may still be waiting for its frame.
        const target = measure(current.x, current.y) ?? current.target;
        if (target) onDropRef.current(current.id, target.column, target.index, target.row);
      }
    };

    const onMove = (event: PointerEvent) => {
      const current = session.current;
      if (!current || event.pointerId !== current.pointerId) return;
      event.preventDefault();
      current.x = event.clientX;
      current.y = event.clientY;
      if (!current.moved) {
        if (Math.hypot(current.x - current.startX, current.y - current.startY) < DRAG_THRESHOLD) return;
        current.moved = true;
        show({ id: current.id, from: current.from, moved: true, target: current.target });
      }
      if (!pointerFrame) pointerFrame = requestAnimationFrame(onFrame);
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
      if (pointerFrame) cancelAnimationFrame(pointerFrame);
      body.style.cursor = previous.cursor;
      body.style.userSelect = previous.userSelect;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("blur", onBlur);
    };
  }, [dragging, measure, placePreview, show]);

  // Unmounted mid-drag (the row was removed, the page changed): nothing stays highlighted on the other rows.
  useEffect(() => () => {
    if (!session.current) return;
    session.current = null;
    if (sharePageRef.current) publishPageDrag(null);
  }, []);

  return { state, start, previewRef };
}
