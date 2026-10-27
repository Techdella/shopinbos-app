import "expo-sqlite/localStorage/install";
import { useCallback, useEffect, useRef, useState } from "react";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { API_URL, api } from "@/lib/api";
import { introAudio, useIntroAudioStop } from "@/lib/intro-audio";
import { DEFAULT_SOUND_PREFS, LAST_TRACK_KEY, MUSIC_LEVEL, MUSIC_UNDER_VOICE, introTrackPath, parseSoundPrefs, pickIntroTrack, type IntroSoundPrefs } from "@shared/intro-narration";

// Sound for the 60-second intro on the phone, like the web's (src/components/learn/useIntroSound.ts): a narrator
// reads each scene in the app language (the stored clip from /api/learn/narration) over soft music that dips while
// the voice speaks. The music is the web's Afrobeats tips collection, streamed from the app's site
// (INTRO_TRACKS, /audio/tips/*.mp3), a different track from the last intro, looping until the recap. `voiceBusy` is true while a scene's line loads or plays, so the intro waits for
// the narrator. When the narration service is off, the captions carry on without a voice. Choices are kept on the phone.
//
// Stopping is strict, because the music used to carry on after the sheet closed and even after the app went to the
// background: on Android `player.remove()` only drops the player from expo-audio's list (so its own "pause when the
// app goes to the background" no longer reaches it) and never stops it. Every player is now paused and then
// released (`release()`) when the sheet closes or unmounts, and the app-wide guard (lib/intro-audio.ts) stops and
// releases them when the app leaves the foreground or a Peggy call starts. No background playback, ever.

const PREFS_KEY = "shopinbos.introSound";
const CLIP_WAIT_MS = 6_000;

/** This intro's track URL: not the one the last intro played on this phone. */
function nextTrackUrl(): string {
  let previous: string | null = null;
  try {
    previous = localStorage.getItem(LAST_TRACK_KEY);
  } catch {
    // No storage: any track will do.
  }
  const id = pickIntroTrack(previous, Math.random());
  try {
    localStorage.setItem(LAST_TRACK_KEY, id);
  } catch {
    // No storage.
  }
  return `${API_URL}${introTrackPath(id)}`;
}

function readPrefs(): IntroSoundPrefs {
  try {
    return parseSoundPrefs(localStorage.getItem(PREFS_KEY));
  } catch {
    return { ...DEFAULT_SOUND_PREFS };
  }
}

/** Pauses a player and frees it (release() stops it natively; remove() alone doesn't on Android). */
export function releasePlayer(player: AudioPlayer | null) {
  if (!player) return;
  try {
    player.pause();
  } catch {
    // Already released.
  }
  try {
    // Every expo-audio player is a SharedObject with release(); its typings leave the method off the instance.
    (player as unknown as { release?: () => void }).release?.();
  } catch {
    // Already released.
  }
}

type Clip = { url: string } | null;

export function useIntroSound({ introKey, sceneCount, locale, onInterrupt }: { introKey: string; sceneCount: number; locale: string; onInterrupt?: () => void }) {
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
  /** The players were freed by a stop (background, a call): resume starts the scene's line again. */
  const released = useRef(false);
  const interrupt = useRef(onInterrupt);
  useEffect(() => {
    interrupt.current = onInterrupt;
  });

  useEffect(() => {
    off.current = false;
    // Never in the background: the guard below also stops everything when the app leaves the foreground.
    void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false }).catch(() => undefined);
  }, []);

  const clearFade = useCallback(() => {
    if (fade.current) clearInterval(fade.current);
    fade.current = null;
  }, []);

  /** Moves the music volume to `level` over ~0.5 s. */
  const musicTo = useCallback(
    (level: number) => {
      const player = music.current;
      if (!player) return;
      clearFade();
      let from = 0;
      try {
        from = player.volume;
      } catch {
        return;
      }
      let step = 0;
      fade.current = setInterval(() => {
        step += 1;
        try {
          player.volume = from + ((level - from) * step) / 8;
        } catch {
          step = 8;
        }
        if (step >= 8) clearFade();
      }, 60);
    },
    [clearFade],
  );

  /** Stops the narrator and the music and frees both players (the sheet closing, the app leaving, a call). */
  const stopAll = useCallback(() => {
    token.current++;
    clearFade();
    voiceSub.current?.remove();
    voiceSub.current = null;
    releasePlayer(voice.current);
    releasePlayer(music.current);
    voice.current = null;
    music.current = null;
    speaking.current = false;
    released.current = true;
    if (!off.current) setVoiceBusy(false);
  }, [clearFade]);

  // The app-wide guard: the app going to the background or a Peggy call starting stops and frees everything, and
  // the sheet shows as paused.
  useIntroAudioStop(() => {
    pausedRef.current = true;
    stopAll();
    interrupt.current?.();
  });

  const musicLevel = useCallback(() => (prefsRef.current.music ? (speaking.current ? MUSIC_UNDER_VOICE : MUSIC_LEVEL) : 0), []);

  const startMusic = useCallback(() => {
    if (!prefsRef.current.music || off.current || pausedRef.current || !introAudio.allowed()) return;
    if (!music.current) {
      try {
        music.current = createAudioPlayer({ uri: nextTrackUrl() });
        music.current.loop = true;
        music.current.volume = 0;
      } catch {
        return;
      }
    }
    released.current = false;
    if (!music.current.playing) music.current.play();
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
    try {
      voice.current?.pause();
    } catch {
      voice.current = null;
    }
    speaking.current = false;
    if (!off.current) setVoiceBusy(false);
    musicTo(musicLevel());
  }, [musicLevel, musicTo]);

  /** Reads scene `index` (stopping whatever was playing). */
  const playScene = useCallback(
    async (index: number) => {
      stopVoice();
      sceneRef.current = index;
      startMusic();
      if (!prefsRef.current.voice || off.current) return;
      void clipFor(Math.min(index + 1, sceneCount - 1));
      const mine = ++token.current;
      setVoiceBusy(true);
      const done = () => {
        if (mine !== token.current) return;
        voiceSub.current?.remove();
        voiceSub.current = null;
        speaking.current = false;
        if (!off.current) setVoiceBusy(false);
        musicTo(musicLevel());
      };
      const clip = await Promise.race([clipFor(index), new Promise<Clip>((resolve) => setTimeout(() => resolve(null), CLIP_WAIT_MS))]);
      if (mine !== token.current || off.current) return;
      if (!clip) return done();
      try {
        if (!voice.current) voice.current = createAudioPlayer({ uri: clip.url });
        else voice.current.replace({ uri: clip.url });
        released.current = false;
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
          try {
            if (player.playing) heard = true;
            const ended = heard && !player.playing && player.duration > 0 && player.currentTime >= player.duration - 0.3;
            if (ended || (!heard && Date.now() - began > 10_000)) done();
          } catch {
            done();
          }
        }, 200);
        voiceSub.current = { remove: () => clearInterval(watch) };
        speaking.current = true;
        musicTo(musicLevel());
        if (!pausedRef.current && introAudio.allowed()) voice.current.play();
      } catch {
        done();
      }
    },
    [clipFor, musicLevel, musicTo, sceneCount, startMusic, stopVoice],
  );

  /** Pause really pauses: both players stop where they are. */
  const pause = useCallback(() => {
    pausedRef.current = true;
    clearFade();
    try {
      voice.current?.pause();
    } catch {
      voice.current = null;
    }
    try {
      music.current?.pause();
    } catch {
      music.current = null;
    }
  }, [clearFade]);

  const resume = useCallback(() => {
    pausedRef.current = false;
    if (off.current || !introAudio.allowed()) return;
    // Freed by the app leaving or a call: start the scene's line (and the music) again.
    if (released.current) {
      if (sceneRef.current !== null) void playScene(sceneRef.current);
      return;
    }
    try {
      if (speaking.current) voice.current?.play();
    } catch {
      voice.current = null;
    }
    if (prefsRef.current.music) startMusic();
  }, [playScene, startMusic]);

  /** The recap: the narrator stops and the music fades out. */
  const finish = useCallback(() => {
    stopVoice();
    sceneRef.current = null;
    musicTo(0);
    setTimeout(() => {
      if (sceneRef.current !== null) return;
      try {
        music.current?.pause();
      } catch {
        music.current = null;
      }
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

  // Closing or unmounting the sheet: stop and free both players.
  useEffect(
    () => () => {
      off.current = true;
      stopAll();
    },
    [stopAll],
  );

  return { prefs, voiceBusy, setVoice: (on: boolean) => update({ voice: on }), setMusic: (on: boolean) => update({ music: on }), playScene, stopVoice, pause, resume, finish, stopAll };
}
