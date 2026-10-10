'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '../cn';

export interface ToastOptions {
  message: string;
  tone?: 'ink' | 'ok' | 'error';
  /** e.g. Undo for add, duplicate and remove in the builder. */
  action?: { label: string; onClick: () => void };
  durationMs?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

const ToastContext = createContext<((t: ToastOptions) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback(
    (id: number) => setItems((all) => all.filter((t) => t.id !== id)),
    [],
  );
  const show = useCallback((t: ToastOptions) => {
    const id = nextId.current++;
    setItems((all) => [...all.slice(-2), { ...t, id }]);
  }, []);
  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        role="status"
        className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2 px-4"
      >
        {items.map((t) => (
          <ToastView key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, item.durationMs ?? 5000);
    return () => clearTimeout(timer);
  }, [item.durationMs, onDismiss]);

  return (
    <div
      className={cn(
        'pointer-events-auto flex items-center gap-4 rounded-pill px-5 py-3 text-sm font-semibold shadow-floating animate-[sb-toast-in_160ms_ease-out]',
        item.tone === 'ok'
          ? 'bg-ok text-paper'
          : item.tone === 'error'
            ? 'bg-accent-text text-paper'
            : 'bg-ink text-paper',
      )}
    >
      <span>{item.message}</span>
      {item.action && (
        <button
          type="button"
          className="min-h-8 rounded-pill px-2 font-bold text-ai-mid underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-paper"
          onClick={() => {
            item.action?.onClick();
            onDismiss();
          }}
        >
          {item.action.label}
        </button>
      )}
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
