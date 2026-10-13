"use client";

import { useEffect, useRef } from "react";
import { Icon } from "./Icon";
import { useT } from "@/components/i18n/I18nProvider";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "info";
  icon?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function ConfirmDialog({
  open, title, message, confirmLabel: givenConfirm, cancelLabel: givenCancel,
  variant = "warning", icon, onConfirm, onCancel, loading,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const t = useT("ui", "common");
  const confirmLabel = givenConfirm ?? t("confirm");
  const cancelLabel = givenCancel ?? t("cancel");

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const variantStyles = {
    danger:  { bg: "var(--rose-50)", border: "var(--rose-300)", icon: "var(--danger)" },
    warning: { bg: "var(--amber-50)", border: "var(--amber-300)", icon: "var(--amber-600)" },
    info:    { bg: "var(--teal-50)", border: "var(--teal-300)", icon: "var(--teal-600)" },
  };

  const vs = variantStyles[variant];
  const iconName = icon ?? (variant === "danger" ? "warn" : variant === "warning" ? "warn" : "info");

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1200,
        background: "rgba(0,0,0,0.5)", display: "grid", placeItems: "center",
        animation: "fadeIn 0.15s ease",
      }}
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        style={{
          background: "var(--paper)", borderRadius: 14, padding: 0,
          maxWidth: 420, width: "90%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          animation: "slideUp 0.2s ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "22px 24px 0", display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: vs.bg, border: `1px solid ${vs.border}`,
            display: "grid", placeItems: "center", flexShrink: 0,
            color: vs.icon,
          }}>
            <Icon name={iconName as any} size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--ink-900)", marginBottom: 6 }}>{title}</div>
            <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--ink-600)" }}>{message}</div>
          </div>
        </div>
        <div style={{ padding: "18px 24px 20px", display: "flex", gap: 8, justifyContent: "flex-end", borderTop: "1px solid var(--ink-100)", marginTop: 18 }}>
          <button
            onClick={onCancel}
            disabled={loading}
            className="dbtn dBtn-ghost"
            style={{ border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="dbtn"
            style={{
              border: "none", cursor: loading ? "wait" : "pointer", fontFamily: "inherit",
              background: variant === "danger" ? "var(--danger)" : variant === "warning" ? "var(--amber-600)" : "var(--teal-600)",
              color: "#fff", fontSize: 13, fontWeight: 600, padding: "8px 18px", borderRadius: 8,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? `${confirmLabel}...` : confirmLabel}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(12px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
    </div>
  );
}
