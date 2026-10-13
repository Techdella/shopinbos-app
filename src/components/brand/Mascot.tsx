"use client";

// <Mascot who="rex|peggy" mood="…" size={…} />: the one way to show Rex or Peggy on the web (build spec 5.4).
// Never place a mascot image directly. Emails are the exception: they keep static PNGs.
//
// What renders:
// - the still PNG for the mood, always first (while an animation loads, under reduced motion, when no file exists);
// - a gentle CSS motion on that still (breathing for idle, a bounce for celebrate, a shake for oops), so moods read
//   before the real files exist; celebrate / wave / oops play once and settle back to idle;
// - the real animation on top, only when public/brand/mascots/anim/mascots.json lists a file for it and a renderer is
//   installed (see MASCOT_RENDERERS below). It is a lazy chunk, so pages without one never download it.

import { lazy, Suspense, useState, useSyncExternalStore, type CSSProperties } from "react";
import { cx } from "@/components/app-ui/cx";
import {
  mascotAnimation,
  mascotLabel,
  mascotStill,
  playsOnce,
  shouldAnimate,
  shouldMoveStill,
  type MascotManifest,
  type MascotMood,
  type MascotRenderers,
  type MascotSize,
  type MascotWho,
} from "@shared/mascots";
import manifestJson from "../../../public/brand/mascots/anim/mascots.json";
import "./mascot.css";

export type { MascotMood, MascotSize, MascotWho } from "@shared/mascots";

const MANIFEST = manifestJson as MascotManifest;

/**
 * Which animation renderers this build has. lottie-react is installed. Rive needs @rive-app/react-canvas plus a
 * self-hosted rive.wasm (the default unpkg download is blocked by our CSP); add both, wire RiveMascot in
 * MascotAnimation.tsx, then flip `rive` to true.
 */
export const MASCOT_RENDERERS: MascotRenderers = { lottie: true, rive: false };

const MascotAnimation = lazy(() => import("./MascotAnimation"));

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(onChange: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const query = window.matchMedia(REDUCE_QUERY);
  query.addEventListener?.("change", onChange);
  return () => query.removeEventListener?.("change", onChange);
}
export function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(REDUCE_QUERY).matches : false),
    () => true, // server render: the still, no motion, until the browser says otherwise
  );
}

export function mascotStillSrc(who: MascotWho, mood: MascotMood = "idle") {
  return `/brand/app/${mascotStill(who, mood)}.png`;
}

const DISPLAY_CLASS = /(^|\s)(hidden|block|inline-block|inline|flex|inline-flex|grid|contents)(\s|$)/;
const POSITION_CLASS = /(^|\s)(absolute|fixed|sticky|static)(\s|$)/;

export interface MascotProps {
  who: MascotWho;
  mood?: MascotMood;
  /** Square size in px (20, 30, 40, 56, 110, 150). Leave out to size with className instead. */
  size?: MascotSize | number;
  /** Decorative mascots (next to text that already names them) get an empty alt and are hidden from screen readers. */
  decorative?: boolean;
  /** Overrides the default "Rex" / "Peggy". */
  alt?: string;
  className?: string;
  style?: CSSProperties;
  /** Extra classes / style for the still <img> (the error scenes crop it). */
  imgClassName?: string;
  imgStyle?: CSSProperties;
  /** Turn off the fallback motion (e.g. inside a scene that animates the mascot itself). */
  still?: boolean;
}

export function Mascot({ who, mood = "idle", size, decorative = false, alt, className = "", style, imgClassName, imgStyle, still = false }: MascotProps) {
  const reducedMotion = usePrefersReducedMotion();
  // The mood actually playing: a one-shot mood (celebrate, wave, oops) settles back to idle once it has played.
  // A new mood prop starts over (state adjusted during render, React's pattern for resetting on a prop change).
  const [shown, setShown] = useState<{ mood: MascotMood; done: boolean; file: string | null; ready: boolean }>({ mood, done: false, file: null, ready: false });
  let current = shown;
  if (shown.mood !== mood) {
    current = { mood, done: false, file: shown.file, ready: shown.ready };
    setShown(current);
  }
  const playing: MascotMood = current.done && playsOnce(mood) ? "idle" : mood;
  const finish = () => setShown((prev) => (prev.mood === mood ? { ...prev, done: true } : prev));

  const source = mascotAnimation(who, playing, MANIFEST, MASCOT_RENDERERS);
  const file = source?.file ?? null;
  if (current.file !== file) {
    current = { ...current, file, ready: false };
    setShown(current);
  }
  const ready = current.ready;
  const setReady = (value: boolean) => setShown((prev) => (prev.file === file ? { ...prev, ready: value } : prev));
  const animate = shouldAnimate(source, { reducedMotion }) && !still;

  const label = decorative ? "" : alt ?? mascotLabel(who);
  const motion = !still && shouldMoveStill({ reducedMotion }) && !(animate && ready) ? `sbm-${playing}` : "";
  const boxStyle: CSSProperties = size ? { width: size, height: size, ...style } : { ...style };

  return (
    <span
      className={cx("sbm-mascot shrink-0", !POSITION_CLASS.test(className) && "relative", !DISPLAY_CLASS.test(className) && "block", className)}
      style={boxStyle}
      data-mascot={who}
      data-mood={playing}
      aria-hidden={label ? undefined : true}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={playing}
        src={mascotStillSrc(who, playing)}
        alt={label}
        draggable={false}
        decoding="async"
        onAnimationEnd={playsOnce(playing) ? finish : undefined}
        className={cx("pointer-events-none h-full w-full select-none object-contain", motion, animate && ready && "invisible", imgClassName)}
        style={imgStyle}
      />
      {animate && source ? (
        <Suspense fallback={null}>
          <MascotAnimation
            key={source.file}
            source={source}
            mood={playing}
            loop={!playsOnce(playing)}
            onReady={() => setReady(true)}
            onComplete={playsOnce(playing) ? finish : undefined}
            onError={() => setReady(false)}
          />
        </Suspense>
      ) : null}
    </span>
  );
}

export default Mascot;
