"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui";
import { durationLabel, helpLanguage, type HelpVideoRole, type VideoSource } from "@shared/help-videos";

// "Watch a 1-minute video" in the Help panel (build spec 8A). Shows the video for the current screen, in the
// person's language when there is one (else English), plus "All videos" for their role. With nothing published
// for this screen the option isn't shown at all. Videos come from GET /api/help-videos.

export interface HelpVideoItem {
  id: string;
  topic: string;
  title: string;
  language: string;
  posterUrl: string | null;
  durationSeconds: number | null;
  source: VideoSource;
}

function roleFor(role: string | null): HelpVideoRole | null {
  return role === "seller" || role === "supplier" || role === "logistics_partner" ? role : null;
}

export function HelpVideosSection({ role }: { role: string | null }) {
  const [current, setCurrent] = useState<HelpVideoItem | null>(null);
  const [all, setAll] = useState<HelpVideoItem[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [playing, setPlaying] = useState<HelpVideoItem | null>(null);

  useEffect(() => {
    let stopped = false;
    const params = new URLSearchParams({ path: window.location.pathname, lang: helpLanguage(document.documentElement.lang || navigator.language) });
    const forRole = roleFor(role);
    if (forRole) params.set("role", forRole);
    fetch(`/api/help-videos?${params}`, { credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { data?: { current: HelpVideoItem | null; all: HelpVideoItem[] } } | null) => {
        if (stopped || !body?.data) return;
        setCurrent(body.data.current);
        setAll(body.data.all ?? []);
      })
      .catch(() => undefined);
    return () => {
      stopped = true;
    };
  }, [role]);

  if (!current && all.length === 0) return null;

  return (
    <>
      {current && (
        <button
          type="button"
          onClick={() => setPlaying(current)}
          data-help-video="current"
          className="flex items-center gap-3 rounded-[18px] border border-app-line bg-white px-4 py-3.5 text-left transition hover:border-app-line-strong"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-app-peach text-app-accent-ink">
            <Icon name="play" size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-extrabold">Watch a 1-minute video</span>
            <span className="block truncate text-[12.5px] text-app-ink-soft">{current.title}</span>
          </span>
          <Icon name="chevron" size={14} />
        </button>
      )}
      {all.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowAll(!showAll)} aria-expanded={showAll} className="flex min-h-[40px] items-center gap-1.5 px-1 text-[13.5px] font-bold text-app-ink underline-offset-2 hover:underline">
            <Icon name="play" size={12} /> All videos ({all.length})
          </button>
          {showAll && (
            <ul className="m-0 mt-1 grid list-none gap-1.5 p-0">
              {all.map((video) => (
                <li key={video.id}>
                  <button type="button" onClick={() => setPlaying(video)} className="flex w-full items-center gap-3 rounded-[14px] px-2 py-2 text-left hover:bg-app-canvas">
                    <span className="relative h-11 w-16 shrink-0 overflow-hidden rounded-[10px] bg-app-canvas">
                      {video.posterUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={video.posterUrl} alt="" className="h-full w-full object-cover" />
                      ) : null}
                      <span className="absolute inset-0 grid place-items-center text-app-ink"><span className="grid h-6 w-6 place-items-center rounded-full bg-white/90"><Icon name="play" size={10} /></span></span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-bold">{video.title}</span>
                      <span className="block text-[12px] text-app-ink-soft">{durationLabel(video.durationSeconds)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {playing && <HelpVideoDialog video={playing} onClose={() => setPlaying(null)} />}
    </>
  );
}

/** The player, in a dialog over the Help panel. Files play in <video>; YouTube and Vimeo in their embeds. */
export function HelpVideoDialog({ video, onClose }: { video: Pick<HelpVideoItem, "title" | "posterUrl" | "source">; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const source = video.source;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4 font-app" role="dialog" aria-modal="true" aria-label={video.title}>
      <div className="absolute inset-0 bg-[rgba(22,20,31,0.6)]" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-[720px] overflow-hidden rounded-[22px] bg-white shadow-2xl">
        <div className="flex items-center gap-3 px-4 py-3">
          <h2 className="m-0 min-w-0 flex-1 truncate text-[15px] font-extrabold text-app-ink">{video.title}</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close video" className="grid h-9 w-9 place-items-center rounded-full bg-app-canvas text-app-ink-soft hover:text-app-ink">
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="aspect-video w-full bg-black">
          {source.kind === "file" ? (
            <video src={source.url} poster={video.posterUrl ?? undefined} controls autoPlay playsInline className="h-full w-full" data-help-video="player" />
          ) : (
            <iframe
              src={`${source.embedUrl}&autoplay=1`}
              title={video.title}
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              className="h-full w-full border-0"
              data-help-video="player"
            />
          )}
        </div>
      </div>
    </div>
  );
}
