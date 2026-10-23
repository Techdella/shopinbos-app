"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_SOUND_PREFS,
  MUSIC_LEVEL,
  MUSIC_UNDER_VOICE,
  browserVoiceLang,
  narrationText,
  parseSoundPrefs,
  pickBrowserVoice,
  type IntroSoundPrefs,
} from "@shared/intro-narration";

// Sound for the 60-second intro: the narrator reads each scene (a stored clip from /api/learn/narration, or the
// browser's own voice when that service is off) over soft music made in the browser (src/lib/video/music.ts), which
// dips while the narrator speaks. `voiceBusy` is true while a scene's line is loading or being read, so the intro
// waits for the narrator before moving on. Browsers only start sound after a tap: when the intro opened by itself,
// `needsTap` asks for one. The on/off choices are kept on this device.

const PREFS_KEY = "shopinbos.introSound";
const CLIP_WAIT_MS = 6_000;

interface Scene {
  caption: string;
  sub: string;
}

function readPrefs(): IntroSoundPrefs {
  try {
    return parseSoundPrefs(window.localStorage.getItem(PREFS_KEY));
  } catch {
    return { ...DEFAULT_SOUND_PREFS };
  }
}

function savePrefs(prefs: IntroSoundPrefs) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode: the choice lasts until the page closes.
  }
}

type Clip = { url: string } | { browser: true } | { none: true };

export function useIntroSound({ introKey, scenes, locale, totalMs }: { introKey: string; scenes: Scene[]; locale: string; totalMs: number }) {
  const [prefs, setPrefs] = useState<IntroSoundPrefs>(DEFAULT_SOUND_PREFS);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const voiceBusyRef = useRef(false);
  voiceBusyRef.current = voiceBusy;
  // The intro hands in freshly translated scenes on every render: read them through a ref so nothing restarts.
  const scenesRef = useRef(scenes);
  scenesRef.current = scenes;

  const ctxRef = useRef<AudioContext | null>(null);
  const musicGain = useRef<GainNode | null>(null);
  const musicSource = useRef<AudioBufferSourceNode | null>(null);
  const musicLoading = useRef<Promise<void> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const clips = useRef(new Map<number, Promise<Clip>>());
  const token = useRef(0);
  const sceneRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const browserOnly = useRef(false);
  const disposed = useRef(false);

  useEffect(() => {
    setPrefs(readPrefs());
  }, []);

  // ── Music ──────────────────────────────────────────────────────────────────
  const setMusicLevel = useCallback((level: number, seconds = 0.6) => {
    const ctx = ctxRef.current;
    const gain = musicGain.current;
    if (!ctx || !gain) return;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(level, ctx.currentTime + seconds);
  }, []);

  const musicTarget = useCallback((speaking: boolean) => (prefsRef.current.music ? (speaking ? MUSIC_UNDER_VOICE : MUSIC_LEVEL) : 0), []);

  /** The AudioContext, created on first use; `needsTap` when the browser holds it until someone taps. */
  const context = useCallback(async () => {
    if (typeof window === "undefined" || disposed.current) return null;
    if (!ctxRef.current) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctxRef.current = new Ctor();
      musicGain.current = ctxRef.current.createGain();
      musicGain.current.gain.value = 0;
      musicGain.current.connect(ctxRef.current.destination);
    }
    const ctx = ctxRef.current;
    // Without a tap the browser may hold resume() open indefinitely: don't wait on it for long.
    if (ctx.state === "suspended" && !pausedRef.current) await Promise.race([ctx.resume().catch(() => undefined), new Promise((resolve) => window.setTimeout(resolve, 300))]);
    setNeedsTap(ctx.state !== "running" && !pausedRef.current);
    return ctx;
  }, []);

  const startMusic = useCallback(async () => {
    if (!prefsRef.current.music || musicSource.current || musicLoading.current) return;
    const ctx = await context();
    if (!ctx) return;
    musicLoading.current = (async () => {
      try {
        const { renderMusic } = await import("@/lib/video/music");
        // Long enough for the intro, its waits for the narrator and the recap; it fades out by itself at the end.
        const buffer = await renderMusic("chill", Math.min(180, Math.round(totalMs / 1000) + 40), 5);
        if (disposed.current || musicSource.current || !musicGain.current) return;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(musicGain.current);
        source.start();
        musicSource.current = source;
        setMusicLevel(musicTarget(Boolean(audioRef.current && !audioRef.current.paused) || (typeof speechSynthesis !== "undefined" && speechSynthesis.speaking)), 1.2);
      } catch {
        // No Web Audio (old browser): the intro plays without music.
      } finally {
        musicLoading.current = null;
      }
    })();
    await musicLoading.current;
  }, [context, musicTarget, setMusicLevel, totalMs]);

  const stopMusic = useCallback((fadeSeconds = 1.5) => {
    const source = musicSource.current;
    const ctx = ctxRef.current;
    if (!source || !ctx) return;
    setMusicLevel(0, fadeSeconds);
    musicSource.current = null;
    try {
      source.stop(ctx.currentTime + fadeSeconds + 0.1);
    } catch {
      // Already stopped.
    }
  }, [setMusicLevel]);

  // ── Narrator ───────────────────────────────────────────────────────────────
  const clipFor = useCallback(
    (index: number): Promise<Clip> => {
      const cached = clips.current.get(index);
      if (cached) return cached;
      const job: Promise<Clip> = browserOnly.current
        ? Promise.resolve({ browser: true })
        : fetch(`/api/learn/narration?${new URLSearchParams({ intro: introKey, scene: String(index + 1), lang: locale })}`, { credentials: "same-origin" })
            .then(async (response): Promise<Clip> => {
              if (response.status === 503) {
                browserOnly.current = true;
                return { browser: true };
              }
              const body = (await response.json().catch(() => null)) as { data?: { url?: string } } | null;
              return body?.data?.url ? { url: body.data.url } : { browser: true };
            })
            .catch((): Clip => ({ browser: true }));
      clips.current.set(index, job);
      return job;
    },
    [introKey, locale],
  );

  const stopVoice = useCallback(() => {
    token.current++;
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
    }
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    setVoiceBusy(false);
    setMusicLevel(musicTarget(false));
  }, [musicTarget, setMusicLevel]);

  const speakWithBrowser = useCallback(
    (text: string, mine: number) =>
      new Promise<void>((resolve) => {
        if (typeof speechSynthesis === "undefined" || typeof SpeechSynthesisUtterance === "undefined") return resolve();
        const lang = browserVoiceLang(locale);
        const voice = pickBrowserVoice(speechSynthesis.getVoices(), lang);
        if (!voice) return resolve();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = voice;
        utterance.lang = voice.lang;
        utterance.rate = 0.98;
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        if (mine !== token.current) return resolve();
        speechSynthesis.cancel();
        speechSynthesis.speak(utterance);
        if (pausedRef.current) speechSynthesis.pause();
      }),
    [locale],
  );

  /** Reads scene `index` (stopping whatever was playing). */
  const playScene = useCallback(
    async (index: number) => {
      stopVoice();
      sceneRef.current = index;
      const all = scenesRef.current;
      const scene = all[index];
      if (!scene) return;
      void startMusic();
      if (!prefsRef.current.voice) return;
      // Fetch this and the next scene's clips ahead.
      void clipFor(index + 1 < all.length ? index + 1 : index);
      const mine = ++token.current;
      setVoiceBusy(true);
      const finish = () => {
        if (mine !== token.current) return;
        setVoiceBusy(false);
        setMusicLevel(musicTarget(false));
      };
      const clip = await Promise.race([clipFor(index), new Promise<Clip>((resolve) => window.setTimeout(() => resolve({ none: true }), CLIP_WAIT_MS))]);
      if (mine !== token.current) return;
      setMusicLevel(musicTarget(true), 0.4);
      if ("url" in clip) {
        const audio = (audioRef.current ??= new Audio());
        audio.src = clip.url;
        audio.onended = finish;
        audio.onerror = finish;
        if (pausedRef.current) return;
        try {
          await audio.play();
        } catch {
          // The browser wants a tap first: the line is skipped, the captions are on screen.
          setNeedsTap(true);
          finish();
        }
      } else if ("browser" in clip) {
        await speakWithBrowser(narrationText(scene), mine);
        finish();
      } else {
        finish();
      }
    },
    [clipFor, musicTarget, setMusicLevel, speakWithBrowser, startMusic, stopVoice],
  );

  const pause = useCallback(() => {
    pausedRef.current = true;
    audioRef.current?.pause();
    if (typeof speechSynthesis !== "undefined") speechSynthesis.pause();
    void ctxRef.current?.suspend().catch(() => undefined);
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
    void ctxRef.current?.resume().catch(() => undefined);
    const audio = audioRef.current;
    if (audio && audio.src && !audio.ended && audio.paused && audio.onended) void audio.play().catch(() => undefined);
    if (typeof speechSynthesis !== "undefined") speechSynthesis.resume();
  }, []);

  /** The recap: the narrator stops, the music fades out. */
  const finish = useCallback(() => {
    stopVoice();
    sceneRef.current = null;
    stopMusic(2.5);
  }, [stopMusic, stopVoice]);

  /** Called from a tap: lets the browser play sound, then reads the current scene again. */
  const unlock = useCallback(async () => {
    pausedRef.current = false;
    await context();
    if (ctxRef.current?.state === "running") setNeedsTap(false);
    if (sceneRef.current !== null) void playScene(sceneRef.current);
  }, [context, playScene]);

  const update = useCallback(
    (patch: Partial<IntroSoundPrefs>) => {
      const next = { ...prefsRef.current, ...patch };
      prefsRef.current = next;
      setPrefs(next);
      savePrefs(next);
      if (patch.voice === false) stopVoice();
      if (patch.music === false) setMusicLevel(0, 0.3);
      if (patch.music === true) {
        if (musicSource.current) setMusicLevel(musicTarget(voiceBusyRef.current), 0.4);
        else if (sceneRef.current !== null) void startMusic();
      }
      if (patch.voice === true && sceneRef.current !== null) void unlock();
    },
    [musicTarget, setMusicLevel, startMusic, stopVoice, unlock],
  );
  // Browsers load their voice list late; ask once so it's ready by the first line.
  useEffect(() => {
    if (typeof speechSynthesis !== "undefined") speechSynthesis.getVoices();
  }, []);

  useEffect(
    () => () => {
      disposed.current = true;
      token.current++;
      audioRef.current?.pause();
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
      try {
        musicSource.current?.stop();
      } catch {
        // Already stopped.
      }
      void ctxRef.current?.close().catch(() => undefined);
    },
    [],
  );

  return { prefs, setVoice: (voice: boolean) => update({ voice }), setMusic: (music: boolean) => update({ music }), voiceBusy, needsTap, playScene, stopVoice, pause, resume, finish, unlock };
}
