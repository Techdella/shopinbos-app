"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import type { BoutiqueLook } from "../look";
import type { PdpVideo } from "./pdp-logic";

type Media = { kind: "image"; src: string } | { kind: "video"; video: PdpVideo; poster?: string };

interface Props {
  images: string[];
  video: PdpVideo | null;
  name: string;
  look: BoutiqueLook;
  zoom: boolean;
  /** Lightbox and zoom only on the live page (the builder preview stays still). */
  interactive: boolean;
  /** Changes when the shopper picks a variant with its own photo: the gallery goes back to the first photo. */
  resetKey?: string;
  /** Gallery stack layout: also render every photo down the page (shown on wide screens only). */
  stack?: boolean;
}

function VideoFrame({ video, name }: { video: PdpVideo; name: string }) {
  if (video.kind === "file") return <video src={video.src} controls playsInline preload="metadata" aria-label={`${name} video`} />;
  return <iframe src={video.src} title={`${name} video`} loading="lazy" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen />;
}

function setZoomOrigin(event: React.MouseEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty("--zx", `${((event.clientX - rect.left) / rect.width) * 100}%`);
  event.currentTarget.style.setProperty("--zy", `${((event.clientY - rect.top) / rect.height) * 100}%`);
}

/** Photos (and the product video) with swipe on phones, thumbnails or dots, hover zoom and a full-screen lightbox. */
export function PdpGallery({ images, video, name, look, zoom, interactive, resetKey, stack }: Props) {
  const t = look.tokens;
  const media: Media[] = [...images.map((src) => ({ kind: "image" as const, src })), ...(video ? [{ kind: "video" as const, video, poster: images[0] }] : [])];
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const canZoom = zoom && interactive;

  useEffect(() => {
    setIndex(0);
    trackRef.current?.scrollTo({ left: 0 });
  }, [resetKey]);

  function goTo(next: number) {
    const count = Math.max(media.length, 1);
    const target = (next + count) % count;
    setIndex(target);
    const el = trackRef.current;
    if (el) el.scrollTo({ left: target * el.clientWidth, behavior: "smooth" });
  }

  function onScroll() {
    const el = trackRef.current;
    if (!el || !el.clientWidth) return;
    const next = Math.round(el.scrollLeft / el.clientWidth);
    if (next !== index) setIndex(next);
  }

  function slide(item: Media, i: number, eager: boolean) {
    if (item.kind === "video") {
      return (
        <div key="video" className="bq-pdp2-slide" role="group" aria-roledescription="slide" aria-label={`Video, ${i + 1} of ${media.length}`}>
          <VideoFrame video={item.video} name={name} />
        </div>
      );
    }
    const img = <img src={item.src} alt={i === 0 ? name : `${name}, photo ${i + 1}`} width={900} height={1100} loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : undefined} decoding="async" />;
    if (!canZoom) {
      return <div key={item.src} className="bq-pdp2-slide" role="group" aria-roledescription="slide" aria-label={`Photo ${i + 1} of ${media.length}`}>{img}</div>;
    }
    return (
      <button key={item.src} type="button" className="bq-pdp2-slide bq-pdp2-zoom" onMouseMove={setZoomOrigin} onClick={() => setLightbox(i)} aria-label={`Open photo ${i + 1} of ${media.length} full screen`}>
        {img}
      </button>
    );
  }

  if (!media.length) {
    return (
      <div className="bq-pdp2-gal">
        <div className="bq-pdp2-slide grid place-items-center" style={{ borderRadius: look.cardRadius }} aria-label="No photo yet" role="img">
          <Icon name="image" size={40} color={look.dark ? "#3A3A3A" : "#C9CCCF"} />
        </div>
      </div>
    );
  }

  const imageCount = images.length;

  return (
    <>
      <div className="bq-pdp2-gal">
        <div className="bq-pdp2-viewer">
          <div ref={trackRef} className="bq-pdp2-track" onScroll={onScroll} aria-roledescription="carousel" aria-label={`${name} photos`} tabIndex={0}>
            {media.map((item, i) => slide(item, i, i === 0))}
          </div>
          {media.length > 1 ? (
            <>
              <button type="button" onClick={() => goTo(index - 1)} className="bq-icon-btn bq-only-wide absolute left-3 top-1/2 -translate-y-1/2" style={{ background: "rgba(255,255,255,.92)", color: "#111", width: 38, height: 38 }} aria-label="Previous photo">
                <Icon name="arrowLeft" size={15} />
              </button>
              <button type="button" onClick={() => goTo(index + 1)} className="bq-icon-btn bq-only-wide absolute right-3 top-1/2 -translate-y-1/2" style={{ background: "rgba(255,255,255,.92)", color: "#111", width: 38, height: 38 }} aria-label="Next photo">
                <Icon name="chevRight" size={15} />
              </button>
              <span className="bq-pdp2-dots pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5" aria-hidden>
                {media.map((item, i) => (
                  <span key={i} className="block h-1.5 rounded-full transition-all" style={{ width: i === index ? 18 : 6, background: i === index ? "#fff" : "rgba(255,255,255,.6)", boxShadow: "0 0 0 1px rgba(0,0,0,.08)" }} />
                ))}
              </span>
              <span className="pointer-events-none absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11.5px] font-semibold" style={{ background: "rgba(0,0,0,.55)", color: "#fff" }} aria-hidden>
                {index + 1}/{media.length}
              </span>
            </>
          ) : null}
        </div>
        {media.length > 1 ? (
          <div className="bq-pdp2-thumbs" role="group" aria-label="Choose a photo">
            {media.map((item, i) => (
              <button key={item.kind === "image" ? item.src : "video"} type="button" onClick={() => goTo(i)} aria-label={item.kind === "video" ? "Play the video" : `Show photo ${i + 1}`} aria-current={i === index ? "true" : undefined} className="bq-pdp2-thumb" style={{ borderColor: i === index ? t.ink : "transparent" }}>
                {item.kind === "image" ? <img src={item.src} alt="" width={80} height={80} loading="lazy" /> : item.poster ? <img src={item.poster} alt="" width={80} height={80} loading="lazy" style={{ opacity: 0.6 }} /> : null}
                {item.kind === "video" ? <span className="absolute inset-0 grid place-items-center" style={{ color: look.dark ? "#fff" : "#111" }}><Icon name="play" size={20} /></span> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Gallery stack (wide screens): every photo down the page. */}
      {stack ? (
        <div className="bq-pdp2-stack">
          {media.map((item, i) => slide(item, i, false))}
        </div>
      ) : null}

      {lightbox !== null && imageCount ? <Lightbox images={images} start={Math.min(lightbox, imageCount - 1)} name={name} onClose={() => setLightbox(null)} /> : null}
    </>
  );
}

function Lightbox({ images, start, name, onClose }: { images: string[]; start: number; name: string; onClose: () => void }) {
  const [index, setIndex] = useState(start);
  const trackRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const el = trackRef.current;
    if (el) el.scrollTo({ left: start * el.clientWidth });
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [start]);

  function goTo(next: number) {
    const target = (next + images.length) % images.length;
    setIndex(target);
    const el = trackRef.current;
    if (el) el.scrollTo({ left: target * el.clientWidth, behavior: "smooth" });
  }

  return createPortal(
    <div
      className="bq-pdp2-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`${name} photos`}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
        if (event.key === "ArrowRight") goTo(index + 1);
        if (event.key === "ArrowLeft") goTo(index - 1);
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 text-[13px] font-semibold" style={{ color: "#fff" }}>
        <span aria-live="polite">{index + 1} / {images.length}</span>
        <button ref={closeRef} type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full border-0" style={{ background: "rgba(255,255,255,.12)", color: "#fff", cursor: "pointer" }} aria-label="Close photos">
          <Icon name="x" size={18} />
        </button>
      </div>
      <div
        ref={trackRef}
        className="bq-pdp2-track"
        onScroll={() => {
          const el = trackRef.current;
          if (el && el.clientWidth) setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
      >
        {images.map((src, i) => (
          <div key={src} className="bq-pdp2-slide">
            <img src={src} alt={`${name}, photo ${i + 1}`} loading={Math.abs(i - start) <= 1 ? "eager" : "lazy"} />
          </div>
        ))}
      </div>
      {images.length > 1 ? (
        <div className="flex justify-center gap-3 py-4">
          <button type="button" onClick={() => goTo(index - 1)} className="grid h-11 w-11 place-items-center rounded-full border-0" style={{ background: "rgba(255,255,255,.12)", color: "#fff", cursor: "pointer" }} aria-label="Previous photo">
            <Icon name="arrowLeft" size={16} />
          </button>
          <button type="button" onClick={() => goTo(index + 1)} className="grid h-11 w-11 place-items-center rounded-full border-0" style={{ background: "rgba(255,255,255,.12)", color: "#fff", cursor: "pointer" }} aria-label="Next photo">
            <Icon name="chevRight" size={16} />
          </button>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
