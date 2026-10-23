// Sounds for "Call Peggy", made with Web Audio (no files to download): the ringing tone while the call connects,
// a soft two-note chime when Peggy picks up, and a falling one when the call ends. Every note fades in and out, so
// nothing clicks. Make the player inside the tap that starts the call: browsers only allow audio after a gesture.

/** Nigeria's ringing tone (the UK cadence): 400 Hz + 450 Hz, on 0.4 s, off 0.2 s, on 0.4 s, off 2 s. */
const RING_FREQUENCIES = [400, 450];
const RING_BURSTS = [0, 0.6];
const RING_BURST = 0.4;
const RING_CYCLE = 3;
const RING_VOLUME = 0.07;
const CHIME_VOLUME = 0.09;
const FADE = 0.03;

type AudioContextClass = typeof AudioContext;

export type CallSounds = {
  /** Start ringing (no-op if already ringing). */
  ring: () => void;
  /** Fade the ringing out. */
  stopRing: () => void;
  connected: () => void;
  ended: () => void;
  close: () => void;
};

const silent: CallSounds = { ring() {}, stopRing() {}, connected() {}, ended() {}, close() {} };

export function createCallSounds(): CallSounds {
  if (typeof window === "undefined") return silent;
  const Context = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextClass }).webkitAudioContext) as AudioContextClass | undefined;
  if (!Context) return silent;
  let context: AudioContext;
  try {
    context = new Context();
  } catch {
    return silent;
  }
  void context.resume().catch(() => {});

  let ringGain: GainNode | null = null;
  let ringTimer: number | undefined;
  let scheduledUntil = 0;

  /** One soft note: fades in, holds, fades out. */
  const tone = (output: AudioNode, frequency: number, at: number, length: number, volume: number) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + FADE);
    gain.gain.setValueAtTime(volume, at + length - FADE);
    gain.gain.linearRampToValueAtTime(0, at + length);
    oscillator.connect(gain).connect(output);
    oscillator.start(at);
    oscillator.stop(at + length + 0.05);
  };

  // Schedule ring cycles a little ahead of time, so the cadence stays even when the tab is busy.
  const schedule = () => {
    if (!ringGain) return;
    while (scheduledUntil < context.currentTime + RING_CYCLE * 2) {
      for (const offset of RING_BURSTS) {
        for (const frequency of RING_FREQUENCIES) tone(ringGain, frequency, scheduledUntil + offset, RING_BURST, RING_VOLUME / RING_FREQUENCIES.length);
      }
      scheduledUntil += RING_CYCLE;
    }
  };

  const stopRing = () => {
    window.clearInterval(ringTimer);
    ringTimer = undefined;
    const gain = ringGain;
    ringGain = null;
    if (!gain) return;
    const now = context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.25);
    window.setTimeout(() => gain.disconnect(), 400);
  };

  const chime = (notes: number[]) => {
    const now = context.currentTime + 0.02;
    notes.forEach((frequency, index) => tone(context.destination, frequency, now + index * 0.14, 0.22, CHIME_VOLUME));
  };

  return {
    ring() {
      if (ringGain) return;
      void context.resume().catch(() => {});
      ringGain = context.createGain();
      ringGain.gain.value = 1;
      ringGain.connect(context.destination);
      scheduledUntil = context.currentTime + 0.05;
      schedule();
      ringTimer = window.setInterval(schedule, 1000);
    },
    stopRing,
    connected() {
      stopRing();
      chime([659.25, 880]);
    },
    ended() {
      stopRing();
      chime([587.33, 392]);
    },
    close() {
      stopRing();
      window.setTimeout(() => void context.close().catch(() => {}), 800);
    },
  };
}
