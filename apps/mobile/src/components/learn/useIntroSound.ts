import "expo-sqlite/localStorage/install";
import { useCallback, useEffect, useRef, useState } from "react";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { api } from "@/lib/api";
import { DEFAULT_SOUND_PREFS, MUSIC_LEVEL, MUSIC_UNDER_VOICE, parseSoundPrefs, type IntroSoundPrefs } from "@shared/intro-narration";

// Sound for the 60-second intro on the phone, like the web's (src/components/learn/useIntroSound.ts): a narrator
// reads each scene in the app language (the stored clip from /api/learn/narration) over soft music that dips while
// the voice speaks. The music is the same generated "chill" track as the web, as a short seamless loop
// (assets/sounds/intro-music.m4a). `voiceBusy` is true while a scene's line loads or plays, so the intro waits for
// the narrator. When the narration service is off, the captions carry on without a voice. Choices are kept on the phone.

const PREFS_KEY = "shopinbos.introSound";
const CLIP_WAIT_MS = 6_000;
const MUSIC = require("../../../assets/sounds/intro-music.m4a") as number;

function readPrefs(): IntroSoundPrefs {
  try {
    return parseSoundPrefs(localStorage.getItem(PREFS_KEY));
  } catch {
    return { ...DEFAULT_SOUND_PREFS };
  }
}

type Clip = { url: string } | null;

export function useIntroSound({ introKey, sceneCount, locale }: { introKey: string; sceneCount: number; locale: string }) {
  const [prefs, setPrefs] = useState<IntroSoundPrefs>(readPrefs);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const music = useRef<AudioPlayer | null>(null);
  const voice = useRef<AudioPlayer | null>(null);
  const voiceSub = useRef<{ remove: () => void } | null>(null);
  const fade = useRef<ReturnType<typeof setInterval> | null>(null);
  const clips = useRef(new Map<number, Promise<Clip>>());
  const token = useRef(0);
  const sceneRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const speaking = useRef(false);
  const off = useRef(false);

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
  }, []);

  /** Moves the music volume to `level` over ~0.5 s. */
  const musicTo = useCallback((level: number) => {
    const player = music.current;
    if (!player) return;
    if (fade.current) clearInterval(fade.current);
    const from = player.volume;
    let step = 0;
    fade.current = setInterval(() => {
      step += 1;
      player.volume = from + ((level - from) * step) / 8;
      if (step >= 8 && fade.current) {
        clearInterval(fade.current);
        fade.current = null;
      }
    }, 60);
  }, []);

  const musicLevel = useCallback(() => (prefsRef.current.music ? (speaking.current ? MUSIC_UNDER_VOICE : MUSIC_LEVEL) : 0), []);

  const startMusic = useCallback(() => {
    if (!prefsRef.current.music || off.current) return;
    if (!music.current) {
      try {
        music.current = createAudioPlayer(MUSIC);
        music.current.loop = true;
        music.current.volume = 0;
      } catch {
        return;
      }
    }
    if (!pausedRef.current && !music.current.playing) music.current.play();
    musicTo(musicLevel());
  }, [musicLevel, musicTo]);

  const clipFor = useCallback(
    (index: number): Promise<Clip> => {
      const cached = clips.current.get(index);
      if (cached) return cached;
      const job = api<{ url?: string }>(`/api/learn/narration?${new URLSearchParams({ intro: introKey, scene: String(index + 1), lang: locale }).toString()}`)
        .then((data): Clip => (data?.url ? { url: data.url } : null))
        .catch((): Clip => null);
      clips.current.set(index, job);
      return job;
    },
    [introKey, locale],
  );

  const stopVoice = useCallback(() => {
    token.current++;
    voiceSub.current?.remove();
    voiceSub.current = null;
    voice.current?.pause();
    speaking.current = false;
    setVoiceBusy(false);
    musicTo(musicLevel());
  }, [musicLevel, musicTo]);

  /** Reads scene `index` (stopping whatever was playing). */
  const playScene = useCallback(
    async (index: number) => {
      stopVoice();
      sceneRef.current = index;
      startMusic();
      if (!prefsRef.current.voice) return;
      void clipFor(Math.min(index + 1, sceneCount - 1));
      const mine = ++token.current;
      setVoiceBusy(true);
      const done = () => {
        if (mine !== token.current) return;
        voiceSub.current?.remove();
        voiceSub.current = null;
        speaking.current = false;
        setVoiceBusy(false);
        musicTo(musicLevel());
      };
      const clip = await Promise.race([clipFor(index), new Promise<Clip>((resolve) => setTimeout(() => resolve(null), CLIP_WAIT_MS))]);
      if (mine !== token.current || off.current) return;
      if (!clip) return done();
      try {
        if (!voice.current) voice.current = createAudioPlayer({ uri: clip.url });
        else voice.current.replace({ uri: clip.url });
        // Watch for the end of the line (and give up on a clip that never loads).
        const player = voice.current;
        // Only a clip seen playing can end (just after replace() the player can still report the last clip's end).
        let began = Date.now();
        let heard = false;
        const watch = setInterval(() => {
          if (pausedRef.current) {
            began = Date.now();
            return;
          }
          if (player.playing) heard = true;
          const ended = heard && !player.playing && player.duration > 0 && player.currentTime >= player.duration - 0.3;
          if (ended || (!heard && Date.now() - began > 10_000)) done();
        }, 200);
        voiceSub.current = { remove: () => clearInterval(watch) };
        speaking.current = true;
        musicTo(musicLevel());
        if (!pausedRef.current) voice.current.play();
      } catch {
        done();
      }
    },
    [clipFor, musicLevel, musicTo, sceneCount, startMusic, stopVoice],
  );

  const pause = useCallback(() => {
    pausedRef.current = true;
    voice.current?.pause();
    music.current?.pause();
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
    if (speaking.current) voice.current?.play();
    if (prefsRef.current.music && music.current) music.current.play();
  }, []);

  /** The recap: the narrator stops and the music fades out. */
  const finish = useCallback(() => {
    stopVoice();
    sceneRef.current = null;
    musicTo(0);
    setTimeout(() => {
      if (sceneRef.current === null) music.current?.pause();
    }, 700);
  }, [musicTo, stopVoice]);

  const update = useCallback(
    (patch: Partial<IntroSoundPrefs>) => {
      const next = { ...prefsRef.current, ...patch };
      prefsRef.current = next;
      setPrefs(next);
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        // No storage: the choice lasts until the app closes.
      }
      if (patch.voice === false) stopVoice();
      if (patch.music === false) musicTo(0);
      if (patch.music === true && sceneRef.current !== null) startMusic();
      if (patch.voice === true && sceneRef.current !== null) void playScene(sceneRef.current);
    },
    [musicTo, playScene, startMusic, stopVoice],
  );

  useEffect(
    () => () => {
      off.current = true;
      token.current++;
      if (fade.current) clearInterval(fade.current);
      voiceSub.current?.remove();
      voice.current?.remove();
      music.current?.remove();
    },
    [],
  );

  return { prefs, voiceBusy, setVoice: (on: boolean) => update({ voice: on }), setMusic: (on: boolean) => update({ music: on }), playScene, stopVoice, pause, resume, finish };
}
