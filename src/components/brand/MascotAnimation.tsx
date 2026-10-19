"use client";

// The real Rex / Peggy animation, loaded lazily by <Mascot> only when the manifest lists a file and motion is allowed.
// The still stays underneath until onReady, and comes back on onError.
//
// Lottie (rex-<mood>.json, peggy-<mood>.json): lottie-react, installed, loaded only when a Lottie file plays.
// Image (rex-<mood>.webp, peggy-<mood>.webp): an animated WebP sticker in a plain <img>; it loops on its own.
// Rive (rex.riv, peggy.riv; state machine "mood" with a `mood` input): not installed yet. To turn it on:
//   1. npm i @rive-app/react-canvas
//   2. self-host the runtime: copy node_modules/@rive-app/canvas/rive.wasm to public/brand/mascots/anim/rive.wasm and
//      call RuntimeLoader.setWasmUrl("/brand/mascots/anim/rive.wasm") before the first render (the default unpkg
//      download is blocked by the CSP in next.config.ts);
//   3. render <RiveComponent> from useRive({ src, stateMachines: source.stateMachine, autoplay: true }) below, set the
//      `mood` input with useStateMachineInput, call onComplete on the state machine's return-to-idle event;
//   4. set MASCOT_RENDERERS.rive = true in Mascot.tsx.

import { lazy, Suspense, useEffect } from "react";
import type { MascotAnimationSource, MascotMood } from "@shared/mascots";

const BASE = "/brand/mascots/anim/";

// Its own chunk, so a page that only shows a WebP sticker never downloads the Lottie player.
const Lottie = lazy(() => import("lottie-react").then((module) => ({ default: module.Lottie })));

export interface MascotAnimationProps {
  source: MascotAnimationSource;
  mood: MascotMood;
  loop: boolean;
  onReady: () => void;
  onComplete?: () => void;
  onError: () => void;
}

export default function MascotAnimation({ source, loop, onReady, onComplete, onError }: MascotAnimationProps) {
  const unsupported = source.kind !== "lottie" && source.kind !== "image";
  useEffect(() => {
    if (unsupported) onError();
  }, [unsupported, onError]);
  if (unsupported) return null;
  if (source.kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={BASE + source.file}
        alt=""
        aria-hidden
        draggable={false}
        decoding="async"
        loading="lazy"
        onLoad={onReady}
        onError={onError}
        className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
        // The sticker files carry a few stray white pixels in their corners (the figure stays well inside 12%).
        style={{ clipPath: "inset(5%)" }}
      />
    );
  }
  return (
    <Suspense fallback={null}>
      <Lottie
        src={BASE + source.file}
        loop={loop}
        autoplay
        subscriptions={{ ready: onReady, complete: onComplete, error: onError }}
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
    </Suspense>
  );
}
