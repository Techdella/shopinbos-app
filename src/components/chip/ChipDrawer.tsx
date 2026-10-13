"use client";

import { useEffect, useState } from "react";
import { ChipAvatar } from "@/components/brand/ChipAvatar";
import { useRexDrawer } from "@/components/rex/RexDrawerContext";
import { useT } from "@/components/i18n/I18nProvider";

interface ChipDrawerProps {
  tone?: string;
  message?: string;
}

const STORAGE_KEY = "rex_chip_dismissed";

export function ChipDrawer({
  tone = "assistant",
  message,
}: ChipDrawerProps) {
  const t = useT("rex");
  const { openDrawer } = useRexDrawer();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== "true") setDismissed(false);
  }, []);

  function handleDismiss() {
    setDismissed(true);
    localStorage.setItem(STORAGE_KEY, "true");
  }

  if (dismissed || !message?.trim()) return null;

  return (
    <div className="fixed right-7 bottom-7 flex flex-col items-end gap-3 z-50 pointer-events-none">
      {/* Speech bubble */}
      <div
        className="pointer-events-auto relative bg-white rounded-2xl px-3.5 py-3 max-w-[280px] text-[13px] leading-[1.45]"
        style={{ boxShadow: "var(--shadow-lg)", color: "var(--color-navy)" }}
      >
        <button
          onClick={handleDismiss}
          aria-label={t("drawer.dismiss")}
          style={{
            position: "absolute", top: -6, right: -6, width: 20, height: 20,
            borderRadius: "50%", border: "none", background: "var(--ink-300)",
            color: "white", cursor: "pointer", display: "grid", placeItems: "center",
            fontSize: 11, lineHeight: 1, padding: 0,
          }}
        >
          ✕
        </button>
        <div
          className="font-mono text-[10px] tracking-[0.1em] mb-1"
          style={{ color: "var(--color-teal-deep)" }}
        >
          REX &middot; {tone.toUpperCase()}
        </div>
        {message}
        {/* Tail */}
        <div
          className="absolute -bottom-1.5 right-9 w-3 h-3 bg-white rotate-45"
          aria-hidden
        />
      </div>

      {/* FAB */}
      <button
        onClick={() => openDrawer()}
        className="pointer-events-auto w-16 h-16 rounded-[20px] flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
        style={{
          background: "var(--color-mint)",
          border: "none",
          cursor: "pointer",
          boxShadow: "0 8px 24px rgb(115 216 200 / 0.4)",
        }}
        aria-label={t("drawer.openRex")}
      >
        <ChipAvatar mascot="rex" size={48} />
      </button>
    </div>
  );
}
