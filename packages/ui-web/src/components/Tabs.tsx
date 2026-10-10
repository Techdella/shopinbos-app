'use client';
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../cn';

export interface TabItem {
  key: string;
  label: ReactNode;
  content: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (key: string) => void;
  label: string;
  className?: string;
}

/** Underline tabs with arrow-key navigation (WAI-ARIA tabs pattern). */
export function Tabs({ items, value, onChange, label, className }: TabsProps) {
  const baseId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(
    0,
    items.findIndex((t) => t.key === value),
  );

  const onKeyDown = (e: KeyboardEvent) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (index + delta + items.length) % items.length;
    const item = items[next];
    if (item) {
      onChange(item.key);
      refs.current[next]?.focus();
    }
  };

  const active = items[index];
  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={label}
        className="flex gap-6 border-b border-line"
        onKeyDown={onKeyDown}
      >
        {items.map((t, i) => {
          const selected = t.key === active?.key;
          return (
            <button
              key={t.key}
              ref={(el) => {
                refs.current[i] = el;
              }}
              id={`${baseId}-tab-${t.key}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${t.key}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(t.key)}
              className={cn(
                '-mb-px min-h-11 border-b-2 text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-info',
                selected ? 'border-ink text-ink' : 'border-transparent text-sub hover:text-ink',
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {active && (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${active.key}`}
          aria-labelledby={`${baseId}-tab-${active.key}`}
          className="pt-4"
        >
          {active.content}
        </div>
      )}
    </div>
  );
}
