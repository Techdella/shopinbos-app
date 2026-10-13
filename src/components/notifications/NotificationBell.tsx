"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/app-ui";
import { setUnread, useLiveRefresh, useUnreadCount } from "./client";
import { NotificationFeed } from "./NotificationFeed";
import { PushPromptCard } from "./PushToggle";
import { useT } from "@/components/i18n/I18nProvider";

// The top bar's bell: unread count (kept live), and a side panel with the notification feed, "Turn on
// notifications" for this browser, and links to all notifications and the settings.
// The panel is portalled to <body>: the top bar uses backdrop-blur, which would otherwise make it the containing
// block for position:fixed and squeeze the panel into the bar's 64px.

export function NotificationBell({ role, initialUnread = 0 }: { role: string; initialUnread?: number }) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const unread = useUnreadCount(initialUnread);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const t = useT("notifications", "common");

  // The count, while the panel is closed (the feed keeps it fresh while open).
  const refreshCount = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications?limit=1&tab=unread", { credentials: "include", cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as { data?: { unreadCount?: number } };
      if (typeof body.data?.unreadCount === "number") setUnread(body.data.unreadCount);
    } catch {
      // offline: try again next tick
    }
  }, []);
  useLiveRefresh(() => void refreshCount(), !open);

  const close = useCallback(() => {
    setVisible(false);
    setTimeout(() => setOpen(false), 180);
    buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => setVisible(true));
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-tour="notifications"
        aria-label={unread ? t("bellUnread", { count: unread }) : t("title")}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="relative grid h-[42px] w-[42px] place-items-center rounded-full border border-app-line hover:border-app-line-strong"
      >
        <Icon name="bell" size={17} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-app-accent px-1 text-[10.5px] font-extrabold leading-none text-white ring-2 ring-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[60] font-app text-app-ink">
          <div aria-hidden onClick={close} className={cx("absolute inset-0 bg-[rgba(22,20,31,0.35)] transition-opacity duration-200", visible ? "opacity-100" : "opacity-0")} />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={t("title")}
            tabIndex={-1}
            className={cx(
              "absolute right-0 top-0 flex h-full w-full max-w-[440px] flex-col border-l border-app-line bg-white shadow-[0_20px_60px_-20px_rgba(22,20,31,0.35)] outline-none transition-transform duration-200",
              visible ? "translate-x-0" : "translate-x-full",
            )}
          >
            <div className="flex items-center gap-2 px-4 pb-3 pt-4">
              <h2 className="m-0 flex-1 text-[18px] font-extrabold">{t("title")}</h2>
              <Link href="/home/notifications/preferences" onClick={close} aria-label={t("settings")} className="grid h-9 w-9 place-items-center rounded-full hover:bg-app-canvas">
                <Icon name="settings" size={16} />
              </Link>
              <button type="button" onClick={close} aria-label={t("close")} className="grid h-9 w-9 place-items-center rounded-full hover:bg-app-canvas">
                <Icon name="x" size={16} />
              </button>
            </div>
            <PushPromptCard className="mx-4 mb-3" />
            <NotificationFeed role={role} compact onNavigate={close} />
            <div className="border-t border-app-line px-4 py-3">
              <Link href="/home/notifications" onClick={close} className="flex min-h-[40px] items-center justify-center gap-1.5 rounded-full text-[14px] font-bold text-app-ink no-underline hover:bg-app-canvas">
                {t("seeAll")} <Icon name="arrow" size={14} />
              </Link>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
