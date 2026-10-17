"use client";

// The floating copy of an element that follows the pointer while it is dragged (builder only: the canvas's rows and
// the panel's column lists). A compact card (picture or icon, and the element's name), at most 240px, slightly see-
// through, with a shadow and a small tilt. It sits in a portal on <body>, above the canvas and outside its scaled
// frame, so it lines up with the pointer at any zoom; useColumnDrag moves it with a transform once per frame (via
// `previewRef`) and it goes away with the drag (drop, Escape, cancel or unmount). It never takes the pointer.

import type { ReactNode } from "react";
import { createPortal } from "react-dom";

const GHOST_CSS = `@keyframes bql-ghost-in{from{opacity:0;scale:.9}}@media (prefers-reduced-motion:no-preference){[data-drag-ghost]>div{animation:bql-ghost-in .14s ease-out}}`;

export function DragGhost({ previewRef, label, thumb }: {
  previewRef: (node: HTMLElement | null) => void;
  label: string;
  /** A picture or icon for the card (about 40 × 30). */
  thumb?: ReactNode;
}) {
  // Only drawn during a drag, so always in the browser; the check keeps a server render safe anyway.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={previewRef}
      aria-hidden
      data-drag-ghost=""
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        zIndex: 2147483000,
        pointerEvents: "none",
        maxWidth: 240,
        maxHeight: 240,
        willChange: "transform",
        // Off screen until the hook places it next to the pointer.
        transform: "translate3d(-9999px, -9999px, 0)",
        transformOrigin: "top left",
      }}
    >
      <style>{GHOST_CSS}</style>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          maxWidth: 240,
          padding: "8px 12px 8px 8px",
          borderRadius: 12,
          background: "#fff",
          color: "#16141F",
          border: "1.5px solid #2F66F6",
          boxShadow: "0 14px 34px rgba(22,20,31,.22), 0 2px 6px rgba(22,20,31,.12)",
          opacity: 0.92,
          font: "600 13px/1.3 var(--font-app, system-ui, sans-serif)",
        }}
      >
        {thumb ? <span style={{ display: "grid", placeItems: "center", width: 40, height: 30, flexShrink: 0, overflow: "hidden", borderRadius: 6, background: "#EAF0FF", color: "#2F66F6" }}>{thumb}</span> : null}
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      </div>
    </div>,
    document.body,
  );
}
