"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatDate } from "@shared/i18n";
import { slideDurationMs } from "@shared/weekly-updates";
import { SLIDE_CSS, UpdateSlide, type SlideUpdate } from "./UpdateSlide";

// Weekly updates from the Shopinbos team, played like a status: the ring in the top bar (UpdatesRing) shows when
// there are any for this role and lights up while some are unseen; tapping it plays them in order, starting at the
// first unseen one. Tap the right side for the next, the left for the previous, hold to pause; arrows, Space and
// Escape work too. Each update is marked seen the moment it shows (POST /api/updates/:id/view).

export interface ViewerUpdate extends SlideUpdate {
  durationSeconds: number | null;
  cta: { label: string; url: string } | null;
  publishedAt: string;
  seen: boolean;
}

export function UpdatesRing({ role }: { role: string }) {
  const t = useT("nav");
  const [updates, setUpdates] = useState<ViewerUpdate[]>([]);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (role !== "seller" && role !== "supplier" && role !== "logistics_partner") return;
    let stopped = false;
    fetch("/api/updates", { credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { data?: ViewerUpdate[] } | null) => {
        if (!stopped && Array.isArray(body?.data)) setUpdates(body.data);
      })
      .catch(() => undefined);
    return () => {
      stopped = true;
    };
  }, [role]);

  const markSeen = useCallback((id: string) => {
    setUpdates((current) => current.map((update) => (update.id === id && !update.seen ? { ...update, seen: true } : update)));
    void fetch(`/api/updates/${encodeURIComponent(id)}/view`, { method: "POST", credentials: "same-origin" }).catch(() => undefined);
  }, []);

  if (!updates.length) return null;
  const unseen = updates.filter((update) => !update.seen).length;
  const start = Math.max(0, updates.findIndex((update) => !update.seen));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(start)}
        data-updates-ring={unseen ? "new" : "seen"}
        aria-label={unseen ? t("updates.ringNew", { count: unseen }) : t("updates.ring")}
        title={unseen ? t("updates.ringNew", { count: unseen }) : t("updates.ring")}
        className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full p-[2.5px] sm:h-[42px] sm:w-[42px]"
        style={{ background: unseen ? "conic-gradient(from 210deg, #73D8C8, #2E7E78, #F2A93B, #73D8C8)" : "rgb(14 42 56 / 0.14)" }}
      >
        <span className="grid h-full w-full place-items-center rounded-full border-2 border-white bg-[#0E2A38] text-[#73D8C8]">
          <Icon name="megaphone" size={15} />
        </span>
        {unseen > 0 && (
          <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#E86A4F] px-1 text-[10.5px] font-extrabold leading-none text-white">
            {unseen > 9 ? "9+" : unseen}
          </span>
        )}
      </button>
      {open !== null && <UpdatesViewer updates={updates} startAt={open} onSeen={markSeen} onClose={() => setOpen(null)} />}
    </>
  );
}

export function UpdatesViewer({ updates, startAt = 0, onSeen, onClose }: { updates: ViewerUpdate[]; startAt?: number; onSeen?: (id: string) => void; onClose: () => void }) {
  const t = useT("nav");
  const locale = useLocale();
  const [index, setIndex] = useState(Math.min(startAt, updates.length - 1));
  const [elapsed, setElapsed] = useState(0);
  const [videoFraction, setVideoFraction] = useState(0);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const holdTimer = useRef<number | null>(null);
  const wasHeld = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const update = updates[index]!;
  const fileVideo = update.kind === "video" && update.video?.kind === "file";
  const duration = slideDurationMs(update);
  const stopped = paused || held;

  const go = useCallback(
    (next: number) => {
      if (next >= updates.length) return onClose();
      setIndex(Math.max(0, next));
      setElapsed(0);
      setVideoFraction(0);
    },
    [onClose, updates.length],
  );

  // Seen the moment it shows.
  useEffect(() => {
    if (!update.seen) onSeen?.(update.id);
  }, [update.id, update.seen, onSeen]);

  // The clock for cards and embedded videos (an uploaded video moves on when it ends).
  useEffect(() => {
    if (stopped || fileVideo) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      setElapsed((current) => current + (now - last));
      last = now;
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [stopped, fileVideo, index]);

  useEffect(() => {
    if (!fileVideo && elapsed >= duration) go(index + 1);
  }, [elapsed, duration, fileVideo, go, index]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      } else if (event.key === "ArrowRight") go(index + 1);
      else if (event.key === "ArrowLeft") go(index - 1);
      else if (event.key === " " && !(event.target instanceof HTMLButtonElement) && !(event.target instanceof HTMLAnchorElement)) {
        event.preventDefault();
        setPaused((value) => !value);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [go, index, onClose]);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, []);

  const progress = (i: number) => (i < index ? 1 : i > index ? 0 : fileVideo ? videoFraction : Math.min(1, elapsed / duration));

  // Hold anywhere on the card to pause; a quick tap on the left or right goes back or forward.
  const onPointerDown = () => {
    wasHeld.current = false;
    holdTimer.current = window.setTimeout(() => {
      wasHeld.current = true;
      setHeld(true);
    }, 220);
  };
  const onPointerUp = (side: "back" | "next") => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    setHeld(false);
    if (!wasHeld.current) go(side === "back" ? index - 1 : index + 1);
  };

  const body = (
    <div className="fixed inset-0 z-[95] flex items-stretch justify-center bg-[rgba(6,18,26,0.86)] font-app sm:items-center sm:p-6" data-updates-viewer="">
      <style>{SLIDE_CSS}</style>
      <div aria-hidden className="absolute inset-0" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t("updates.title")}
        className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-black outline-none sm:aspect-[9/16] sm:h-[min(860px,92dvh)] sm:w-auto sm:rounded-[26px] sm:shadow-[0_40px_120px_-30px_rgba(0,0,0,0.7)]"
      >
        <div className="absolute inset-0">
          <UpdateSlide update={update} paused={stopped} restartKey={`${update.id}-${index}`} onVideoEnded={() => go(index + 1)} onVideoTime={setVideoFraction} />
        </div>

        {/* Tap zones (under the header and the button) */}
        <div className="absolute inset-0 flex" aria-hidden>
          {(["back", "next"] as const).map((side) => (
            <div
              key={side}
              className={side === "back" ? "w-1/3" : "flex-1"}
              onPointerDown={onPointerDown}
              onPointerUp={() => onPointerUp(side)}
              onPointerLeave={() => {
                if (holdTimer.current) window.clearTimeout(holdTimer.current);
                setHeld(false);
              }}
              onContextMenu={(event) => event.preventDefault()}
            />
          ))}
        </div>

        <div className="pointer-events-none relative bg-gradient-to-b from-black/55 to-transparent px-3 pb-6 pt-[max(12px,env(safe-area-inset-top))]">
          <div className="flex gap-1">
            {updates.map((item, i) => (
              <span key={item.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
                <span className="block h-full rounded-full bg-white" style={{ width: `${progress(i) * 100}%` }} />
              </span>
            ))}
          </div>
          <div className="pointer-events-auto mt-2.5 flex items-center gap-2.5 text-white">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#73D8C8] text-[13px] font-extrabold text-[#0E2A38]">S</span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[14px] font-extrabold">{t("updates.from")}</span>
              <span className="block text-[12px] text-white/75">{formatDate(update.publishedAt, locale, { day: "numeric", month: "short" })}</span>
            </span>
            <button type="button" onClick={() => setPaused((value) => !value)} aria-label={paused ? t("updates.play") : t("updates.pause")} className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/15">
              <Icon name={paused ? "play" : "pause"} size={17} />
            </button>
            <button type="button" onClick={onClose} aria-label={t("updates.close")} className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/15">
              <Icon name="x" size={18} />
            </button>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-4">
          <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label={t("updates.previous")} className="pointer-events-auto hidden h-10 w-10 place-items-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25 disabled:opacity-30 sm:grid">
            <Icon name="chevRight" size={16} className="rotate-180" />
          </button>
          <span className="flex-1" />
          {update.cta && (
            <Link
              href={update.cta.url}
              onClick={onClose}
              {...(update.cta.url.startsWith("/") ? {} : { target: "_blank", rel: "noopener noreferrer" })}
              className="pointer-events-auto inline-flex min-h-[46px] items-center gap-2 rounded-full bg-[#73D8C8] px-5 text-[14.5px] font-bold text-[#0E2A38] no-underline shadow-lg"
            >
              {update.cta.label} <Icon name="arrow" size={15} />
            </Link>
          )}
          <span className="flex-1" />
          <button type="button" onClick={() => go(index + 1)} aria-label={t("updates.next")} className="pointer-events-auto hidden h-10 w-10 place-items-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25 sm:grid">
            <Icon name="chevRight" size={16} />
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(body, document.body);
}
