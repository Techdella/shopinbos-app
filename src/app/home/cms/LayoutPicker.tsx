"use client";

import { useId, type ReactNode } from "react";
import { cx } from "@/components/app-ui";

// A row of layout choices drawn as small wireframes (radio buttons underneath, so keyboards and screen
// readers get a normal radio group). Used for a collection's list and item layouts and an item's own layout.

export interface LayoutOption<T extends string> {
  value: T;
  label: string;
  help?: string;
}

export function LayoutPicker<T extends string>({ legend, help, options, value, onChange }: { legend: string; help?: string; options: LayoutOption<T>[]; value: T; onChange: (value: T) => void }) {
  const name = useId();
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-1.5 block p-0 text-[13.5px] font-bold">
        {legend}
        {help && <span className="block text-[12.5px] font-normal text-app-ink-soft">{help}</span>}
      </legend>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {options.map((option) => (
          <label
            key={option.value}
            className={cx(
              "flex cursor-pointer flex-col gap-2 rounded-[16px] border bg-white p-2.5 transition focus-within:ring-2 focus-within:ring-app-ink/30",
              value === option.value ? "border-app-ink ring-1 ring-app-ink" : "border-app-line hover:border-app-line-strong",
            )}
          >
            <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} className="sr-only" />
            <span className="block overflow-hidden rounded-[10px] bg-app-canvas"><LayoutSketch kind={option.value} /></span>
            <span className="text-[13.5px] font-bold leading-tight">{option.label}</span>
            {option.help && <span className="-mt-1 text-[12px] leading-snug text-app-ink-soft">{option.help}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const ink = "currentColor";

function LayoutSketch({ kind }: { kind: string }) {
  const block = (x: number, y: number, w: number, h: number, o = 0.18, r = 2) => <rect key={`${x}-${y}-${w}-${h}`} x={x} y={y} width={w} height={h} rx={r} fill={ink} opacity={o} />;
  const line = (x: number, y: number, w: number, o = 0.3) => block(x, y, w, 2.5, o, 1.25);
  let shapes: ReactNode[] = [];
  switch (kind) {
    case "grid":
      shapes = [0, 1, 2].flatMap((col) => [0, 1].flatMap((row) => [block(6 + col * 30, 6 + row * 30, 26, 15), line(6 + col * 30, 24 + row * 30, 20)]));
      break;
    case "list":
      shapes = [0, 1, 2, 3].flatMap((row) => [block(6, 6 + row * 14, 18, 10), line(28, 8 + row * 14, 50), line(28, 12.5 + row * 14, 36, 0.18)]);
      break;
    case "magazine":
      shapes = [block(6, 6, 52, 28), line(62, 12, 30), line(62, 18, 24, 0.18), line(62, 23, 28, 0.18), ...[0, 1, 2].flatMap((col) => [block(6 + col * 30, 40, 26, 13), line(6 + col * 30, 56, 18)])];
      break;
    case "compact":
      shapes = [0, 1, 2, 3, 4].flatMap((row) => [line(6, 9 + row * 12, 54), line(74, 9 + row * 12, 16, 0.18), block(6, 14 + row * 12, 84, 0.6, 0.15, 0)]);
      break;
    case "classic":
      shapes = [line(22, 7, 52, 0.4), line(22, 12, 30, 0.18), block(22, 18, 52, 20), ...[0, 1, 2, 3].map((row) => line(22, 42 + row * 4.5, row === 3 ? 34 : 52, 0.2))];
      break;
    case "wide":
      shapes = [block(4, 4, 88, 32, 0.32, 3), line(10, 25, 44, 0.75), line(10, 30, 24, 0.5), ...[0, 1, 2, 3].map((row) => line(18, 42 + row * 4.5, row === 3 ? 40 : 60, 0.2))];
      break;
    case "sidebar":
      shapes = [line(6, 7, 44, 0.4), block(6, 13, 56, 18), ...[0, 1, 2, 3, 4].map((row) => line(6, 35 + row * 4.5, row === 4 ? 36 : 56, 0.2)), block(68, 7, 24, 24, 0.12), block(68, 35, 24, 24, 0.12)];
      break;
    case "minimal":
      shapes = [line(30, 9, 36, 0.4), line(38, 14, 20, 0.18), ...[0, 1, 2, 3, 4, 5, 6].map((row) => line(28, 22 + row * 5, row === 6 ? 26 : 40, 0.2))];
      break;
    default:
      shapes = [block(10, 10, 76, 40, 0.12)];
  }
  return (
    <svg viewBox="0 0 96 64" className="block h-auto w-full text-app-ink" aria-hidden>
      {shapes}
    </svg>
  );
}
