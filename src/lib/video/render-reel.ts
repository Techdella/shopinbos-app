"use client";

import { VIDEO_SIZE, reelTimeline } from "@shared/video";

// Renders a 9:16 product reel in the browser: photos with a slow zoom, a caption per photo, an end card
// with the price and call to action, and an optional voiceover. Canvas + MediaRecorder, no server.

export interface ReelInput {
  photos: HTMLImageElement[];
  captions: string[];
  cta: string;
  storeName: string;
  price: string;
  storeHost: string;
  voiceover?: ArrayBuffer | null;
  fontFamily?: string;
  onProgress?: (fraction: number) => void;
}

export interface ReelResult {
  blob: Blob;
  mimeType: string;
  extension: "mp4" | "webm";
  seconds: number;
}

const MIME_TYPES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

const INK = "#16141F";
const ACCENT = "#FF6A2B";

export function reelSupported() {
  return typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && typeof HTMLCanvasElement !== "undefined" && "captureStream" in HTMLCanvasElement.prototype;
}

function pickMimeType() {
  return MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

/** Same-origin copy of a remote photo (via Next's image optimiser) so the canvas can be recorded. */
export function loadReelImage(src: string): Promise<HTMLImageElement> {
  const attempt = (url: string, cors: boolean) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      if (cors) image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Couldn't load a photo"));
      image.src = url;
    });
  if (src.startsWith("blob:") || src.startsWith("data:") || src.startsWith("/")) return attempt(src, false);
  return attempt(`/_next/image?url=${encodeURIComponent(src)}&w=1080&q=85`, false).catch(() => attempt(src, true));
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPhoto(ctx: CanvasRenderingContext2D, image: HTMLImageElement, progress: number, index: number) {
  const { width, height } = VIDEO_SIZE;
  const zoom = 1.04 + 0.1 * progress;
  const cover = Math.max(width / image.naturalWidth, height / image.naturalHeight) * zoom;
  const w = image.naturalWidth * cover;
  const h = image.naturalHeight * cover;
  // Alternate the drift direction so consecutive photos don't feel the same.
  const drift = (index % 2 === 0 ? 1 : -1) * (w - width) * 0.35 * (progress - 0.5);
  ctx.drawImage(image, (width - w) / 2 + drift, (height - h) / 2, w, h);
}

export async function renderReel(input: ReelInput): Promise<ReelResult> {
  const { width, height } = VIDEO_SIZE;
  const font = input.fontFamily || "system-ui, sans-serif";
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't make videos.");

  let audioContext: AudioContext | null = null;
  let audioBuffer: AudioBuffer | null = null;
  let audioDestination: MediaStreamAudioDestinationNode | null = null;
  if (input.voiceover) {
    audioContext = new AudioContext();
    await audioContext.resume().catch(() => undefined);
    audioBuffer = await audioContext.decodeAudioData(input.voiceover.slice(0));
    audioDestination = audioContext.createMediaStreamDestination();
  }

  const timeline = reelTimeline(input.photos.length, audioBuffer?.duration ?? null);
  const stream = canvas.captureStream(30);
  audioDestination?.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 4_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  const fade = 0.35;
  function frame(t: number) {
    ctx!.fillStyle = INK;
    ctx!.fillRect(0, 0, width, height);
    const photoSpan = timeline.perPhoto * input.photos.length;

    if (t < photoSpan) {
      const index = Math.min(input.photos.length - 1, Math.floor(t / timeline.perPhoto));
      const local = (t - index * timeline.perPhoto) / timeline.perPhoto;
      drawPhoto(ctx!, input.photos[index], local, index);
      const sinceStart = t - index * timeline.perPhoto;
      if (index > 0 && sinceStart < fade) {
        ctx!.globalAlpha = 1 - sinceStart / fade;
        drawPhoto(ctx!, input.photos[index - 1], 1, index - 1);
        ctx!.globalAlpha = 1;
      }

      // Soft shade at the bottom so captions read on any photo.
      const shade = ctx!.createLinearGradient(0, height * 0.55, 0, height);
      shade.addColorStop(0, "rgba(0,0,0,0)");
      shade.addColorStop(1, "rgba(0,0,0,0.6)");
      ctx!.fillStyle = shade;
      ctx!.fillRect(0, height * 0.55, width, height * 0.45);

      // Store name pill
      ctx!.font = `800 26px ${font}`;
      const pill = ctx!.measureText(input.storeName).width + 40;
      ctx!.fillStyle = "rgba(255,255,255,0.92)";
      roundRect(ctx!, 36, 48, pill, 54, 27);
      ctx!.fill();
      ctx!.fillStyle = INK;
      ctx!.fillText(input.storeName, 56, 84);

      // Caption, popping in over the first 0.3s
      const caption = input.captions[index] ?? "";
      if (caption) {
        const pop = Math.min(1, sinceStart / 0.3);
        ctx!.globalAlpha = pop;
        ctx!.font = `800 56px ${font}`;
        const lines = wrap(ctx!, caption, width - 120);
        const lineHeight = 66;
        let y = height - 170 - (lines.length - 1) * lineHeight + (1 - pop) * 24;
        ctx!.fillStyle = "#FFFFFF";
        for (const line of lines) {
          ctx!.fillText(line, 60, y);
          y += lineHeight;
        }
        ctx!.globalAlpha = 1;
      }
    } else {
      // End card
      ctx!.fillStyle = INK;
      ctx!.fillRect(0, 0, width, height);
      ctx!.fillStyle = "#FFFFFF";
      ctx!.textAlign = "center";
      ctx!.font = `800 44px ${font}`;
      ctx!.fillText(input.storeName, width / 2, height * 0.36);
      if (input.price) {
        ctx!.font = `800 96px ${font}`;
        ctx!.fillText(input.price, width / 2, height * 0.5);
      }
      ctx!.font = `800 40px ${font}`;
      const ctaWidth = Math.min(width - 100, ctx!.measureText(input.cta).width + 80);
      ctx!.fillStyle = ACCENT;
      roundRect(ctx!, (width - ctaWidth) / 2, height * 0.6, ctaWidth, 92, 46);
      ctx!.fill();
      ctx!.fillStyle = "#FFFFFF";
      ctx!.fillText(input.cta, width / 2, height * 0.6 + 60);
      ctx!.font = `600 30px ${font}`;
      ctx!.fillStyle = "rgba(255,255,255,0.75)";
      ctx!.fillText(input.storeHost, width / 2, height * 0.75);
      ctx!.textAlign = "start";
    }
  }

  frame(0);
  recorder.start(250);
  if (audioContext && audioBuffer && audioDestination) {
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioDestination);
    source.start(audioContext.currentTime + 0.3);
  }

  const started = performance.now();
  await new Promise<void>((resolve) => {
    // A timer, not requestAnimationFrame, so drawing carries on if the tab isn't focused.
    const timer = window.setInterval(() => {
      const t = (performance.now() - started) / 1000;
      if (t >= timeline.total) {
        window.clearInterval(timer);
        frame(timeline.total - 0.01);
        resolve();
        return;
      }
      frame(t);
      input.onProgress?.(t / timeline.total);
    }, 1000 / 30);
  });

  recorder.stop();
  await stopped;
  stream.getTracks().forEach((track) => track.stop());
  await audioContext?.close();
  input.onProgress?.(1);

  const type = recorder.mimeType || mimeType || "video/webm";
  return { blob: new Blob(chunks, { type }), mimeType: type, extension: type.includes("mp4") ? "mp4" : "webm", seconds: timeline.total };
}
