"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

type ToastVariant = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextType {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const variantStyles: Record<ToastVariant, { bg: string; icon: IconName; border: string }> = {
  success: { bg: "var(--success-bg)", icon: "check", border: "var(--success)" },
  error: { bg: "var(--error-bg, #FEF2F2)", icon: "x", border: "var(--error, #EF4444)" },
  info: { bg: "var(--teal-50)", icon: "info", border: "var(--teal-600)" },
  warning: { bg: "var(--amber-50, #FFFBEB)", icon: "warn", border: "var(--amber-500, #F59E0B)" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, variant: ToastVariant = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <div style={{
        position: "fixed", bottom: 20, right: 20, zIndex: 9999,
        display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none",
      }}>
        {toasts.map((t) => {
          const s = variantStyles[t.variant];
          return (
            <div key={t.id} style={{
              background: s.bg, border: `1px solid ${s.border}`,
              borderRadius: 10, padding: "10px 14px", maxWidth: 360,
              display: "flex", alignItems: "center", gap: 10,
              boxShadow: "0 2px 12px rgba(0,0,0,0.1)",
              pointerEvents: "auto",
              animation: "toast-in 0.2s ease-out",
            }}>
              <Icon name={s.icon} size={16} color={s.border} />
              <span style={{ fontSize: 13, lineHeight: 1.4, flex: 1 }}>{t.message}</span>
              <button onClick={() => removeToast(t.id)} style={{
                background: "none", border: "none", cursor: "pointer", padding: 2,
              }}>
                <Icon name="x" size={14} color="var(--ink-500)" />
              </button>
            </div>
          );
        })}
      </div>
      <style>{`@keyframes toast-in { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }`}</style>
    </ToastContext.Provider>
  );
}
