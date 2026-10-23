"use client";

import type { VideoSource } from "@shared/help-videos";
import { motionLines, motionStyle, updateTheme, type UpdateKind } from "@shared/weekly-updates";

// One weekly update as a 9:16 card: the viewer (UpdatesViewer) plays these, and /admin/updates previews them while
// you write. Text and motion cards are words on a brand colour; motion lines animate in one after another.

export interface SlideUpdate {
  id: string;
  kind: UpdateKind;
  title: string;
  body: string | null;
  theme: string;
  motion: string | null;
  imageUrl: string | null;
  video: VideoSource | null;
  posterUrl: string | null;
}

export const SLIDE_CSS = `
@keyframes upd-rise { from { opacity: 0; transform: translateY(26px); filter: blur(4px) } to { opacity: 1; transform: none; filter: none } }
@keyframes upd-slide { from { opacity: 0; transform: translateX(-34px) } to { opacity: 1; transform: none } }
@keyframes upd-pop { 0% { opacity: 0; transform: scale(.6) } 70% { opacity: 1; transform: scale(1.06) } 100% { opacity: 1; transform: none } }
@keyframes upd-orb { 0%,100% { transform: translate(0,0) scale(1) } 50% { transform: translate(-18px,14px) scale(1.12) } }
@keyframes upd-zoom { from { transform: scale(1) } to { transform: scale(1.08) } }
.upd-line { opacity: 0; animation-fill-mode: forwards; animation-timing-function: cubic-bezier(.2,.8,.2,1) }
.upd-paused .upd-line, .upd-paused .upd-orb, .upd-paused .upd-zoom { animation-play-state: paused }
@media (prefers-reduced-motion: reduce) { .upd-line { animation: none !important; opacity: 1 } .upd-orb, .upd-zoom { animation: none !important } }
`;

export function UpdateSlide({ update, paused = false, restartKey, onVideoEnded, onVideoTime, muted = false, className = "" }: {
  update: SlideUpdate;
  paused?: boolean;
  restartKey?: string | number;
  onVideoEnded?: () => void;
  onVideoTime?: (fraction: number) => void;
  muted?: boolean;
  className?: string;
}) {
  const theme = updateTheme(update.theme);

  if (update.kind === "video" && update.video) {
    const source = update.video;
    return (
      <div className={`relative flex h-full w-full flex-col justify-center bg-black ${className}`}>
        {source.kind === "file" ? (
          <video
            key={`${source.url}-${restartKey ?? ""}`}
            ref={(node) => {
              if (!node) return;
              if (paused && !node.paused) node.pause();
              else if (!paused && node.paused) void node.play().catch(() => undefined);
            }}
            src={source.url}
            poster={update.posterUrl ?? undefined}
            playsInline
            autoPlay={!paused}
            muted={muted}
            onEnded={onVideoEnded}
            onTimeUpdate={(event) => {
              const node = event.currentTarget;
              if (node.duration) onVideoTime?.(node.currentTime / node.duration);
            }}
            className="h-full w-full object-contain"
          />
        ) : (
          <iframe
            key={`${source.embedUrl}-${restartKey ?? ""}`}
            src={`${source.embedUrl}&autoplay=1`}
            title={update.title}
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="aspect-video w-full border-0"
          />
        )}
        <Caption title={update.title} body={update.body} />
      </div>
    );
  }

  if (update.kind === "image" && update.imageUrl) {
    return (
      <div className={`relative h-full w-full overflow-hidden bg-black ${paused ? "upd-paused" : ""} ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={restartKey} src={update.imageUrl} alt="" className="upd-zoom h-full w-full object-cover" style={{ animation: "upd-zoom 9s ease-out forwards" }} />
        <Caption title={update.title} body={update.body} />
      </div>
    );
  }

  const motion = update.kind === "motion";
  const style = motionStyle(update.motion);
  const lines = motion ? motionLines(update.body) : [];
  return (
    <div
      key={restartKey}
      className={`relative flex h-full w-full flex-col justify-center overflow-hidden px-7 py-16 ${paused ? "upd-paused" : ""} ${className}`}
      style={{ backgroundColor: theme.bg, color: theme.ink }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: `radial-gradient(${theme.accent}22 1px, transparent 1px)`, backgroundSize: "20px 20px" }} />
      <div aria-hidden className="upd-orb pointer-events-none absolute -right-20 -top-16 h-64 w-64 rounded-full opacity-40 blur-3xl" style={{ background: theme.accent, animation: "upd-orb 9s ease-in-out infinite" }} />
      <div aria-hidden className="upd-orb pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full opacity-25 blur-3xl" style={{ background: theme.accent, animation: "upd-orb 11s ease-in-out infinite reverse" }} />
      <h3
        className={`relative m-0 text-[27px] font-extrabold leading-[1.1] tracking-[-0.5px] ${motion ? "upd-line" : ""}`}
        style={motion ? { animationName: `upd-${style}`, animationDuration: "700ms" } : undefined}
      >
        {update.title}
      </h3>
      {motion ? (
        <div className="relative mt-5 grid gap-2">
          {lines.map((line, index) => (
            <p
              key={index}
              className="upd-line m-0 text-[19px] font-semibold leading-[1.3]"
              style={{ animationName: `upd-${style}`, animationDuration: "650ms", animationDelay: `${600 + index * 650}ms` }}
            >
              {index === 0 ? <span style={{ color: theme.accent }}>{line}</span> : line}
            </p>
          ))}
        </div>
      ) : (
        update.body && <p className="relative m-0 mt-4 whitespace-pre-line text-[18px] leading-[1.45]">{update.body}</p>
      )}
    </div>
  );
}

function Caption({ title, body }: { title: string; body: string | null }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-5 pb-20 pt-16 text-white">
      <p className="m-0 text-[20px] font-extrabold leading-[1.2]">{title}</p>
      {body && <p className="m-0 mt-1.5 line-clamp-4 whitespace-pre-line text-[15px] leading-[1.4] text-white/85">{body}</p>}
    </div>
  );
}
