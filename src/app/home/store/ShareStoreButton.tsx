"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";

// "Share" on the store hub: copy the link, send it on WhatsApp, or use the phone's share sheet.
export function ShareStoreButton({ url, storeName }: { url: string; storeName: string }) {
  const t = useT("store");
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(t("share.copyPrompt"), url);
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: storeName, text: t("share.text", { name: storeName }), url });
      setOpen(false);
    } catch {
      // Closing the share sheet throws; nothing to do.
    }
  }

  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${t("share.text", { name: storeName })}: ${url}`)}`;
  const item = "flex min-h-[44px] w-full items-center gap-3 rounded-[14px] px-3 text-left text-[14px] font-bold text-app-ink no-underline hover:bg-app-canvas";

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-app-line bg-white px-5 text-[14px] font-extrabold text-app-ink transition hover:border-app-line-strong"
      >
        <Icon name="upload" size={16} /> {t("share.button")}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-[calc(100%+8px)] z-30 w-[260px] max-w-[calc(100vw-32px)] rounded-[18px] border border-app-line bg-white p-2 shadow-[0_18px_40px_-12px_rgba(22,20,31,0.25)]">
          <p className="m-0 truncate px-3 pb-2 pt-1 text-[12.5px] text-app-ink-soft">{url.replace(/^https?:\/\//, "")}</p>
          <button type="button" role="menuitem" onClick={() => void copy()} className={item}>
            <Icon name={copied ? "check" : "copy"} size={16} /> {copied ? t("share.copied") : t("share.copy")}
          </button>
          <a role="menuitem" href={whatsapp} target="_blank" rel="noopener noreferrer" className={item} onClick={() => setOpen(false)}>
            <Icon name="whatsapp" size={16} /> {t("share.wa")}
          </a>
          {canShare && (
            <button type="button" role="menuitem" onClick={() => void nativeShare()} className={item}>
              <Icon name="send" size={16} /> {t("share.more")}
            </button>
          )}
          <span className="sr-only" aria-live="polite">{copied ? t("share.copied") : ""}</span>
        </div>
      )}
    </div>
  );
}
