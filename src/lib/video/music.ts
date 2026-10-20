"use client";

import { MUSIC_MOODS, type MusicMood } from "@shared/video-style";

// Background music for reels, synthesised in the browser (OfflineAudioContext): drums, shaker, bass, chords and
// a melody line per mood. Original every time, so sellers can post it anywhere without copyright claims.
// Same mood + seed gives the same track.

type Ctx = OfflineAudioContext;

const NOTE = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Chord progressions as MIDI roots with minor/major quality, one chord per bar. */
const PROGRESSIONS: Record<MusicMood, Array<{ root: number; minor: boolean }>> = {
  afrobeats: [{ root: 57, minor: true }, { root: 53, minor: false }, { root: 48, minor: false }, { root: 55, minor: false }],
  amapiano: [{ root: 50, minor: true }, { root: 55, minor: false }, { root: 52, minor: true }, { root: 57, minor: true }],
  upbeat: [{ root: 48, minor: false }, { root: 55, minor: false }, { root: 57, minor: true }, { root: 53, minor: false }],
  chill: [{ root: 50, minor: true }, { root: 55, minor: false }, { root: 48, minor: false }, { root: 57, minor: true }],
  luxury: [{ root: 45, minor: true }, { root: 53, minor: false }, { root: 48, minor: false }, { root: 52, minor: false }],
  highlife: [{ root: 48, minor: false }, { root: 53, minor: false }, { root: 55, minor: false }, { root: 48, minor: false }],
  afrohouse: [{ root: 57, minor: true }, { root: 57, minor: true }, { root: 53, minor: false }, { root: 55, minor: false }],
  hiphop: [{ root: 50, minor: true }, { root: 46, minor: false }, { root: 53, minor: false }, { root: 45, minor: true }],
  rnb: [{ root: 53, minor: false }, { root: 52, minor: true }, { root: 50, minor: true }, { root: 55, minor: false }],
  lofi: [{ root: 50, minor: true }, { root: 55, minor: false }, { root: 48, minor: false }, { root: 52, minor: true }],
  party: [{ root: 55, minor: false }, { root: 48, minor: false }, { root: 50, minor: false }, { root: 55, minor: false }],
  cinematic: [{ root: 45, minor: true }, { root: 53, minor: false }, { root: 48, minor: false }, { root: 55, minor: false }],
};

const SWUNG: ReadonlySet<MusicMood> = new Set(["afrobeats", "amapiano", "highlife", "hiphop", "rnb", "lofi", "party"]);
const SOFT_DRUMS: Partial<Record<MusicMood, number>> = { luxury: 0.5, chill: 0.6, lofi: 0.55, cinematic: 0.6, rnb: 0.7 };
const SOFT_MELODY: ReadonlySet<MusicMood> = new Set(["luxury", "chill", "lofi", "rnb", "cinematic"]);

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10_000) / 10_000;
  };
}

function noiseBuffer(ctx: Ctx) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const rand = seeded(7);
  for (let i = 0; i < data.length; i++) data[i] = rand() * 2 - 1;
  return buffer;
}

function kick(ctx: Ctx, out: AudioNode, time: number, level = 0.9) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.setValueAtTime(140, time);
  osc.frequency.exponentialRampToValueAtTime(45, time + 0.12);
  gain.gain.setValueAtTime(level, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
  osc.connect(gain).connect(out);
  osc.start(time);
  osc.stop(time + 0.4);
}

function hit(ctx: Ctx, out: AudioNode, noise: AudioBuffer, time: number, { freq, q = 1, decay, level, type = "bandpass" }: { freq: number; q?: number; decay: number; level: number; type?: BiquadFilterType }) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(level, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + decay);
  src.connect(filter).connect(gain).connect(out);
  src.start(time, (time * 7.31) % 0.5);
  src.stop(time + decay + 0.02);
}

function tone(ctx: Ctx, out: AudioNode, time: number, { midi, length, type, level, attack = 0.005, glide }: { midi: number; length: number; type: OscillatorType; level: number; attack?: number; glide?: number }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(NOTE(midi + (glide ?? 0)), time);
  if (glide) osc.frequency.exponentialRampToValueAtTime(NOTE(midi), time + 0.06);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(level, time + attack);
  gain.gain.exponentialRampToValueAtTime(0.0008, time + length);
  osc.connect(gain).connect(out);
  osc.start(time);
  osc.stop(time + length + 0.05);
}

function pad(ctx: Ctx, out: AudioNode, time: number, length: number, chord: { root: number; minor: boolean }, level: number) {
  const notes = [chord.root + 12, chord.root + 12 + (chord.minor ? 3 : 4), chord.root + 19, chord.root + 22 - (chord.minor ? 0 : 1)];
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1400;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(level, time + 0.25);
  gain.gain.setValueAtTime(level, time + length - 0.3);
  gain.gain.linearRampToValueAtTime(0.0001, time + length);
  filter.connect(gain).connect(out);
  for (const midi of notes) {
    for (const detune of [-6, 6]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.detune.value = detune;
      osc.frequency.value = NOTE(midi);
      osc.connect(filter);
      osc.start(time);
      osc.stop(time + length + 0.05);
    }
  }
}

/** Renders `seconds` of music for a mood (with a fade out at the end). */
export async function renderMusic(mood: MusicMood, seconds: number, seed = 1): Promise<AudioBuffer> {
  const sampleRate = 44_100;
  const length = Math.ceil((seconds + 0.5) * sampleRate);
  const ctx = new OfflineAudioContext(2, length, sampleRate);
  const rand = seeded(seed * 9973 + mood.length);
  const bpm = MUSIC_MOODS.find((item) => item.id === mood)?.bpm ?? 100;
  const beat = 60 / bpm;
  const sixteenth = beat / 4;
  const bar = beat * 4;
  const noise = noiseBuffer(ctx);

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, 0);
  master.gain.linearRampToValueAtTime(0.85, 0.4);
  master.gain.setValueAtTime(0.85, Math.max(0.5, seconds - 1.6));
  master.gain.linearRampToValueAtTime(0.0001, seconds);
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -14;
  compressor.ratio.value = 4;
  master.connect(compressor).connect(ctx.destination);

  const drums = ctx.createGain();
  drums.gain.value = SOFT_DRUMS[mood] ?? 0.85;
  drums.connect(master);
  const music = ctx.createGain();
  music.gain.value = 0.55;
  music.connect(master);

  const progression = PROGRESSIONS[mood];
  // A short melody motif (scale steps) repeated with small variations.
  const scale = [0, 3, 5, 7, 10, 12, 15];
  const motif = Array.from({ length: 8 }, () => (rand() < 0.3 ? null : scale[Math.floor(rand() * scale.length)]));

  const bars = Math.ceil(seconds / bar);
  for (let b = 0; b < bars; b++) {
    const start = b * bar;
    const chord = progression[b % progression.length];
    pad(ctx, music, start, bar, chord, mood === "upbeat" || mood === "party" || mood === "afrohouse" ? 0.05 : mood === "cinematic" ? 0.09 : 0.07);

    for (let step = 0; step < 16; step++) {
      // A light swing on the off-beats, as in afrobeats, amapiano and the laid-back moods.
      const swing = step % 2 === 1 && SWUNG.has(mood) ? sixteenth * (mood === "lofi" || mood === "hiphop" ? 0.26 : 0.18) : 0;
      const t = start + step * sixteenth + swing;
      if (t >= seconds) break;

      if (mood === "afrobeats") {
        if ([0, 6, 10].includes(step)) kick(ctx, drums, t, 0.8);
        if ([4, 12].includes(step)) hit(ctx, drums, noise, t, { freq: 1800, q: 0.8, decay: 0.16, level: 0.5 });
        if (step % 2 === 0 || rand() < 0.4) hit(ctx, drums, noise, t, { freq: 7000, type: "highpass", decay: 0.05, level: step % 4 === 2 ? 0.22 : 0.12 });
        if ([3, 11, 14].includes(step)) tone(ctx, drums, t, { midi: 72 + (step === 14 ? 5 : 0), length: 0.12, type: "triangle", level: 0.16 });
        if ([0, 3, 8, 10, 14].includes(step)) tone(ctx, music, t, { midi: chord.root - 12 + (step === 10 ? 7 : 0), length: sixteenth * 2.5, type: "sine", level: 0.5 });
      } else if (mood === "amapiano") {
        if (step % 4 === 0) kick(ctx, drums, t, 0.75);
        if (step % 2 === 1) hit(ctx, drums, noise, t, { freq: 8000, type: "highpass", decay: 0.04, level: 0.14 });
        if ([4, 12].includes(step)) hit(ctx, drums, noise, t, { freq: 2200, q: 1.2, decay: 0.12, level: 0.35 });
        // The log drum: a pitched, gliding bass hit.
        if ([3, 6, 7, 11, 14].includes(step)) tone(ctx, music, t, { midi: chord.root - 12 + (step === 7 ? 3 : 0), length: 0.32, type: "sine", level: 0.6, glide: 7 });
      } else if (mood === "upbeat") {
        if (step % 4 === 0) kick(ctx, drums, t, 0.85);
        if ([4, 12].includes(step)) hit(ctx, drums, noise, t, { freq: 1500, q: 0.7, decay: 0.2, level: 0.55 });
        if (step % 2 === 0) hit(ctx, drums, noise, t, { freq: 9000, type: "highpass", decay: 0.04, level: 0.14 });
        if (step % 2 === 0) tone(ctx, music, t, { midi: chord.root - 12 + (step % 8 === 6 ? 12 : 0), length: sixteenth * 1.8, type: "triangle", level: 0.35 });
      } else if (mood === "chill") {
        if ([0, 7, 10].includes(step)) kick(ctx, drums, t, 0.6);
        if ([4, 12].includes(step)) hit(ctx, drums, noise, t, { freq: 2600, q: 0.6, decay: 0.22, level: 0.25 });
        if (step % 2 === 0) hit(ctx, drums, noise, t, { freq: 9000, type: "highpass", decay: 0.03, level: 0.08 });
        if (step === 0 || step === 8) tone(ctx, music, t, { midi: chord.root - 12, length: beat * 1.8, type: "sine", level: 0.45 });
      } else if (mood === "highlife") {
        // Bright guitar-style picking over a light kick and the bell pattern.
        if ([0, 8].includes(step)) kick(ctx, drums, t, 0.65);
        if ([0, 3, 6, 10, 12].includes(step)) tone(ctx, drums, t, { midi: 84, length: 0.09, type: "triangle", level: 0.12 });
        if (step % 2 === 1) hit(ctx, drums, noise, t, { freq: 6500, type: "highpass", decay: 0.04, level: 0.1 });
        if (step % 2 === 0) tone(ctx, music, t, { midi: chord.root + 12 + [0, 7, 4, 12][(step / 2) % 4] - (chord.minor && step % 8 === 4 ? 1 : 0), length: 0.22, type: "triangle", level: 0.14, attack: 0.003 });
        if ([0, 6, 8, 14].includes(step)) tone(ctx, music, t, { midi: chord.root - 12 + (step === 6 ? 7 : 0), length: sixteenth * 2, type: "sine", level: 0.45 });
      } else if (mood === "afrohouse") {
        if (step % 4 === 0) kick(ctx, drums, t, 0.9);
        if (step % 4 === 2) hit(ctx, drums, noise, t, { freq: 8500, type: "highpass", decay: 0.08, level: 0.2 });
        if ([4, 12].includes(step)) hit(ctx, drums, noise, t, { freq: 2000, q: 0.8, decay: 0.14, level: 0.32 });
        // Hand-drum toms on the off-beats.
        if ([3, 7, 10, 15].includes(step)) tone(ctx, drums, t, { midi: step === 10 ? 50 : 45, length: 0.16, type: "sine", level: 0.35, glide: 5 });
        if ([2, 6, 10, 14].includes(step)) tone(ctx, music, t, { midi: chord.root - 12, length: sixteenth * 1.6, type: "sine", level: 0.5 });
      } else if (mood === "hiphop") {
        // Half-time boom bap: heavy kick, a fat snare on the backbeat, busy hats.
        if ([0, 7, 10].includes(step)) kick(ctx, drums, t, 0.95);
        if ([4, 12].includes(step)) hit(ctx, drums, noise, t, { freq: 1400, q: 0.6, decay: 0.24, level: 0.6 });
        hit(ctx, drums, noise, t, { freq: 9000, type: "highpass", decay: step % 2 === 0 ? 0.04 : 0.02, level: step % 2 === 0 ? 0.13 : 0.07 });
        if (step === 0 || step === 10) tone(ctx, music, t, { midi: chord.root - 12, length: beat * 1.4, type: "sine", level: 0.6, glide: -3 });
      } else if (mood === "rnb") {
        if ([0, 9].includes(step)) kick(ctx, drums, t, 0.7);
        if ([4, 12].includes(step)) hit(ctx, drums, noise, t, { freq: 3200, q: 1.4, decay: 0.08, level: 0.35 });
        if (step % 2 === 0) hit(ctx, drums, noise, t, { freq: 9500, type: "highpass", decay: 0.03, level: 0.08 });
        if ([0, 6, 9].includes(step)) tone(ctx, music, t, { midi: chord.root - 12 + (step === 9 ? 7 : 0), length: beat * 0.9, type: "sine", level: 0.45 });
      } else if (mood === "lofi") {
        if ([0, 10].includes(step)) kick(ctx, drums, t, 0.55);
        if ([4, 12].includes(step)) hit(ctx, drums, noise, t, { freq: 1800, q: 0.5, decay: 0.18, level: 0.25 });
        if (step % 2 === 0) hit(ctx, drums, noise, t, { freq: 5000, type: "highpass", decay: 0.025, level: 0.07 });
        // Vinyl crackle.
        if (rand() < 0.25) hit(ctx, drums, noise, t, { freq: 3000, q: 4, decay: 0.01, level: 0.05 });
        if (step === 0 || step === 8) tone(ctx, music, t, { midi: chord.root - 12, length: beat * 1.6, type: "sine", level: 0.4 });
      } else if (mood === "party") {
        // Owambe: fast talking-drum style hits over a driving kick and shaker.
        if (step % 4 === 0 || step === 14) kick(ctx, drums, t, 0.85);
        if ([4, 12].includes(step)) hit(ctx, drums, noise, t, { freq: 1700, q: 0.8, decay: 0.14, level: 0.45 });
        hit(ctx, drums, noise, t, { freq: 7500, type: "highpass", decay: 0.035, level: step % 2 === 0 ? 0.16 : 0.1 });
        if ([2, 5, 7, 11, 13].includes(step)) tone(ctx, drums, t, { midi: 62 + (step % 3) * 3, length: 0.14, type: "sine", level: 0.3, glide: -4 });
        if (step % 2 === 0) tone(ctx, music, t, { midi: chord.root - 12 + (step % 8 === 4 ? 7 : 0), length: sixteenth * 1.6, type: "triangle", level: 0.38 });
      } else if (mood === "cinematic") {
        // Slow, wide and building: a deep boom each bar and a rising pulse.
        if (step === 0) kick(ctx, drums, t, 0.8);
        if (step === 0) hit(ctx, drums, noise, t, { freq: 400, type: "lowpass", decay: 1.2, level: 0.25 });
        if (b % 2 === 1 && step % 4 === 0) tone(ctx, music, t, { midi: chord.root, length: beat * 0.8, type: "sawtooth", level: 0.06 });
        if (step === 0) tone(ctx, music, t, { midi: chord.root - 12, length: bar * 0.95, type: "sine", level: 0.45 });
      } else {
        if (step === 0) kick(ctx, drums, t, 0.45);
        if (step === 8) hit(ctx, drums, noise, t, { freq: 3000, q: 0.5, decay: 0.4, level: 0.15 });
        if (step === 0) tone(ctx, music, t, { midi: chord.root - 12, length: bar * 0.95, type: "sine", level: 0.4 });
      }

      // Melody: a bell or marimba line every other bar, on eighth notes.
      if (b % 2 === 1 && step % 2 === 0) {
        const degree = motif[(step / 2 + b) % motif.length];
        if (degree !== null && rand() > 0.15) {
          const soft = SOFT_MELODY.has(mood);
          tone(ctx, music, t, { midi: chord.root + 24 + degree, length: mood === "luxury" || mood === "cinematic" ? 0.9 : soft ? 0.5 : 0.35, type: soft ? "sine" : "triangle", level: mood === "luxury" || mood === "cinematic" ? 0.12 : 0.15, attack: 0.004 });
        }
      }
    }
  }
  return ctx.startRendering();
}
