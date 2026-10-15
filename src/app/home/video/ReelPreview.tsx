"use client";

import { useEffect, useRef, useState } from "react";
import { buildScene, drawReelFrame, loadReelImage, type ReelScene } from "@/lib/video/render-reel";
import type { ReelBrand, ReelTemplateId } from "@shared/video-style";

const imageCache = new Map<string, Promise<HTMLImageElement>>();
function cachedImage(src: string) {
  let hit = imageCache.get(src);
  if (!hit) {
    hit = loadReelImage(src);
    hit.catch(() => imageCache.delete(src));
    imageCache.set(src, hit);
  }
  return hit;
}

export interface PreviewInput {
  template: ReelTemplateId;
  photos: string[];
  captions: string[];
  brand: ReelBrand;
  storeName: string;
  price: string;
  cta: string;
  storeHost: string;
  voiceSeconds: number | null;
}

/**
 * The reel playing live (no sound) in the chosen template, drawn by the same code that records it, so what the
 * seller sees here is what they get.
 */
export function ReelPreview({ input, className, label }: { input: PreviewInput; className?: string; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [scene, setScene] = useState<ReelScene | null>(null);
  const photosKey = input.photos.join("|");

  useEffect(() => {
    let cancelled = false;
    const font = getComputedStyle(document.documentElement).getPropertyValue("--font-jakarta").trim() || "system-ui, sans-serif";
    Promise.all([
      Promise.allSettled(input.photos.map(cachedImage)),
      input.brand.logoUrl ? cachedImage(input.brand.logoUrl).catch(() => null) : Promise.resolve(null),
    ]).then(([photos, logo]) => {
      if (cancelled) return;
      const loaded = photos.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
      if (!loaded.length) return setScene(null);
      setScene(
        buildScene(
          { template: input.template, photos: loaded, captions: input.captions, brand: input.brand, logo, storeName: input.storeName, price: input.price, cta: input.cta, storeHost: input.storeHost, fontFamily: font },
          input.voiceSeconds,
        ),
      );
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photosKey, input.template, input.captions.join("|"), input.brand, input.storeName, input.price, input.cta, input.storeHost, input.voiceSeconds]);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx || !scene) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const started = performance.now();
    let frame = 0;
    const tick = () => {
      const t = reduce ? scene.timeline.intro + scene.timeline.perShot * 0.7 : ((performance.now() - started) / 1000) % scene.timeline.total;
      drawReelFrame(ctx, scene, t);
      if (!reduce) frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [scene]);

  return <canvas ref={canvas} width={720} height={1280} role="img" aria-label={label} className={className} />;
}
