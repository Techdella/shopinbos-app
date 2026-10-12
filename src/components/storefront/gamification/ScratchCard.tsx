"use client";

import { useEffect, useRef, useState } from "react";
import type React from "react";
import { prefersReducedMotion, textOn, type GameColors } from "./client";

// A scratch card: the prize sits underneath a canvas foil the shopper scratches with a finger or mouse.
// Once about half is scratched the rest falls away. Keyboard and reduced-motion users get a "Reveal" button
// (always there), so nobody has to scratch.

export function ScratchCard({ colors, children, onRevealed, width = 300, height = 170, disabled = false }: { colors: GameColors; children: React.ReactNode; onRevealed: () => void; width?: number; height?: number; disabled?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [revealed, setRevealed] = useState(false);
  const drawing = useRef(false);
  const revealedRef = useRef(false);
  const doneRef = useRef(onRevealed);
  doneRef.current = onRevealed;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    ctx.scale(ratio, ratio);
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#C9C9C9");
    gradient.addColorStop(0.5, "#EDEDED");
    gradient.addColorStop(1, "#B5B5B5");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    for (let i = 0; i < 60; i++) ctx.fillRect((i * 53) % width, (i * 29) % height, 2, 2);
    ctx.fillStyle = "#4A4A4A";
    ctx.font = "700 16px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Scratch here", width / 2, height / 2 + 6);
  }, [width, height]);

  function reveal() {
    if (revealedRef.current) return;
    revealedRef.current = true;
    setRevealed(true);
    doneRef.current();
  }

  function scratch(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || disabled || revealedRef.current) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const box = canvas.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * width;
    const y = ((event.clientY - box.top) / box.height) * height;
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, 20, 0, Math.PI * 2);
    ctx.fill();
  }

  function checkCleared() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || revealedRef.current) return;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let clear = 0;
    let total = 0;
    for (let i = 3; i < data.length; i += 64) {
      total++;
      if (data[i]! < 40) clear++;
    }
    if (total && clear / total > 0.5) reveal();
  }

  return (
    <div className="grid justify-items-center gap-3">
      <div className="relative overflow-hidden" style={{ width, maxWidth: "100%", aspectRatio: `${width} / ${height}`, borderRadius: Math.min(colors.radius, 18), background: colors.cta, color: textOn(colors.cta) }}>
        <div className="absolute inset-0 grid place-items-center p-4 text-center">{children}</div>
        <canvas
          ref={canvasRef}
          aria-hidden
          className="absolute inset-0 h-full w-full touch-none"
          style={{ cursor: disabled ? "default" : "grab", opacity: revealed ? 0 : 1, transition: prefersReducedMotion() ? undefined : "opacity 400ms ease", pointerEvents: revealed ? "none" : undefined }}
          onPointerDown={(event) => {
            if (disabled) return;
            drawing.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            scratch(event);
          }}
          onPointerMove={scratch}
          onPointerUp={() => {
            drawing.current = false;
            checkCleared();
          }}
          onPointerCancel={() => {
            drawing.current = false;
          }}
        />
      </div>
      {!revealed ? (
        <button type="button" onClick={reveal} disabled={disabled} className="min-h-11 rounded-full px-5 text-[14px] font-semibold underline underline-offset-4 focus-visible:outline focus-visible:outline-2 disabled:opacity-50" style={{ color: colors.ink }}>
          Reveal without scratching
        </button>
      ) : null}
    </div>
  );
}
