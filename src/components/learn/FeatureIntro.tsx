"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { glossaryTerm } from "@shared/glossary";
import { introDurationMs, type FeatureIntro as Intro } from "@shared/feature-intros";
import { helpLanguage, type VideoSource } from "@shared/help-videos";
import { translateIntro, translateTerm } from "@shared/i18n/learn";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { VOICE_GRACE_MS, isNarrationLocale } from "@shared/intro-narration";
import { C, INTRO_CSS, SceneArtwork } from "./scenes";
import { TipsOffNote } from "./Term";
import { useIntroSound } from "./useIntroSound";

// The 60-second feature intro: a navy panel that plays five short motion-graphics scenes (scenes.tsx), each with
// one caption and a spoken-style line, then a recap of the word it taught and the page's main action. Segmented
// progress, play/pause, back/next, replay, skip; Escape closes. With reduced motion the scenes are still frames
// and you step through them. When a one-minute help video is published for the same topic, "Watch the video"
// plays it in the same panel. Full-screen sheet on phones. A narrator reads each scene in the person's language over
// a track from the Afrobeats tips collection (useIntroSound.ts); each scene waits for the narrator to finish its line, and both can be switched off.

export type IntroCloseReason = "done" | "skip" | "close" | "cta";

interface HelpVideo {
  title: string;
  posterUrl: string | null;
  source: VideoSource;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** The published help video for the intro's topic, if any (GET /api/help-videos, public). */
function useHelpVideo(topic: string | undefined, role: string | null) {
  const [video, setVideo] = useState<HelpVideo | null>(null);
  useEffect(() => {
    if (!topic) return;
    let stopped = false;
    const params = new URLSearchParams({ topic, lang: helpLanguage(document.documentElement.lang || navigator.language) });
    if (role === "seller" || role === "supplier" || role === "logistics_partner") params.set("role", role);
    fetch(`/api/help-videos?${params}`, { credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { data?: { current?: HelpVideo | null } } | null) => {
        if (!stopped) setVideo(body?.data?.current ?? null);
      })
      .catch(() => undefined);
    return () => {
      stopped = true;
    };
  }, [topic, role]);
  return video;
}

export function FeatureIntro({ intro: source, role, onClose }: { intro: Intro; role: string | null; onClose: (reason: IntroCloseReason) => void }) {
  // Captions, title and button in the person's language; the scene art keeps its sample labels.
  const t = useT("learn");
  const tIntros = useT("intros");
  const tGlossary = useT("glossary");
  const intro = translateIntro(source, tIntros);
  const reduced = usePrefersReducedMotion();
  const video = useHelpVideo(intro.helpTopic, role);
  const [index, setIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [finished, setFinished] = useState(false);
  const [tab, setTab] = useState<"intro" | "video">("intro");
  const [run, setRun] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const scenes = intro.scenes;
  const scene = scenes[index]!;
  const glossaryEntry = glossaryTerm(intro.term);
  const term = glossaryEntry ? translateTerm(glossaryEntry, tGlossary) : null;
  const still = reduced;
  const playing = !paused && !finished && !still && tab === "intro";
  const locale = useLocale();
  const sound = useIntroSound({ introKey: intro.key, scenes, locale: isNarrationLocale(locale) ? locale : "en" });
  const { playScene, finish: finishSound, stopVoice, pause: pauseSound, resume: resumeSound } = sound;

  // The narrator follows the scenes: each new scene (or a replay) reads its line; the recap and the video stop it.
  useEffect(() => {
    if (tab !== "intro") {
      stopVoice();
      pauseSound();
      return;
    }
    if (finished) finishSound();
    else void playScene(index);
  }, [tab, finished, index, run, playScene, finishSound, stopVoice, pauseSound]);

  useEffect(() => {
    if (tab !== "intro") return;
    if (paused) pauseSound();
    else resumeSound();
  }, [paused, tab, pauseSound, resumeSound]);

  // The clock: advances the current scene, then the next, then the recap.
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const step = now - last;
      last = now;
      setElapsed((current) => current + step);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, index]);

  // A scene moves on once its time is up and the narrator has finished (or after a grace period, whatever happens).
  const waitingForVoice = sound.voiceBusy && elapsed < scene.durationMs + VOICE_GRACE_MS;
  useEffect(() => {
    if (elapsed < scene.durationMs || waitingForVoice) return;
    if (index < scenes.length - 1) {
      setIndex(index + 1);
      setElapsed(0);
    } else {
      setFinished(true);
      setElapsed(scene.durationMs);
    }
  }, [elapsed, index, scene.durationMs, scenes.length, waitingForVoice]);

  const go = useCallback(
    (next: number) => {
      if (next >= scenes.length) {
        setFinished(true);
        return;
      }
      setFinished(false);
      setIndex(Math.max(0, next));
      setElapsed(0);
    },
    [scenes.length],
  );

  const replay = () => {
    setFinished(false);
    setPaused(false);
    setIndex(0);
    setElapsed(0);
    setRun((count) => count + 1);
    setTab("intro");
  };

  // Escape closes; arrows step; Space pauses (unless a button has focus, where Space presses it).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose(finished ? "done" : "close");
      } else if (event.key === "ArrowRight") go(finished ? scenes.length : index + 1);
      else if (event.key === "ArrowLeft") go(finished ? scenes.length - 1 : index - 1);
      else if (event.key === " " && !(event.target instanceof HTMLButtonElement) && !(event.target instanceof HTMLAnchorElement)) {
        event.preventDefault();
        setPaused((value) => !value);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [finished, go, index, onClose, scenes.length]);

  // Focus goes into the dialog and comes back to where it was when it closes.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    primaryRef.current?.focus();
    return () => before?.focus?.();
  }, []);

  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab" || !panelRef.current) return;
    const focusable = [...panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], iframe, video, [tabindex]:not([tabindex='-1'])")];
    if (!focusable.length) return;
    const first = focusable[0]!;
    const lastItem = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      lastItem.focus();
    } else if (!event.shiftKey && document.activeElement === lastItem) {
      event.preventDefault();
      first.focus();
    }
  };

  const total = introDurationMs(intro);
  const seconds = Math.round(total / 1000);
  const progressFor = (i: number) => (finished || i < index ? 1 : i > index ? 0 : still ? 1 : Math.min(1, elapsed / scenes[i]!.durationMs));

  const body = (
    <div className="fixed inset-0 z-[90] flex items-stretch justify-center font-app sm:items-center sm:p-6" data-feature-intro={intro.key}>
      <style>{INTRO_CSS}</style>
      <div aria-hidden className="absolute inset-0 bg-[rgba(6,18,26,0.62)] backdrop-blur-[3px]" onClick={() => onClose("close")} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feature-intro-title"
        onKeyDown={trapFocus}
        // Any tap in the intro counts as the tap browsers need before they play sound.
        onPointerDown={() => {
          if (sound.needsTap) void sound.unlock();
        }}
        className="relative flex h-[100dvh] w-full max-w-full flex-col overflow-hidden text-[#F4F1EA] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.6)] sm:h-auto sm:max-h-[94dvh] sm:max-w-[800px] sm:rounded-[28px]"
        style={{ backgroundColor: C.navy }}
      >
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: "radial-gradient(rgb(115 216 200 / 0.13) 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full opacity-40 blur-3xl" style={{ background: C.teal }} />

        {/* Header: segmented progress, eyebrow, close, title */}
        <div className="relative px-4 pt-4 sm:px-7 sm:pt-6">
          <div className="flex gap-1.5" role="group" aria-label={t("scenes")}>
            {scenes.map((item, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setTab("intro");
                  go(i);
                }}
                aria-label={t("sceneOf", { n: i + 1, total: scenes.length, caption: item.caption })}
                aria-current={!finished && i === index ? "step" : undefined}
                className="group relative h-6 flex-1 cursor-pointer"
              >
                <span className="absolute inset-x-0 top-1/2 block h-[4px] -translate-y-1/2 overflow-hidden rounded-full bg-[rgba(244,241,234,0.16)] group-hover:bg-[rgba(244,241,234,0.26)]">
                  <span className="block h-full rounded-full" style={{ width: `${progressFor(i) * 100}%`, backgroundColor: C.mint }} />
                </span>
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em]" style={{ color: C.mint }}>
              {t("eyebrow", { seconds })}
            </span>
            <span className="flex-1" />
            {sound.needsTap && (sound.prefs.voice || sound.prefs.music) && tab === "intro" && !finished && (
              <button type="button" onClick={() => void sound.unlock()} data-intro-sound="tap" className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-[13px] font-bold motion-safe:animate-pulse" style={{ backgroundColor: C.mint, color: C.navy }}>
                <Icon name="volume" size={15} /> {t("tapForSound")}
              </button>
            )}
            <button
              type="button"
              onClick={() => sound.setVoice(!sound.prefs.voice)}
              aria-pressed={sound.prefs.voice}
              aria-label={sound.prefs.voice ? t("voiceOff") : t("voiceOn")}
              title={sound.prefs.voice ? t("voiceOff") : t("voiceOn")}
              data-intro-sound="voice"
              className="grid h-9 w-9 place-items-center rounded-full bg-[rgba(244,241,234,0.1)] hover:bg-[rgba(244,241,234,0.18)]"
            >
              <Icon name={sound.prefs.voice ? "volume" : "mute"} size={16} />
            </button>
            <button
              type="button"
              onClick={() => sound.setMusic(!sound.prefs.music)}
              aria-pressed={sound.prefs.music}
              aria-label={sound.prefs.music ? t("musicOff") : t("musicOn")}
              title={sound.prefs.music ? t("musicOff") : t("musicOn")}
              data-intro-sound="music"
              className={`grid h-9 w-9 place-items-center rounded-full bg-[rgba(244,241,234,0.1)] hover:bg-[rgba(244,241,234,0.18)] ${sound.prefs.music ? "" : "opacity-50 line-through"}`}
              style={sound.prefs.music ? { color: C.mint } : undefined}
            >
              <Icon name="music" size={16} />
            </button>
            {!finished && (
              <button type="button" onClick={() => onClose("skip")} className="min-h-[36px] rounded-full px-3 text-[13px] font-bold text-[rgba(244,241,234,0.72)] hover:text-[#F4F1EA]">
                {t("skip")}
              </button>
            )}
            <button type="button" onClick={() => onClose(finished ? "done" : "close")} aria-label={t("close")} className="grid h-9 w-9 place-items-center rounded-full bg-[rgba(244,241,234,0.1)] hover:bg-[rgba(244,241,234,0.18)]">
              <Icon name="x" size={16} />
            </button>
          </div>
          <h2 id="feature-intro-title" className="m-0 mt-1 text-[26px] font-extrabold leading-[1.08] tracking-[-0.6px] sm:text-[32px]">
            {intro.title}
            <span className="font-normal italic tracking-[-0.3px]" style={{ fontFamily: "var(--font-accent), Fraunces, Georgia, serif", color: C.mint }}>
              {" "}{t("in60")}
            </span>
          </h2>
          {video && (
            <div role="tablist" aria-label={t("howToWatch")} className="mt-3 inline-flex rounded-full bg-[rgba(244,241,234,0.08)] p-1">
              {(["intro", "video"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={tab === value}
                  onClick={() => {
                    setTab(value);
                    if (value === "video") setPaused(true);
                  }}
                  className="min-h-[34px] rounded-full px-4 text-[13px] font-bold transition"
                  style={tab === value ? { backgroundColor: C.mint, color: C.navy } : { color: "rgba(244,241,234,0.78)" }}
                >
                  {value === "intro" ? t("animated") : t("watchVideo")}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Stage */}
        <div className="relative flex min-h-0 flex-1 flex-col justify-center overflow-y-auto px-4 pb-2 pt-4 sm:block sm:flex-none sm:px-7">
          {tab === "video" && video ? (
            <div className="overflow-hidden rounded-[22px] bg-black">
              <div className="aspect-video w-full">
                {video.source.kind === "file" ? (
                  <video src={video.source.url} poster={video.posterUrl ?? undefined} controls autoPlay playsInline className="h-full w-full" />
                ) : (
                  <iframe
                    src={`${video.source.embedUrl}&autoplay=1`}
                    title={video.title}
                    allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                    className="h-full w-full border-0"
                  />
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="relative overflow-hidden rounded-[22px] border border-[rgba(115,216,200,0.12)]" style={{ backgroundColor: C.deep }}>
                <div className="fi-stage aspect-[360/220] w-full" data-paused={String(paused || finished)} data-still={String(still)}>
                  <SceneArtwork scene={scene} paused={paused || finished} still={still} restartKey={`${run}-${index}`} />
                </div>
                {finished && term && (
                  <div className="absolute inset-0 flex flex-col justify-center gap-2 px-5 sm:px-10" style={{ backgroundColor: "rgba(10,34,48,0.94)" }}>
                    <span className="font-mono text-[11px] uppercase tracking-[0.16em]" style={{ color: C.mint }}>{t("wordToKnow")}</span>
                    <span className="text-[34px] italic leading-none sm:text-[44px]" style={{ fontFamily: "var(--font-accent), Fraunces, Georgia, serif" }}>{term.term}</span>
                    <span className="max-w-[560px] text-[15px] leading-[1.45] sm:text-[17px]">{term.short}</span>
                    <span className="max-w-[560px] text-[13.5px] leading-[1.45] text-[rgba(244,241,234,0.7)] sm:text-[14.5px]">{t("forExample", { example: term.example })}</span>
                  </div>
                )}
              </div>
              <div className="min-h-[96px] pt-4 sm:min-h-[104px]" aria-live="polite">
                {finished ? (
                  <>
                    <p className="m-0 text-[19px] font-extrabold leading-[1.25] sm:text-[22px]">{t("thatsIt", { term: term?.term ?? intro.title })}</p>
                    <p className="m-0 mt-1.5 text-[14.5px] leading-[1.5] text-[rgba(244,241,234,0.72)] sm:text-[15.5px]">{t("replayHint")}</p>
                    <TipsOffNote onNavigate={() => onClose("close")} className="mt-1 text-[13.5px]" />
                  </>
                ) : (
                  <div key={`${run}-${index}`} className="animate-slide-up">
                    <p className="m-0 text-[19px] font-extrabold leading-[1.25] sm:text-[22px]">{scene.caption}</p>
                    <p className="m-0 mt-1.5 text-[14.5px] leading-[1.5] text-[rgba(244,241,234,0.72)] sm:text-[15.5px]">{scene.sub}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Controls */}
        <div className="relative flex flex-wrap items-center gap-2 border-t border-[rgba(244,241,234,0.08)] px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-7 sm:py-4">
          {finished ? (
            <>
              <button type="button" onClick={replay} className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[rgba(244,241,234,0.2)] px-4 text-[14px] font-bold hover:bg-[rgba(244,241,234,0.08)]">
                <Icon name="refresh" size={15} /> {t("replay")}
              </button>
              <span className="flex-1" />
              {intro.cta && (
                <Link
                  href={intro.cta.href}
                  onClick={() => onClose("cta")}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[rgba(115,216,200,0.5)] px-4 text-[14px] font-extrabold no-underline hover:bg-[rgba(115,216,200,0.1)]"
                  style={{ color: C.mint }}
                >
                  {intro.cta.label} <Icon name="arrow" size={15} />
                </Link>
              )}
              <button ref={primaryRef} type="button" onClick={() => onClose("done")} className="inline-flex min-h-[44px] items-center rounded-full px-6 text-[14.5px] font-extrabold" style={{ backgroundColor: C.mint, color: C.navy }}>
                {t("gotIt")}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => go(index - 1)} disabled={index === 0 || tab !== "intro"} aria-label={t("previousScene")} className="grid h-11 w-11 place-items-center rounded-full border border-[rgba(244,241,234,0.2)] hover:bg-[rgba(244,241,234,0.08)] disabled:opacity-35">
                <Icon name="chevRight" size={16} className="rotate-180" />
              </button>
              {!still && (
                <button
                  ref={primaryRef}
                  type="button"
                  onClick={() => {
                    setTab("intro");
                    setPaused(!paused);
                  }}
                  aria-label={paused ? t("play") : t("pause")}
                  className="grid h-12 w-12 place-items-center rounded-full"
                  style={{ backgroundColor: C.mint, color: C.navy }}
                >
                  <Icon name={paused ? "play" : "pause"} size={18} strokeWidth={2.2} />
                </button>
              )}
              <button
                ref={still ? primaryRef : undefined}
                type="button"
                onClick={() => {
                  setTab("intro");
                  go(index + 1);
                }}
                aria-label={t("nextScene")}
                className={still ? "inline-flex min-h-[44px] items-center gap-2 rounded-full px-5 text-[14px] font-extrabold" : "grid h-11 w-11 place-items-center rounded-full border border-[rgba(244,241,234,0.2)] hover:bg-[rgba(244,241,234,0.08)]"}
                style={still ? { backgroundColor: C.mint, color: C.navy } : undefined}
              >
                {still && t("next")}
                <Icon name="chevRight" size={16} />
              </button>
              <button type="button" onClick={replay} aria-label={t("replayFromStart")} className="grid h-11 w-11 place-items-center rounded-full text-[rgba(244,241,234,0.75)] hover:bg-[rgba(244,241,234,0.08)] hover:text-[#F4F1EA]">
                <Icon name="refresh" size={16} />
              </button>
              <span className="flex-1" />
              <span className="font-mono text-[12px] tracking-[0.08em] text-[rgba(244,241,234,0.6)]">
                {index + 1} / {scenes.length}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(body, document.body);
}
