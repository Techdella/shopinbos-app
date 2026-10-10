'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '../cn';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** bottom = mobile-style sheet; right = web drawer (Ask Peggy). */
  side?: 'bottom' | 'right';
  className?: string;
}

/** Modal sheet built on <dialog>: focus trap, Escape and backdrop close come from the platform. */
export function Sheet({ open, onClose, title, children, side = 'bottom', className }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal?.();
    if (!open && dialog.open) dialog.close?.();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        'm-0 max-h-none max-w-none bg-paper p-0 text-ink backdrop:bg-ink/40',
        side === 'bottom' &&
          'top-auto bottom-0 left-0 w-full rounded-t-card-mobile animate-[sb-sheet-in_200ms_ease-out]',
        side === 'right' && 'top-0 right-0 left-auto h-dvh w-full max-w-[420px]',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-4 px-5 pt-5 pb-3">
        <h2 id={titleId} className="text-lg font-bold">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="inline-flex size-11 items-center justify-center rounded-full hover:bg-canvas focus-visible:outline-2 focus-visible:outline-info"
        >
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className="px-5 pb-6">{children}</div>
    </dialog>
  );
}
