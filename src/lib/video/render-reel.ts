"use client";

import { VIDEO_SIZE } from "@shared/video";
import { musicLevels, popColours, reelTemplate, styledTimeline, textOn, type MusicMood, type ReelBrand, type ReelTemplateId } from "@shared/video-style";
import { renderMusic } from "./music";

// Renders a 9:16 product reel in the browser in one of the studio's templates (shared/video-style.ts): the shots
// with their captions, the brand's colours and logo, an end card with the price and call to action, a
// voiceover and background music. drawReelFrame draws any moment, so the live preview and the recording are the
// same picture. Canvas + Web Audio + MediaRecorder, no server.

export interface ReelShot {
  image: HTMLImageElement;
  caption: string;
  /** A cut-out product on a transparent background: drawn free-floating rather than on a card. */
  cutout: boolean;
}

export interface ReelScene {
  template: ReelTemplateId;
  shots: ReelShot[];
  brand: ReelBrand;
  logo: HTMLImageElement | null;
  storeName: string;
  price: string;
  cta: string;
  storeHost: string;
  font: string;
  timeline: ReturnType<typeof styledTimeline>;
}

export type ReelMusic = { mood: MusicMood; volume: number } | { file: ArrayBuffer; volume: number } | null;

export interface ReelInput {
  template: ReelTemplateId;
  photos: HTMLImageElement[];
  captions: string[];
  brand: ReelBrand;
  logo?: HTMLImageElement | null;
  cta: string;
  storeName: string;
  price: string;
  storeHost: string;
  /** An MP3, WAV or recorded clip of the voiceover. */
  voiceover?: ArrayBuffer | null;
  music?: ReelMusic;
  fontFamily?: string;
  onProgress?: (fraction: number) => void;
}

export interface ReelResult {
  blob: Blob;
  mimeType: string;
  extension: "mp4" | "webm";
  seconds: number;
  /** A cover picture (JPEG) from the middle of the first shot, for lists and ad thumbnails. */
  poster: Blob | null;
}

const MIME_TYPES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

const { width: W, height: H } = VIDEO_SIZE;

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

// ─── Drawing helpers ───────────────────────────────────────────────────────────

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const easeOut = (x: number) => 1 - (1 - clamp(x)) ** 3;
const easeInOut = (v: number) => {
  const x = clamp(v);
  return x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;
};
const easeBack = (x: number) => {
  const c = 1.70158;
  const v = clamp(x) - 1;
  return 1 + (c + 1) * v ** 3 + c * v ** 2;
};

function alpha(hex: string, a: number) {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function mix(hex: string, other: string, amount: number) {
  const a = Number.parseInt(hex.slice(1, 7), 16);
  const b = Number.parseInt(other.slice(1, 7), 16);
  const channel = (shift: number) => Math.round(((a >> shift) & 255) * (1 - amount) + ((b >> shift) & 255) * amount);
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, "0")).join("")}`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 3) {
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
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]}…`;
    return kept;
  }
  return lines;
}

/** The largest font size (down to `min`) at which the text fits `maxWidth` in at most `maxLines` lines. */
function fit(ctx: CanvasRenderingContext2D, text: string, font: (size: number) => string, maxWidth: number, max: number, min: number, maxLines: number) {
  for (let size = max; size >= min; size -= 4) {
    ctx.font = font(size);
    const lines = wrap(ctx, text, maxWidth, 99);
    if (lines.length <= maxLines && lines.every((line) => ctx.measureText(line).width <= maxWidth)) return { size, lines };
  }
  ctx.font = font(min);
  return { size: min, lines: wrap(ctx, text, maxWidth, maxLines) };
}

function drawCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, w: number, h: number, zoom = 1, driftX = 0) {
  const cover = Math.max(w / image.naturalWidth, h / image.naturalHeight) * zoom;
  const iw = image.naturalWidth * cover;
  const ih = image.naturalHeight * cover;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(image, x + (w - iw) / 2 + driftX * (iw - w), y + (h - ih) / 2, iw, ih);
  ctx.restore();
}

/** The whole photo inside a box, centred, optionally rotated, scaled and with a soft shadow. */
function drawContain(ctx: CanvasRenderingContext2D, image: HTMLImageElement, cx: number, cy: number, maxW: number, maxH: number, opts: { scale?: number; rotate?: number; shadow?: boolean; radius?: number } = {}) {
  const fitScale = Math.min(maxW / image.naturalWidth, maxH / image.naturalHeight) * (opts.scale ?? 1);
  const w = image.naturalWidth * fitScale;
  const h = image.naturalHeight * fitScale;
  ctx.save();
  ctx.translate(cx, cy);
  if (opts.rotate) ctx.rotate(opts.rotate);
  if (opts.shadow) {
    ctx.shadowColor = "rgba(0,0,0,0.28)";
    ctx.shadowBlur = 50;
    ctx.shadowOffsetY = 28;
  }
  if (opts.radius) {
    roundRect(ctx, -w / 2, -h / 2, w, h, opts.radius);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.clip();
  }
  ctx.drawImage(image, -w / 2, -h / 2, w, h);
  ctx.restore();
  return { w, h };
}

function drawLogo(ctx: CanvasRenderingContext2D, scene: ReelScene, cx: number, cy: number, maxW: number, maxH: number, onColour: string, tile = false) {
  if (scene.logo) {
    if (tile) {
      const pad = 18;
      const fitScale = Math.min(maxW / scene.logo.naturalWidth, maxH / scene.logo.naturalHeight);
      const w = scene.logo.naturalWidth * fitScale + pad * 2;
      const h = scene.logo.naturalHeight * fitScale + pad * 2;
      ctx.fillStyle = "#FFFFFF";
      roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 22);
      ctx.fill();
    }
    drawContain(ctx, scene.logo, cx, cy, maxW, maxH);
    return;
  }
  ctx.fillStyle = onColour;
  ctx.textAlign = "center";
  const { size } = fit(ctx, scene.storeName.toUpperCase(), (s) => `800 ${s}px ${scene.font}`, maxW, Math.min(46, maxH), 22, 1);
  ctx.font = `800 ${size}px ${scene.font}`;
  ctx.fillText(scene.storeName.toUpperCase(), cx, cy + size * 0.35);
  ctx.textAlign = "start";
}

function centredLines(ctx: CanvasRenderingContext2D, lines: string[], cx: number, centreY: number, lineHeight: number) {
  ctx.textAlign = "center";
  let y = centreY - ((lines.length - 1) * lineHeight) / 2;
  for (const line of lines) {
    ctx.fillText(line, cx, y);
    y += lineHeight;
  }
  ctx.textAlign = "start";
}

// ─── Templates ─────────────────────────────────────────────────────────────────

interface ShotMoment {
  index: number;
  /** 0..1 through the shot. */
  p: number;
  /** Seconds since the shot started. */
  s: number;
  dur: number;
}

function drawFloat(ctx: CanvasRenderingContext2D, scene: ReelScene, m: ShotMoment) {
  const { brand } = scene;
  const top = mix(brand.background, "#FFFFFF", 0.35);
  const bottom = mix(brand.background, brand.primary, 0.18);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, top);
  bg.addColorStop(1, bottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, H * 0.47, 40, W / 2, H * 0.47, W * 0.62);
  glow.addColorStop(0, alpha(brand.primary, 0.22));
  glow.addColorStop(1, alpha(brand.primary, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const shot = scene.shots[m.index];
  const enter = easeOut(m.s / 0.55);
  const exit = easeInOut(clamp((m.s - (m.dur - 0.3)) / 0.3));
  const bob = Math.sin(m.s * 1.7 + m.index) * 14;
  const y = H * 0.46 + (1 - enter) * 140 - exit * 120 + bob;
  // Shadow on the "floor" that shrinks as the product rises.
  ctx.fillStyle = alpha("#000000", 0.12 * enter * (1 - exit));
  ctx.beginPath();
  ctx.ellipse(W / 2, H * 0.74, 190 - bob * 2, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = enter * (1 - exit);
  drawContain(ctx, shot.image, W / 2, y, W * 0.86, H * 0.58, { scale: 0.88 + 0.12 * enter, rotate: Math.sin(m.s * 0.9 + m.index) * 0.05, shadow: true, radius: shot.cutout ? 0 : 28 });
  ctx.globalAlpha = 1;

  if (shot.caption) {
    const show = easeOut((m.s - 0.25) / 0.5) * (1 - exit);
    ctx.globalAlpha = show;
    ctx.fillStyle = brand.ink;
    const { size, lines } = fit(ctx, shot.caption, (s) => `600 ${s}px ${scene.font}`, W - 140, 64, 34, 2);
    ctx.font = `600 ${size}px ${scene.font}`;
    centredLines(ctx, lines, W / 2, H * 0.84 + (1 - show) * 30, size * 1.15);
    ctx.globalAlpha = 1;
  }
  drawLogo(ctx, scene, W / 2, 96, 260, 64, brand.ink);
}

function drawBold(ctx: CanvasRenderingContext2D, scene: ReelScene, m: ShotMoment) {
  const { brand } = scene;
  const bgColour = m.index % 2 === 0 ? brand.primary : brand.secondary;
  const ink = textOn(bgColour);
  ctx.fillStyle = bgColour;
  ctx.fillRect(0, 0, W, H);
  const shot = scene.shots[m.index];
  const words = (shot.caption || scene.storeName).toUpperCase();

  // Giant type behind the product, filling the screen: one long word splits in two ("CHE / ESE"), so the
  // letters stay huge and show above and below the product.
  const tokens = words.split(/\s+/).filter(Boolean).slice(0, 3);
  const lines = tokens.length === 1 && tokens[0].length >= 6 ? [tokens[0].slice(0, Math.ceil(tokens[0].length / 2)), tokens[0].slice(Math.ceil(tokens[0].length / 2))] : tokens;
  let size = 340;
  ctx.font = `900 ${size}px ${scene.font}`;
  while (size > 70 && (lines.some((line) => ctx.measureText(line).width > W - 40) || lines.length * size * 0.88 > H * 0.62)) {
    size -= 6;
    ctx.font = `900 ${size}px ${scene.font}`;
  }
  ctx.save();
  ctx.fillStyle = alpha(ink === "#FFFFFF" ? "#FFFFFF" : "#16141F", 0.96);
  lines.forEach((line, i) => {
    const slide = easeOut((m.s - i * 0.08) / 0.45);
    const fromLeft = i % 2 === 0 ? -1 : 1;
    ctx.save();
    ctx.translate((1 - slide) * fromLeft * W, 0);
    ctx.transform(1, 0, -0.14 * (1 - slide) * fromLeft, 1, 0, 0);
    ctx.textAlign = "center";
    ctx.fillText(line, W / 2, H * 0.47 - ((lines.length - 1) * size * 0.88) / 2 + i * size * 0.88 + size * 0.34);
    ctx.restore();
  });
  ctx.restore();

  const pop = easeBack((m.s - 0.2) / 0.5);
  const pulse = 1 + Math.sin(m.s * 3) * 0.015;
  if (pop > 0.01) drawContain(ctx, shot.image, W / 2, H * 0.5, W * 0.62, H * 0.36, { scale: pop * pulse, shadow: true, radius: shot.cutout ? 0 : 26 });
  drawLogo(ctx, scene, W / 2, H - 110, 200, 56, ink);
  // A quick flash on the cut.
  if (m.index > 0 && m.s < 0.08) {
    ctx.fillStyle = alpha("#FFFFFF", 1 - m.s / 0.08);
    ctx.fillRect(0, 0, W, H);
  }
}

function drawPop(ctx: CanvasRenderingContext2D, scene: ReelScene, m: ShotMoment) {
  const colours = popColours(scene.brand);
  const colour = colours[m.index % colours.length];
  const previous = colours[(m.index + colours.length - 1) % colours.length];
  // Round wipe from the centre into the new colour.
  ctx.fillStyle = m.index === 0 ? colour : previous;
  ctx.fillRect(0, 0, W, H);
  const wipe = m.index === 0 ? 1 : easeInOut(m.s / 0.45);
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, wipe * Math.hypot(W, H) * 0.6, 0, Math.PI * 2);
  ctx.fill();
  const ink = textOn(colour);

  // Confetti dots in the other brand colours.
  for (let i = 0; i < 14; i++) {
    const x = ((i * 137 + m.index * 59) % 100) / 100 * W;
    const y0 = ((i * 71 + m.index * 23) % 100) / 100 * H;
    const y = (y0 + m.s * (30 + (i % 4) * 18)) % H;
    ctx.fillStyle = alpha(i % 2 ? textOn(colour) : colours[(m.index + 1) % colours.length], 0.35);
    ctx.beginPath();
    ctx.arc(x, y, 6 + (i % 3) * 4, 0, Math.PI * 2);
    ctx.fill();
  }

  const shot = scene.shots[m.index];
  const pop = easeBack((m.s - 0.2) / 0.45);
  const tilt = (m.index % 2 === 0 ? -1 : 1) * 0.06 * (1 - easeOut((m.s - 0.2) / 0.8)) + (m.index % 2 === 0 ? -0.025 : 0.025);
  if (pop > 0.01) {
    ctx.save();
    ctx.translate(W / 2, H * 0.58);
    ctx.rotate(tilt);
    ctx.scale(pop, pop);
    const cw = W * 0.7;
    const ch = H * 0.5;
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 22;
    ctx.fillStyle = "#FFFFFF";
    roundRect(ctx, -cw / 2, -ch / 2, cw, ch, 34);
    ctx.fill();
    ctx.shadowColor = "transparent";
    drawContain(ctx, shot.image, 0, 0, cw - 44, ch - 44, { radius: 20 });
    ctx.restore();
  }
  if (shot.caption) {
    const show = easeBack((m.s - 0.05) / 0.4);
    ctx.save();
    ctx.translate(W / 2, H * 0.19);
    ctx.scale(clamp(show, 0, 1.2), clamp(show, 0, 1.2));
    ctx.fillStyle = ink;
    const { size, lines } = fit(ctx, shot.caption.toUpperCase(), (s) => `900 ${s}px ${scene.font}`, W - 100, 96, 44, 2);
    ctx.font = `900 ${size}px ${scene.font}`;
    centredLines(ctx, lines, 0, 0, size * 1.02);
    ctx.restore();
  }
  drawLogo(ctx, scene, W / 2, H - 92, 180, 52, ink, Boolean(scene.logo));
}

function drawWords(ctx: CanvasRenderingContext2D, scene: ReelScene, m: ShotMoment) {
  const { brand } = scene;
  const shot = scene.shots[m.index];
  const split = m.dur * 0.42;
  const block = m.index % 2 === 0 ? brand.primary : brand.secondary;
  const words = (shot.caption || scene.storeName).split(/\s+/).filter(Boolean);
  const punch = words.slice(0, 2).join(" ").toUpperCase();

  if (m.s < split) {
    const enter = easeOut(m.s / 0.18);
    ctx.fillStyle = m.index === 0 ? block : brand.ink;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = block;
    ctx.fillRect((1 - enter) * W, 0, W, H);
    const ink = textOn(block);
    ctx.fillStyle = ink;
    const { size, lines } = fit(ctx, punch, (s) => `900 ${s}px ${scene.font}`, W - 80, 230, 80, 2);
    ctx.font = `900 ${size}px ${scene.font}`;
    const scale = 0.9 + 0.1 * easeOut((m.s - 0.05) / 0.3);
    ctx.save();
    ctx.translate(W / 2 + (1 - enter) * W, H / 2);
    ctx.scale(scale, scale);
    centredLines(ctx, lines, 0, size * 0.3, size * 0.95);
    ctx.restore();
    return;
  }
  const s = m.s - split;
  const local = s / (m.dur - split);
  const enter = easeOut(s / 0.2);
  ctx.fillStyle = block;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate((1 - enter) * W, 0);
  drawCover(ctx, shot.image, 0, 0, W, H, 1.06 + 0.08 * local, (m.index % 2 ? -0.15 : 0.15) * (local - 0.5));
  ctx.restore();
  const shade = ctx.createLinearGradient(0, H * 0.6, 0, H);
  shade.addColorStop(0, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, H * 0.6, W, H * 0.4);
  if (shot.caption) {
    const { size, lines } = fit(ctx, shot.caption, (sz) => `800 ${sz}px ${scene.font}`, W - 140, 60, 36, 2);
    ctx.font = `800 ${size}px ${scene.font}`;
    let y = H - 150 - (lines.length - 1) * size * 1.25;
    for (const line of lines) {
      const lw = ctx.measureText(line).width;
      ctx.fillStyle = brand.primary;
      roundRect(ctx, 50, y - size * 0.95, lw + 40, size * 1.3, 10);
      ctx.fill();
      ctx.fillStyle = textOn(brand.primary);
      ctx.fillText(line, 70, y);
      y += size * 1.25;
    }
  }
  drawLogo(ctx, scene, W - 130, 90, 180, 52, "#FFFFFF", true);
}

function gridCells(count: number) {
  const n = Math.min(6, Math.max(1, count));
  const cols = n === 1 ? 1 : 2;
  const rows = Math.ceil(n / cols);
  const gap = 18;
  const top = 200;
  const cw = (W - 60 * 2 - gap * (cols - 1)) / cols;
  const ch = Math.min(cw * 1.25, (H - top - 160 - gap * (rows - 1)) / rows);
  return Array.from({ length: n }, (_, i) => ({ x: 60 + (i % cols) * (cw + gap), y: top + Math.floor(i / cols) * (ch + gap), w: cw, h: ch }));
}

function drawGridIntro(ctx: CanvasRenderingContext2D, scene: ReelScene, s: number) {
  const { brand } = scene;
  ctx.fillStyle = brand.background;
  ctx.fillRect(0, 0, W, H);
  gridCells(scene.shots.length).forEach((cell, i) => {
    const pop = easeBack((s - i * 0.12) / 0.45);
    if (pop <= 0.01) return;
    ctx.save();
    ctx.translate(cell.x + cell.w / 2, cell.y + cell.h / 2);
    ctx.scale(pop, pop);
    ctx.shadowColor = "rgba(0,0,0,0.18)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 12;
    roundRect(ctx, -cell.w / 2, -cell.h / 2, cell.w, cell.h, 20);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.clip();
    drawCover(ctx, scene.shots[i].image, -cell.w / 2, -cell.h / 2, cell.w, cell.h, 1.02);
    ctx.restore();
  });
  drawLogo(ctx, scene, W / 2, 110, 280, 70, brand.ink);
}

function drawGridShot(ctx: CanvasRenderingContext2D, scene: ReelScene, m: ShotMoment) {
  const { brand } = scene;
  const shot = scene.shots[m.index];
  const cells = gridCells(scene.shots.length);
  const cell = cells[Math.min(m.index, cells.length - 1)];
  const grow = easeInOut(m.s / 0.5);
  ctx.fillStyle = brand.background;
  ctx.fillRect(0, 0, W, H);
  const x = cell.x * (1 - grow);
  const y = cell.y * (1 - grow);
  const w = cell.w + (W - cell.w) * grow;
  const h = cell.h + (H - cell.h) * grow;
  ctx.save();
  roundRect(ctx, x, y, w, h, 20 * (1 - grow));
  ctx.clip();
  drawCover(ctx, shot.image, x, y, w, h, 1.04 + 0.06 * m.p);
  ctx.restore();
  if (shot.caption && grow > 0.95) {
    const show = easeOut((m.s - 0.5) / 0.35);
    ctx.globalAlpha = show;
    const { size, lines } = fit(ctx, shot.caption, (s) => `800 ${s}px ${scene.font}`, W - 160, 56, 34, 2);
    ctx.font = `800 ${size}px ${scene.font}`;
    const boxH = lines.length * size * 1.2 + 40;
    ctx.fillStyle = brand.primary;
    roundRect(ctx, 50, H - 140 - boxH, W - 100, boxH, 24);
    ctx.fill();
    ctx.fillStyle = textOn(brand.primary);
    centredLines(ctx, lines, W / 2, H - 140 - boxH / 2 + size * 0.35, size * 1.2);
    ctx.globalAlpha = 1;
  }
}

function drawClassic(ctx: CanvasRenderingContext2D, scene: ReelScene, m: ShotMoment) {
  const shot = scene.shots[m.index];
  ctx.fillStyle = "#16141F";
  ctx.fillRect(0, 0, W, H);
  drawCover(ctx, shot.image, 0, 0, W, H, 1.04 + 0.1 * m.p, (m.index % 2 === 0 ? 0.35 : -0.35) * (m.p - 0.5));
  if (m.index > 0 && m.s < 0.35) {
    ctx.globalAlpha = 1 - m.s / 0.35;
    drawCover(ctx, scene.shots[m.index - 1].image, 0, 0, W, H, 1.14, (m.index % 2 === 0 ? -0.35 : 0.35) * 0.5);
    ctx.globalAlpha = 1;
  }
  const shade = ctx.createLinearGradient(0, H * 0.55, 0, H);
  shade.addColorStop(0, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, H * 0.55, W, H * 0.45);
  ctx.font = `800 26px ${scene.font}`;
  const pill = ctx.measureText(scene.storeName).width + 40;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  roundRect(ctx, 36, 48, pill, 54, 27);
  ctx.fill();
  ctx.fillStyle = "#16141F";
  ctx.fillText(scene.storeName, 56, 84);
  if (shot.caption) {
    const pop = Math.min(1, m.s / 0.3);
    ctx.globalAlpha = pop;
    ctx.font = `800 56px ${scene.font}`;
    const lines = wrap(ctx, shot.caption, W - 120);
    let y = H - 170 - (lines.length - 1) * 66 + (1 - pop) * 24;
    ctx.fillStyle = "#FFFFFF";
    for (const line of lines) {
      ctx.fillText(line, 60, y);
      y += 66;
    }
    ctx.globalAlpha = 1;
  }
}

const GOLD = "#E8C77A";
const HAND_FONT = "\"Segoe Print\", \"Bradley Hand\", \"Marker Felt\", \"Comic Sans MS\", cursive";
const SERIF_FONT = "Georgia, \"Times New Roman\", serif";

/** How far through the shot's exit (0..1), over its last 0.3 s. */
const exitOf = (m: ShotMoment) => easeInOut(clamp((m.s - (m.dur - 0.3)) / 0.3));

function drawSpotlight(ctx: CanvasRenderingContext2D, scene: ReelScene, m: ShotMoment) {
  const { brand } = scene;
  ctx.fillStyle = mix(brand.secondary, "#000000", 0.78);
  ctx.fillRect(0, 0, W, H);
  // The light sweeps in from alternate sides and settles on the product.
  const sweep = easeInOut(m.s / 0.9);
  const lx = m.index % 2 === 0 ? W * (-0.1 + 0.6 * sweep) : W * (1.1 - 0.6 * sweep);
  const glow = ctx.createRadialGradient(lx, H * 0.5, 20, lx, H * 0.5, W * 0.8);
  glow.addColorStop(0, alpha(mix(brand.primary, "#FFFFFF", 0.65), 0.5));
  glow.addColorStop(0.5, alpha(brand.primary, 0.12));
  glow.addColorStop(1, alpha(brand.primary, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = 0.14 * sweep;
  const cone = ctx.createLinearGradient(0, 0, 0, H * 0.78);
  cone.addColorStop(0, "#FFFFFF");
  cone.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = cone;
  ctx.beginPath();
  ctx.moveTo(lx - 30, 0);
  ctx.lineTo(lx + 30, 0);
  ctx.lineTo(lx + W * 0.42, H * 0.78);
  ctx.lineTo(lx - W * 0.42, H * 0.78);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = alpha("#FFFFFF", 0.07 * sweep);
  ctx.beginPath();
  ctx.ellipse(W / 2, H * 0.76, 300, 42, 0, 0, Math.PI * 2);
  ctx.fill();

  const shot = scene.shots[m.index];
  const reveal = easeOut((m.s - 0.25) / 0.7);
  const exit = exitOf(m);
  ctx.globalAlpha = reveal * (1 - exit);
  drawContain(ctx, shot.image, W / 2, H * 0.5, W * 0.78, H * 0.5, { scale: 0.92 + 0.08 * reveal + 0.03 * m.p, shadow: true, radius: shot.cutout ? 0 : 24 });
  ctx.globalAlpha = 1;
  if (shot.caption) {
    const show = easeOut((m.s - 0.6) / 0.5) * (1 - exit);
    ctx.globalAlpha = show;
    ctx.fillStyle = GOLD;
    const { size, lines } = fit(ctx, shot.caption.toUpperCase(), (s) => `700 ${s}px ${scene.font}`, W - 160, 58, 30, 2);
    ctx.font = `700 ${size}px ${scene.font}`;
    const centre = H * 0.86;
    centredLines(ctx, lines, W / 2, centre, size * 1.2);
    ctx.fillRect(W / 2 - 60 * show, centre - ((lines.length - 1) * size * 1.2) / 2 - size * 1.15, 120 * show, 3);
    ctx.globalAlpha = 1;
  }
  drawLogo(ctx, scene, W / 2, 100, 240, 60, "#FFFFFF", Boolean(scene.logo));
}

function drawSplit(ctx: CanvasRenderingContext2D, scene: ReelScene, m: ShotMoment) {
  const { brand } = scene;
  const deep = m.index % 2 === 0 ? brand.primary : brand.secondary;
  const light = mix(deep, "#FFFFFF", 0.8);
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, W, H);
  const open = easeInOut(m.s / 0.5);
  ctx.fillStyle = deep;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(W, H * (0.22 + 0.2 * open));
  ctx.lineTo(0, H * (0.42 + 0.2 * open));
  ctx.closePath();
  ctx.fill();

  const shot = scene.shots[m.index];
  const exit = exitOf(m);
  if (shot.caption) {
    const show = easeOut((m.s - 0.15) / 0.45) * (1 - exit);
    ctx.save();
    ctx.globalAlpha = show;
    ctx.fillStyle = textOn(deep);
    const { size, lines } = fit(ctx, shot.caption, (s) => `300 ${s}px ${scene.font}`, W - 140, 112, 48, 2);
    ctx.font = `300 ${size}px ${scene.font}`;
    let y = 150 + size - (1 - show) * 40;
    for (const line of lines) {
      ctx.fillText(line, 70, y);
      y += size * 1.04;
    }
    ctx.restore();
  }
  const slide = easeOut((m.s - 0.1) / 0.6);
  const x = W / 2 + (1 - slide) * W * 0.8 - exit * W * 0.8;
  drawContain(ctx, shot.image, x, H * 0.62, W * 0.8, H * 0.44, { scale: 1 + 0.04 * m.p, rotate: -0.04, shadow: true, radius: shot.cutout ? 0 : 26 });
  drawLogo(ctx, scene, W / 2, H - 96, 220, 56, textOn(light));
}

function drawZoom(ctx: CanvasRenderingContext2D, scene: ReelScene, m: ShotMoment) {
  const shot = scene.shots[m.index];
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, W, H);
  // A hard punch in on the cut, a second smaller one halfway, and a slow creep between.
  const punch = 1.32 - 0.27 * easeOut(m.s / 0.25);
  const second = m.s > m.dur * 0.5 ? 0.12 * (1 - easeOut((m.s - m.dur * 0.5) / 0.25)) : 0;
  const shake = m.s < 0.2 ? Math.sin(m.s * 90) * 12 * (1 - m.s / 0.2) : 0;
  ctx.save();
  ctx.translate(shake, 0);
  drawCover(ctx, shot.image, 0, 0, W, H, punch + second + 0.05 * m.p);
  ctx.restore();
  const shade = ctx.createLinearGradient(0, H * 0.5, 0, H);
  shade.addColorStop(0, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, H * 0.5, W, H * 0.5);
  if (m.s < 0.1) {
    ctx.fillStyle = alpha("#FFFFFF", 0.85 * (1 - m.s / 0.1));
    ctx.fillRect(0, 0, W, H);
  }
  if (shot.caption) {
    // Words pop in one at a time, the newest in the brand colour.
    const words = shot.caption.toUpperCase().split(/\s+/).filter(Boolean);
    const per = Math.max(0.22, (m.dur - 0.3) / Math.max(1, words.length));
    const count = Math.min(words.length, Math.floor(m.s / per) + 1);
    const { size, lines } = fit(ctx, words.slice(0, count).join(" "), (s) => `900 ${s}px ${scene.font}`, W - 120, 124, 52, 3);
    ctx.font = `900 ${size}px ${scene.font}`;
    const bounce = 1 + 0.18 * (1 - easeBack(((m.s - (count - 1) * per) / 0.18)));
    ctx.save();
    ctx.translate(W / 2, H * 0.74);
    ctx.scale(bounce, bounce);
    ctx.textAlign = "center";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(8, size * 0.12);
    ctx.strokeStyle = "#000000";
    let y = -((lines.length - 1) * size) / 2 + size * 0.35;
    lines.forEach((line, i) => {
      ctx.strokeText(line, 0, y);
      ctx.fillStyle = i === lines.length - 1 ? scene.brand.primary : "#FFFFFF";
      ctx.fillText(line, 0, y);
      y += size;
    });
    ctx.restore();
  }
  ctx.fillStyle = scene.brand.primary;
  ctx.fillRect(0, 0, W * m.p, 10);
  drawLogo(ctx, scene, W - 130, 90, 180, 52, "#FFFFFF", true);
}

function drawMagazine(ctx: CanvasRenderingContext2D, scene: ReelScene, m: ShotMoment) {
  const { brand } = scene;
  const shot = scene.shots[m.index];
  const enter = easeOut(m.s / 0.5);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);
  drawCover(ctx, shot.image, 0, 0, W, H, 1.12 - 0.08 * enter + 0.04 * m.p);
  const top = ctx.createLinearGradient(0, 0, 0, H * 0.32);
  top.addColorStop(0, "rgba(0,0,0,0.45)");
  top.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, H * 0.32);
  const bottom = ctx.createLinearGradient(0, H * 0.6, 0, H);
  bottom.addColorStop(0, "rgba(0,0,0,0)");
  bottom.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.fillStyle = bottom;
  ctx.fillRect(0, H * 0.6, W, H * 0.4);

  // Masthead: the store name, huge, in a classic serif.
  const mast = scene.storeName.toUpperCase();
  const { size } = fit(ctx, mast, (s) => `900 ${s}px ${SERIF_FONT}`, W - 80, 200, 70, 1);
  ctx.font = `900 ${size}px ${SERIF_FONT}`;
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.fillText(mast, W / 2, 60 + size * 0.8 - (1 - enter) * 30);
  ctx.font = `600 22px ${scene.font}`;
  ctx.fillText(`${String(m.index + 1).padStart(2, "0")} / ${String(scene.shots.length).padStart(2, "0")}  ·  ${scene.storeHost}`, W / 2, 60 + size * 0.8 + 40);
  ctx.textAlign = "start";

  if (shot.caption) {
    const show = easeOut((m.s - 0.3) / 0.5);
    ctx.globalAlpha = show;
    const fitted = fit(ctx, shot.caption, (s) => `italic 700 ${s}px ${SERIF_FONT}`, W - 140, 92, 44, 3);
    ctx.font = `italic 700 ${fitted.size}px ${SERIF_FONT}`;
    let y = H - 170 - (fitted.lines.length - 1) * fitted.size * 1.05 + (1 - show) * 30;
    ctx.fillStyle = brand.primary;
    ctx.fillRect(70, y - fitted.size * 1.15, 90 * show, 8);
    ctx.fillStyle = "#FFFFFF";
    for (const line of fitted.lines) {
      ctx.fillText(line, 70, y);
      y += fitted.size * 1.05;
    }
    ctx.globalAlpha = 1;
  }
  if (scene.price) {
    const pop = easeBack((m.s - 0.5) / 0.45);
    if (pop > 0.01) {
      ctx.save();
      ctx.translate(W - 170, H * 0.42);
      ctx.rotate(0.18);
      ctx.scale(pop, pop);
      ctx.fillStyle = brand.primary;
      ctx.beginPath();
      ctx.arc(0, 0, 118, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = textOn(brand.primary);
      ctx.textAlign = "center";
      const price = fit(ctx, scene.price, (s) => `900 ${s}px ${scene.font}`, 190, 54, 26, 1);
      ctx.font = `900 ${price.size}px ${scene.font}`;
      ctx.fillText(scene.price, 0, price.size * 0.35);
      ctx.restore();
    }
  }
}

function drawTickerBand(ctx: CanvasRenderingContext2D, scene: ReelScene, text: string, y: number, angle: number, colour: string, speed: number, t: number) {
  ctx.save();
  ctx.translate(W / 2, y);
  ctx.rotate(angle);
  const h = 120;
  ctx.fillStyle = colour;
  ctx.fillRect(-W, -h / 2, W * 2, h);
  ctx.fillStyle = textOn(colour);
  ctx.font = `900 64px ${scene.font}`;
  const unit = Math.max(1, ctx.measureText(text).width);
  const offset = (((t * speed) % unit) + unit) % unit;
  for (let x = -W - unit + offset; x < W; x += unit) ctx.fillText(text, x, 23);
  ctx.restore();
}

function drawTicker(ctx: CanvasRenderingContext2D, scene: ReelScene, m: ShotMoment) {
  const { brand } = scene;
  ctx.fillStyle = brand.background;
  ctx.fillRect(0, 0, W, H);
  const shot = scene.shots[m.index];
  const text = `${(shot.caption || scene.storeName).toUpperCase()}  ✦  `;
  // Continuous time, so the bands keep scrolling across cuts.
  const t = m.index * m.dur + m.s;
  drawTickerBand(ctx, scene, text, H * 0.5, -0.06, mix(brand.primary, "#FFFFFF", 0.55), -160, t);
  const pop = easeBack((m.s - 0.1) / 0.45);
  if (pop > 0.01) drawContain(ctx, shot.image, W / 2, H * 0.5, W * 0.72, H * 0.42, { scale: pop * (1 + Math.sin(m.s * 3) * 0.015), rotate: Math.sin(m.s * 1.4 + m.index) * 0.04, shadow: true, radius: shot.cutout ? 0 : 26 });
  drawTickerBand(ctx, scene, text, H * 0.2, -0.09, brand.primary, 220, t);
  drawTickerBand(ctx, scene, text, H * 0.8, 0.08, brand.secondary, -220, t);
  drawLogo(ctx, scene, W / 2, 70, 200, 52, brand.ink);
  if (scene.price) {
    ctx.font = `900 56px ${scene.font}`;
    ctx.fillStyle = brand.ink;
    ctx.textAlign = "center";
    ctx.fillText(scene.price, W / 2, H - 50);
    ctx.textAlign = "start";
  }
}

function drawPrint(ctx: CanvasRenderingContext2D, scene: ReelScene, i: number, opts: { scale: number; settle: number; develop: number; opacity: number }) {
  const shot = scene.shots[i];
  const pw = W * 0.74;
  const ph = pw * 1.22;
  const pad = 32;
  const foot = 170;
  ctx.save();
  ctx.globalAlpha = opts.opacity;
  ctx.translate(W / 2 + (((i * 53) % 7) - 3) * 24, H * 0.45 + (((i * 29) % 5) - 2) * 20);
  ctx.rotate((((i * 37) % 11) - 5) * 0.024 * opts.settle);
  ctx.scale(opts.scale, opts.scale);
  ctx.shadowColor = "rgba(0,0,0,0.22)";
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
  ctx.shadowColor = "transparent";
  drawCover(ctx, shot.image, -pw / 2 + pad, -ph / 2 + pad, pw - pad * 2, ph - pad - foot);
  if (opts.develop < 1) {
    ctx.fillStyle = alpha("#F4F1EA", 1 - opts.develop);
    ctx.fillRect(-pw / 2 + pad, -ph / 2 + pad, pw - pad * 2, ph - pad - foot);
  }
  ctx.fillStyle = alpha(scene.brand.primary, 0.85);
  ctx.save();
  ctx.translate(0, -ph / 2);
  ctx.rotate(-0.05);
  ctx.fillRect(-90, -24, 180, 48);
  ctx.restore();
  if (shot.caption) {
    ctx.fillStyle = "#2B2A33";
    const { size, lines } = fit(ctx, shot.caption, (s) => `600 ${s}px ${HAND_FONT}`, pw - pad * 2, 54, 30, 2);
    ctx.font = `600 ${size}px ${HAND_FONT}`;
    centredLines(ctx, lines, 0, ph / 2 - foot / 2 + size * 0.3, size * 1.1);
  }
  ctx.restore();
}

function drawPolaroid(ctx: CanvasRenderingContext2D, scene: ReelScene, m: ShotMoment) {
  const { brand } = scene;
  ctx.fillStyle = mix(brand.background, "#000000", 0.05);
  ctx.fillRect(0, 0, W, H);
  // The last few prints stay on the pile underneath the new one.
  for (let i = Math.max(0, m.index - 3); i < m.index; i++) drawPrint(ctx, scene, i, { scale: 1, settle: 1, develop: 1, opacity: 1 });
  const drop = easeOut(m.s / 0.55);
  drawPrint(ctx, scene, m.index, { scale: 1.35 - 0.35 * drop, settle: easeBack(m.s / 0.6), develop: clamp((m.s - 0.2) / 0.9), opacity: clamp(m.s / 0.18) });
  drawLogo(ctx, scene, W / 2, H - 100, 220, 56, brand.ink);
}

/** A repeatable 0..1 noise value, so a frame draws the same in the preview and the recording. */
const noise = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

function spaced(ctx: CanvasRenderingContext2D, px: number) {
  ctx.letterSpacing = `${px}px`;
}

function drawGallery(ctx: CanvasRenderingContext2D, scene: ReelScene, m: ShotMoment) {
  ctx.fillStyle = "#F7F5F0";
  ctx.fillRect(0, 0, W, H);
  const light = ctx.createRadialGradient(W * 0.3, -40, 40, W * 0.3, -40, H * 0.8);
  light.addColorStop(0, "rgba(255,255,255,0.9)");
  light.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, W, H);
  const floor = ctx.createLinearGradient(0, H * 0.7, 0, H);
  floor.addColorStop(0, "#ECE8E0");
  floor.addColorStop(1, "#DFDAD0");
  ctx.fillStyle = floor;
  ctx.fillRect(0, H * 0.7, W, H * 0.3);
  // The plinth: a white block with a shaded side.
  const pw = W * 0.5;
  const px = (W - pw) / 2;
  const py = H * 0.62;
  ctx.fillStyle = "rgba(0,0,0,0.06)";
  ctx.beginPath();
  ctx.ellipse(W / 2 + 40, py + H * 0.2, pw * 0.62, 24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(px, py, pw, H * 0.2);
  ctx.fillStyle = "#EEEAE2";
  ctx.fillRect(px + pw * 0.78, py, pw * 0.22, H * 0.2);
  ctx.fillStyle = "#FBFAF7";
  ctx.fillRect(px, py - 10, pw, 10);

  const shot = scene.shots[m.index];
  const enter = easeOut(m.s / 0.8);
  const exit = exitOf(m);
  ctx.globalAlpha = enter * (1 - exit);
  // Stand the product on the plinth: its contained height decides where its centre goes.
  const scale = 1 + 0.035 * m.p;
  const sitH = Math.min((W * 0.6) / shot.image.naturalWidth, (H * 0.36) / shot.image.naturalHeight) * shot.image.naturalHeight * scale;
  drawContain(ctx, shot.image, W / 2, py - 10 - sitH / 2 - (1 - enter) * 24, W * 0.6, H * 0.36, { scale, shadow: true, radius: shot.cutout ? 0 : 8 });
  ctx.globalAlpha = 1;

  ctx.fillStyle = "#16141F";
  ctx.textAlign = "center";
  spaced(ctx, 6);
  ctx.font = `600 20px ${scene.font}`;
  ctx.fillText(scene.storeName.toUpperCase(), W / 2, 90);
  spaced(ctx, 0);
  ctx.textAlign = "start";
  ctx.font = `500 20px ${scene.font}`;
  ctx.fillStyle = "rgba(22,20,31,0.45)";
  ctx.fillText(String(m.index + 1).padStart(2, "0"), 56, 90);
  if (shot.caption) {
    const show = easeOut((m.s - 0.5) / 0.6) * (1 - exit);
    ctx.globalAlpha = show;
    ctx.fillStyle = "#16141F";
    spaced(ctx, 3);
    const { size, lines } = fit(ctx, shot.caption, (s) => `400 ${s}px ${scene.font}`, W - 160, 44, 28, 2);
    ctx.font = `400 ${size}px ${scene.font}`;
    centredLines(ctx, lines, W / 2, H * 0.9 + (1 - show) * 12, size * 1.3);
    spaced(ctx, 0);
    ctx.globalAlpha = 1;
  }
}

function drawFrame(ctx: CanvasRenderingContext2D, scene: ReelScene, m: ShotMoment) {
  const { brand } = scene;
  const page = mix(brand.background, "#FFFFFF", 0.5);
  ctx.fillStyle = page;
  ctx.fillRect(0, 0, W, H);
  const shot = scene.shots[m.index];
  const exit = exitOf(m);
  const x = 64;
  const y = 170;
  const w = W - 128;
  const h = H * 0.6;
  // The photo is revealed from the top down like a page being turned in.
  const open = easeInOut(m.s / 0.7);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h * open);
  ctx.clip();
  drawCover(ctx, shot.image, x, y, w, h, 1.06 - 0.04 * m.p);
  ctx.restore();
  ctx.strokeStyle = alpha(brand.ink, 0.16);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x - 14, y - 14, w + 28, h + 28);

  ctx.fillStyle = brand.ink;
  spaced(ctx, 5);
  ctx.font = `700 18px ${scene.font}`;
  ctx.fillText(scene.storeName.toUpperCase(), x - 14, 104);
  ctx.textAlign = "right";
  ctx.font = `500 18px ${scene.font}`;
  ctx.fillText(`NO. ${String(m.index + 1).padStart(2, "0")}`, x + w + 14, 104);
  ctx.textAlign = "start";
  spaced(ctx, 0);
  if (shot.caption) {
    const show = easeOut((m.s - 0.55) / 0.5) * (1 - exit);
    ctx.globalAlpha = show;
    const { size, lines } = fit(ctx, shot.caption, (s) => `italic 400 ${s}px ${SERIF_FONT}`, w, 64, 34, 2);
    ctx.font = `italic 400 ${size}px ${SERIF_FONT}`;
    let ty = y + h + 70 + size * 0.6 + (1 - show) * 16;
    for (const line of lines) {
      ctx.fillText(line, x - 14, ty);
      ty += size * 1.15;
    }
    ctx.fillStyle = brand.primary;
    ctx.fillRect(x - 14, y + h + 42, 64 * show, 3);
    ctx.globalAlpha = 1;
  }
  ctx.globalAlpha = 1 - exit * 0.6;
  ctx.fillStyle = alpha(brand.ink, 0.5);
  ctx.font = `500 18px ${scene.font}`;
  ctx.fillText(scene.storeHost, x - 14, H - 60);
  ctx.globalAlpha = 1;
}

function drawSwipe(ctx: CanvasRenderingContext2D, scene: ReelScene, m: ShotMoment) {
  const { brand } = scene;
  ctx.fillStyle = mix(brand.background, "#FFFFFF", 0.4);
  ctx.fillRect(0, 0, W, H);
  const pos = m.index === 0 ? 0 : m.index - 1 + easeInOut(m.s / 0.5);
  const cw = W * 0.72;
  const ch = H * 0.56;
  const gap = 36;
  scene.shots.forEach((shot, i) => {
    const offset = i - pos;
    if (Math.abs(offset) > 1.6) return;
    const cx = W / 2 + offset * (cw + gap);
    const scale = 1 - 0.08 * Math.min(1, Math.abs(offset));
    ctx.save();
    ctx.translate(cx, H * 0.46);
    ctx.scale(scale, scale);
    ctx.shadowColor = "rgba(0,0,0,0.16)";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 18;
    roundRect(ctx, -cw / 2, -ch / 2, cw, ch, 28);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.clip();
    if (shot.cutout) drawContain(ctx, shot.image, 0, 0, cw - 60, ch - 60);
    else drawCover(ctx, shot.image, -cw / 2, -ch / 2, cw, ch, 1.02);
    ctx.restore();
  });
  // Header like a post: a round avatar with the logo or initial, and the store name.
  ctx.fillStyle = brand.primary;
  ctx.beginPath();
  ctx.arc(86, 100, 30, 0, Math.PI * 2);
  ctx.fill();
  if (scene.logo) drawContain(ctx, scene.logo, 86, 100, 40, 40);
  else {
    ctx.fillStyle = textOn(brand.primary);
    ctx.font = `800 28px ${scene.font}`;
    ctx.textAlign = "center";
    ctx.fillText(scene.storeName.slice(0, 1).toUpperCase(), 86, 110);
    ctx.textAlign = "start";
  }
  ctx.fillStyle = brand.ink;
  ctx.font = `700 28px ${scene.font}`;
  ctx.fillText(scene.storeName, 132, 98);
  ctx.font = `500 20px ${scene.font}`;
  ctx.fillStyle = alpha(brand.ink, 0.55);
  ctx.fillText(scene.storeHost, 132, 126);
  // Dots.
  const dotsY = H * 0.46 + ch / 2 + 50;
  scene.shots.forEach((_, i) => {
    const on = Math.max(0, 1 - Math.abs(i - pos));
    ctx.fillStyle = on > 0.5 ? brand.primary : alpha(brand.ink, 0.2);
    ctx.beginPath();
    ctx.arc(W / 2 + (i - (scene.shots.length - 1) / 2) * 26, dotsY, 6 + 3 * on, 0, Math.PI * 2);
    ctx.fill();
  });
  const shot = scene.shots[m.index];
  if (shot.caption) {
    const show = easeOut((m.s - 0.45) / 0.4);
    ctx.globalAlpha = show;
    ctx.fillStyle = brand.ink;
    const { size, lines } = fit(ctx, shot.caption, (s) => `600 ${s}px ${scene.font}`, W - 140, 50, 30, 2);
    ctx.font = `600 ${size}px ${scene.font}`;
    centredLines(ctx, lines, W / 2, dotsY + 90, size * 1.2);
    ctx.globalAlpha = 1;
  }
}

function drawReveal(ctx: CanvasRenderingContext2D, scene: ReelScene, m: ShotMoment) {
  const { brand } = scene;
  const shot = scene.shots[m.index];
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);
  if (m.index > 0) drawCover(ctx, scene.shots[m.index - 1].image, 0, 0, W, H, 1.1);
  const open = m.index === 0 ? easeOut(m.s / 0.5) : easeInOut(m.s / 0.7);
  ctx.save();
  ctx.beginPath();
  ctx.arc(W / 2, H * 0.5, open * Math.hypot(W, H) * 0.55, 0, Math.PI * 2);
  ctx.clip();
  drawCover(ctx, shot.image, 0, 0, W, H, 1.02 + 0.08 * m.p);
  ctx.restore();
  const top = ctx.createLinearGradient(0, 0, 0, 220);
  top.addColorStop(0, "rgba(0,0,0,0.35)");
  top.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, 220);
  // Story progress bars.
  const n = scene.shots.length;
  const gap = 8;
  const bw = (W - 60 - gap * (n - 1)) / n;
  for (let i = 0; i < n; i++) {
    const x = 30 + i * (bw + gap);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    roundRect(ctx, x, 30, bw, 6, 3);
    ctx.fill();
    const done = i < m.index ? 1 : i === m.index ? m.p : 0;
    if (done > 0) {
      ctx.fillStyle = "#FFFFFF";
      roundRect(ctx, x, 30, bw * done, 6, 3);
      ctx.fill();
    }
  }
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `700 26px ${scene.font}`;
  ctx.fillText(scene.storeName, 34, 84);
  if (shot.caption) {
    const show = easeOut((m.s - 0.5) / 0.45);
    ctx.globalAlpha = show;
    const { size, lines } = fit(ctx, shot.caption, (s) => `700 ${s}px ${scene.font}`, W - 180, 46, 30, 2);
    ctx.font = `700 ${size}px ${scene.font}`;
    const boxW = Math.max(...lines.map((line) => ctx.measureText(line).width)) + 56;
    const boxH = lines.length * size * 1.25 + 34;
    const bx = 40;
    const by = H - 150 - boxH + (1 - show) * 30;
    ctx.fillStyle = "#FFFFFF";
    roundRect(ctx, bx, by, boxW, boxH, 20);
    ctx.fill();
    ctx.fillStyle = brand.primary;
    roundRect(ctx, bx, by, 8, boxH, 4);
    ctx.fill();
    ctx.fillStyle = "#16141F";
    lines.forEach((line, i) => ctx.fillText(line, bx + 30, by + 17 + size + i * size * 1.25));
    ctx.globalAlpha = 1;
  }
}

function drawCallout(ctx: CanvasRenderingContext2D, scene: ReelScene, m: ShotMoment) {
  const { brand } = scene;
  ctx.fillStyle = mix(brand.background, "#FFFFFF", 0.55);
  ctx.fillRect(0, 0, W, H);
  // A faint measuring grid, like a spec sheet.
  ctx.strokeStyle = alpha(brand.ink, 0.05);
  ctx.lineWidth = 1;
  for (let x = 40; x < W; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 40; y < H; y += 80) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.fillStyle = alpha(brand.ink, 0.06);
  ctx.font = `900 360px ${scene.font}`;
  ctx.textAlign = "center";
  ctx.fillText(String(m.index + 1).padStart(2, "0"), W / 2, H * 0.62);
  ctx.textAlign = "start";

  const shot = scene.shots[m.index];
  const pop = easeBack(m.s / 0.5);
  const exit = exitOf(m);
  ctx.globalAlpha = 1 - exit;
  if (pop > 0.01) drawContain(ctx, shot.image, W / 2, H * 0.52, W * 0.64, H * 0.42, { scale: pop, shadow: true, radius: shot.cutout ? 0 : 22 });
  if (shot.caption) {
    // A dot on the product, a line out to the side, then the label.
    const side = m.index % 2 === 0 ? 1 : -1;
    const dot = { x: W / 2 + side * W * 0.12, y: H * 0.44 };
    const elbow = { x: W / 2 + side * W * 0.26, y: H * 0.24 };
    const end = { x: side > 0 ? W - 60 : 60, y: elbow.y };
    const draw = easeInOut((m.s - 0.45) / 0.5);
    ctx.strokeStyle = brand.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(dot.x, dot.y);
    const first = clamp(draw * 2);
    ctx.lineTo(dot.x + (elbow.x - dot.x) * first, dot.y + (elbow.y - dot.y) * first);
    if (draw > 0.5) ctx.lineTo(elbow.x + (end.x - elbow.x) * clamp(draw * 2 - 1), elbow.y);
    ctx.stroke();
    ctx.fillStyle = brand.primary;
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, 10 * easeBack((m.s - 0.4) / 0.3), 0, Math.PI * 2);
    ctx.fill();
    const show = easeOut((m.s - 0.9) / 0.4);
    ctx.globalAlpha = show * (1 - exit);
    ctx.fillStyle = brand.ink;
    const width = Math.abs(end.x - elbow.x) + 120;
    const { size, lines } = fit(ctx, shot.caption, (s) => `700 ${s}px ${scene.font}`, Math.min(W - 120, width), 48, 28, 2);
    ctx.font = `700 ${size}px ${scene.font}`;
    ctx.textAlign = side > 0 ? "right" : "left";
    lines.forEach((line, i) => ctx.fillText(line, end.x, elbow.y - 22 - (lines.length - 1 - i) * size * 1.15));
    ctx.textAlign = "start";
  }
  ctx.globalAlpha = 1;
  drawLogo(ctx, scene, W / 2, H - 110, 220, 56, brand.ink);
}

function drawGoldFrame(ctx: CanvasRenderingContext2D, show: number) {
  ctx.strokeStyle = alpha(GOLD, 0.8 * show);
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 40, W - 80, H - 80);
  ctx.strokeStyle = alpha(GOLD, 0.35 * show);
  ctx.lineWidth = 1;
  ctx.strokeRect(54, 54, W - 108, H - 108);
}

function drawNoir(ctx: CanvasRenderingContext2D, scene: ReelScene, m: ShotMoment) {
  ctx.fillStyle = "#08080A";
  ctx.fillRect(0, 0, W, H);
  const halo = ctx.createRadialGradient(W / 2, H * 0.46, 30, W / 2, H * 0.46, W * 0.7);
  halo.addColorStop(0, "rgba(232,199,122,0.16)");
  halo.addColorStop(1, "rgba(232,199,122,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, H);
  drawGoldFrame(ctx, easeOut(m.s / 0.6));

  const shot = scene.shots[m.index];
  const fadeIn = easeInOut(m.s / 0.9);
  const exit = exitOf(m);
  ctx.globalAlpha = fadeIn * (1 - exit);
  const box = drawContain(ctx, shot.image, W / 2, H * 0.46, W * 0.66, H * 0.48, { scale: 1 + 0.06 * m.p, shadow: true, radius: shot.cutout ? 0 : 4 });
  // A slow diagonal shimmer across the product.
  const sweep = clamp((m.s - 0.8) / 1.4);
  if (sweep > 0 && sweep < 1) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const sx = W / 2 - box.w / 2 + sweep * (box.w + 300) - 150;
    const shine = ctx.createLinearGradient(sx - 90, 0, sx + 90, 0);
    shine.addColorStop(0, "rgba(255,240,200,0)");
    shine.addColorStop(0.5, "rgba(255,240,200,0.28)");
    shine.addColorStop(1, "rgba(255,240,200,0)");
    ctx.fillStyle = shine;
    ctx.translate(W / 2, H * 0.46);
    ctx.transform(1, 0, -0.35, 1, 0, 0);
    ctx.translate(-W / 2, -H * 0.46);
    ctx.fillRect(sx - 90, H * 0.46 - box.h / 2, 180, box.h);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = GOLD;
  ctx.textAlign = "center";
  spaced(ctx, 10);
  ctx.font = `400 30px ${SERIF_FONT}`;
  ctx.fillText(scene.storeName.toUpperCase(), W / 2, 130);
  spaced(ctx, 0);
  if (shot.caption) {
    const show = easeOut((m.s - 0.9) / 0.7) * (1 - exit);
    ctx.globalAlpha = show;
    spaced(ctx, 6);
    const { size, lines } = fit(ctx, shot.caption.toUpperCase(), (s) => `400 ${s}px ${SERIF_FONT}`, W - 200, 46, 28, 2);
    ctx.font = `400 ${size}px ${SERIF_FONT}`;
    centredLines(ctx, lines, W / 2, H * 0.84, size * 1.35);
    spaced(ctx, 0);
    const lineY = H * 0.84 - ((lines.length - 1) * size * 1.35) / 2 - size * 1.3;
    ctx.fillRect(W / 2 - 110 * show, lineY, 80 * show, 1.5);
    ctx.fillRect(W / 2 + 30 * show, lineY, 80 * show, 1.5);
    ctx.save();
    ctx.translate(W / 2, lineY + 1);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-6, -6, 12, 12);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = "start";
}

function drawSilk(ctx: CanvasRenderingContext2D, scene: ReelScene, m: ShotMoment) {
  const { brand } = scene;
  const t = m.index * m.dur + m.s;
  const deep = mix(brand.secondary, "#000000", 0.45);
  const rich = mix(brand.primary, "#000000", 0.5);
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, rich);
  bg.addColorStop(1, deep);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // Silk: soft waves of light drifting across.
  for (let band = 0; band < 5; band++) {
    ctx.beginPath();
    const base = H * (0.1 + band * 0.17);
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, base + Math.sin(x / 160 + t * 0.6 + band) * 60 + Math.sin(x / 70 + t * 0.9) * 14);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = `rgba(255,255,255,${0.035 + band * 0.008})`;
    ctx.fill();
  }
  const floorY = H * 0.7;
  const shot = scene.shots[m.index];
  const enter = easeOut(m.s / 0.9);
  const exit = exitOf(m);
  const bob = Math.sin(m.s * 1.4 + m.index) * 10;
  const maxW = W * 0.66;
  const maxH = H * 0.4;
  const cy = floorY - maxH / 2 - 20 + (1 - enter) * 60 + bob;
  ctx.globalAlpha = enter * (1 - exit);
  drawContain(ctx, shot.image, W / 2, cy, maxW, maxH, { scale: 1 + 0.03 * m.p, shadow: true, radius: shot.cutout ? 0 : 18 });
  // The reflection on the glossy floor, fading away.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, floorY, W, H - floorY);
  ctx.clip();
  ctx.globalAlpha = 0.22 * enter * (1 - exit);
  ctx.translate(0, floorY * 2 + 40);
  ctx.scale(1, -1);
  drawContain(ctx, shot.image, W / 2, cy, maxW, maxH, { scale: 1 + 0.03 * m.p, radius: shot.cutout ? 0 : 18 });
  ctx.restore();
  const fade = ctx.createLinearGradient(0, floorY, 0, floorY + H * 0.2);
  fade.addColorStop(0, alpha(deep, 0));
  fade.addColorStop(1, alpha(deep, 1));
  ctx.fillStyle = fade;
  ctx.fillRect(0, floorY, W, H - floorY);
  ctx.globalAlpha = 1;

  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  spaced(ctx, 8);
  ctx.font = `600 22px ${scene.font}`;
  ctx.fillText(scene.storeName.toUpperCase(), W / 2, 110);
  spaced(ctx, 0);
  if (shot.caption) {
    const show = easeOut((m.s - 0.7) / 0.6) * (1 - exit);
    ctx.globalAlpha = show;
    const { size, lines } = fit(ctx, shot.caption, (s) => `italic 400 ${s}px ${SERIF_FONT}`, W - 160, 64, 34, 2);
    ctx.font = `italic 400 ${size}px ${SERIF_FONT}`;
    centredLines(ctx, lines, W / 2, H * 0.86 + (1 - show) * 20, size * 1.2);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = "start";
}

function drawCinema(ctx: CanvasRenderingContext2D, scene: ReelScene, m: ShotMoment) {
  const shot = scene.shots[m.index];
  const bar = H * 0.15;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, W, H);
  const pan = (m.index % 2 === 0 ? 1 : -1) * (m.p - 0.5) * 0.5;
  drawCover(ctx, shot.image, 0, bar, W, H - bar * 2, 1.12 + 0.06 * m.p, pan);
  // A warm grade and a vignette.
  ctx.fillStyle = "rgba(255,170,90,0.07)";
  ctx.fillRect(0, bar, W, H - bar * 2);
  const vignette = ctx.createRadialGradient(W / 2, H / 2, W * 0.35, W / 2, H / 2, H * 0.6);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, bar, W, H - bar * 2);
  // Film grain, different every frame.
  const frame = Math.floor((m.index * m.dur + m.s) * 24);
  for (let i = 0; i < 260; i++) {
    const x = noise(i * 3.1 + frame) * W;
    const y = bar + noise(i * 7.7 + frame * 1.3) * (H - bar * 2);
    ctx.fillStyle = noise(i + frame * 0.7) > 0.5 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.12)";
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, W, bar);
  ctx.fillRect(0, H - bar, W, bar);
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.textAlign = "center";
  spaced(ctx, 9);
  ctx.font = `500 22px ${scene.font}`;
  ctx.fillText(scene.storeName.toUpperCase(), W / 2, bar / 2 + 8);
  spaced(ctx, 0);
  if (shot.caption) {
    const show = easeOut((m.s - 0.6) / 0.5);
    ctx.globalAlpha = show;
    ctx.fillStyle = "#F4EBDD";
    const { size, lines } = fit(ctx, shot.caption, (s) => `italic 400 ${s}px ${SERIF_FONT}`, W - 120, 44, 28, 2);
    ctx.font = `italic 400 ${size}px ${SERIF_FONT}`;
    centredLines(ctx, lines, W / 2, H - bar / 2 + 6, size * 1.2);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = "start";
  // Fade through black between shots.
  const dark = Math.max(1 - clamp(m.s / 0.45), clamp((m.s - (m.dur - 0.35)) / 0.35));
  if (dark > 0) {
    ctx.fillStyle = `rgba(0,0,0,${dark})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawEndCard(ctx: CanvasRenderingContext2D, scene: ReelScene, s: number) {
  const { brand } = scene;
  const feel = reelTemplate(scene.template).feel;
  // Luxury styles close in black and gold, clean ones on white; the rest in the brand colours.
  const luxe = feel === "luxury";
  const clean = feel === "clean" && scene.template !== "split";
  const bg = luxe
    ? scene.template === "spotlight" ? mix(brand.secondary, "#000000", 0.78) : "#08080A"
    : clean ? "#FFFFFF" : ["grid", "split", "polaroid"].includes(scene.template) ? brand.secondary : brand.primary;
  const ink = luxe ? GOLD : textOn(bg);
  const display = luxe ? SERIF_FONT : scene.font;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  if (luxe) drawGoldFrame(ctx, easeOut(s / 0.6));
  const enter = luxe ? easeOut(s / 0.7) : easeBack(s / 0.5);
  ctx.save();
  ctx.translate(W / 2, H * 0.3);
  ctx.scale(clamp(enter, 0, 1.2), clamp(enter, 0, 1.2));
  drawLogo(ctx, scene, 0, 0, 360, 170, ink, Boolean(scene.logo));
  ctx.restore();

  const rise = easeOut((s - 0.2) / 0.5);
  ctx.globalAlpha = rise;
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  if (scene.logo) {
    ctx.font = `700 40px ${display}`;
    ctx.fillText(scene.storeName, W / 2, H * 0.44 + (1 - rise) * 30);
  }
  if (scene.price) {
    const weight = luxe ? 400 : clean ? 700 : 900;
    const { size } = fit(ctx, scene.price, (sz) => `${weight} ${sz}px ${display}`, W - 120, 110, 56, 1);
    ctx.font = `${weight} ${size}px ${display}`;
    ctx.fillText(scene.price, W / 2, H * 0.55 + (1 - rise) * 30);
  }
  const button = luxe ? easeOut((s - 0.45) / 0.5) : easeBack((s - 0.45) / 0.5);
  if (button > 0.01) {
    ctx.font = `${luxe ? 500 : 800} 40px ${display}`;
    const bw = Math.min(W - 100, ctx.measureText(scene.cta).width + 90);
    ctx.save();
    ctx.translate(W / 2, H * 0.65 + 46);
    ctx.scale(clamp(button, 0, 1.15), clamp(button, 0, 1.15));
    roundRect(ctx, -bw / 2, -46, bw, 92, 46);
    if (luxe) {
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = GOLD;
    } else {
      ctx.fillStyle = clean ? brand.primary : ink;
      ctx.fill();
      ctx.fillStyle = clean ? textOn(brand.primary) : bg;
    }
    ctx.fillText(scene.cta, 0, 14);
    ctx.restore();
  }
  ctx.font = `600 30px ${scene.font}`;
  ctx.fillStyle = luxe ? alpha(GOLD, 0.75) : alpha(ink === "#FFFFFF" ? "#FFFFFF" : "#16141F", 0.8);
  ctx.fillText(scene.storeHost, W / 2, H * 0.8);
  ctx.textAlign = "start";
  ctx.globalAlpha = 1;
}

/** Draws the reel at `t` seconds. */
export function drawReelFrame(ctx: CanvasRenderingContext2D, scene: ReelScene, t: number) {
  const { intro, perShot, endCard } = scene.timeline;
  ctx.save();
  ctx.textBaseline = "alphabetic";
  const shotsEnd = intro + perShot * scene.shots.length;
  if (t < intro) drawGridIntro(ctx, scene, t);
  else if (t < shotsEnd && scene.shots.length) {
    const index = Math.min(scene.shots.length - 1, Math.floor((t - intro) / perShot));
    const s = t - intro - index * perShot;
    const m = { index, s, p: s / perShot, dur: perShot };
    if (scene.template === "float") drawFloat(ctx, scene, m);
    else if (scene.template === "bold") drawBold(ctx, scene, m);
    else if (scene.template === "pop") drawPop(ctx, scene, m);
    else if (scene.template === "words") drawWords(ctx, scene, m);
    else if (scene.template === "grid") drawGridShot(ctx, scene, m);
    else if (scene.template === "spotlight") drawSpotlight(ctx, scene, m);
    else if (scene.template === "split") drawSplit(ctx, scene, m);
    else if (scene.template === "zoom") drawZoom(ctx, scene, m);
    else if (scene.template === "magazine") drawMagazine(ctx, scene, m);
    else if (scene.template === "ticker") drawTicker(ctx, scene, m);
    else if (scene.template === "polaroid") drawPolaroid(ctx, scene, m);
    else if (scene.template === "gallery") drawGallery(ctx, scene, m);
    else if (scene.template === "frame") drawFrame(ctx, scene, m);
    else if (scene.template === "swipe") drawSwipe(ctx, scene, m);
    else if (scene.template === "reveal") drawReveal(ctx, scene, m);
    else if (scene.template === "callout") drawCallout(ctx, scene, m);
    else if (scene.template === "noir") drawNoir(ctx, scene, m);
    else if (scene.template === "silk") drawSilk(ctx, scene, m);
    else if (scene.template === "cinema") drawCinema(ctx, scene, m);
    else drawClassic(ctx, scene, m);
  } else drawEndCard(ctx, scene, Math.min(endCard, t - shotsEnd));
  ctx.restore();
}

/** Whether a photo is a cut-out (its corners are see-through). Unreadable photos count as ordinary ones. */
export function isCutout(image: HTMLImageElement) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 24;
    canvas.height = 24;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(image, 0, 0, 24, 24);
    const { data } = ctx.getImageData(0, 0, 24, 24);
    const corner = (x: number, y: number) => data[(y * 24 + x) * 4 + 3];
    return [corner(0, 0), corner(23, 0), corner(0, 23), corner(23, 23)].filter((a) => a < 40).length >= 3;
  } catch {
    return false;
  }
}

const cutoutCache = new WeakMap<HTMLImageElement, boolean>();

export function buildScene(input: Omit<ReelInput, "voiceover" | "music" | "onProgress">, voiceSeconds: number | null): ReelScene {
  const shots = input.photos.map((image, i) => {
    let cutout = cutoutCache.get(image);
    if (cutout === undefined) {
      cutout = isCutout(image);
      cutoutCache.set(image, cutout);
    }
    return { image, caption: input.captions[i] ?? "", cutout };
  });
  return {
    template: input.template,
    shots,
    brand: input.brand,
    logo: input.logo ?? null,
    storeName: input.storeName,
    price: input.price,
    cta: input.cta,
    storeHost: input.storeHost,
    font: input.fontFamily || "system-ui, sans-serif",
    timeline: styledTimeline(input.template, shots.length, voiceSeconds),
  };
}

// ─── Recording ─────────────────────────────────────────────────────────────────

export async function renderReel(input: ReelInput): Promise<ReelResult> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't make videos.");

  const audioContext = new AudioContext();
  await audioContext.resume().catch(() => undefined);
  let voice: AudioBuffer | null = null;
  if (input.voiceover) {
    try {
      voice = await audioContext.decodeAudioData(input.voiceover.slice(0));
    } catch {
      throw new Error("That voice recording couldn't be read. Record it again or pick another voice.");
    }
  }
  const scene = buildScene(input, voice?.duration ?? null);
  const total = scene.timeline.total;

  let music: AudioBuffer | null = null;
  if (input.music && "mood" in input.music) music = await renderMusic(input.music.mood, total, input.photos.length + total);
  else if (input.music && "file" in input.music) {
    music = await audioContext.decodeAudioData(input.music.file.slice(0)).catch(() => {
      throw new Error("That music file couldn't be read. Try an MP3 or pick one of Rex's tracks.");
    });
  }

  const destination = audioContext.createMediaStreamDestination();
  const stream = canvas.captureStream(30);
  if (voice || music) destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 5_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  drawReelFrame(ctx, scene, 0);
  recorder.start(250);
  const now = audioContext.currentTime;
  const voiceStart = now + 0.3;
  if (voice) {
    const source = audioContext.createBufferSource();
    source.buffer = voice;
    source.connect(destination);
    source.start(voiceStart);
  }
  if (music && input.music) {
    const levels = musicLevels(input.music.volume, Boolean(voice));
    const gain = audioContext.createGain();
    // Music sits under the voice, then comes back up for the end card.
    gain.gain.setValueAtTime(voice ? levels.underVoice : levels.base, now);
    if (voice) {
      const back = voiceStart + voice.duration + 0.1;
      gain.gain.setValueAtTime(levels.underVoice, back);
      gain.gain.linearRampToValueAtTime(levels.base, back + 0.5);
    }
    gain.gain.setValueAtTime(levels.base, now + Math.max(0.6, total - 1));
    gain.gain.linearRampToValueAtTime(0.0001, now + total);
    const source = audioContext.createBufferSource();
    source.buffer = music;
    source.loop = "file" in input.music;
    source.connect(gain).connect(destination);
    source.start(now);
    source.stop(now + total + 0.1);
  }

  const started = performance.now();
  await new Promise<void>((resolve) => {
    // A timer, not requestAnimationFrame, so drawing carries on if the tab isn't focused.
    const timer = window.setInterval(() => {
      const t = (performance.now() - started) / 1000;
      if (t >= total) {
        window.clearInterval(timer);
        drawReelFrame(ctx, scene, total - 0.01);
        resolve();
        return;
      }
      drawReelFrame(ctx, scene, t);
      input.onProgress?.(t / total);
    }, 1000 / 30);
  });

  recorder.stop();
  await stopped;
  stream.getTracks().forEach((track) => track.stop());
  await audioContext.close();
  input.onProgress?.(1);

  drawReelFrame(ctx, scene, scene.timeline.intro + scene.timeline.perShot * 0.6);
  const poster = await new Promise<Blob | null>((resolve) => canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.86));
  const type = recorder.mimeType || mimeType || "video/webm";
  return { blob: new Blob(chunks, { type }), mimeType: type, extension: type.includes("mp4") ? "mp4" : "webm", seconds: total, poster };
}

/** Plays a mood's music for a few seconds so the seller can hear it before making the reel. */
export async function previewMusic(mood: MusicMood, seconds = 8): Promise<() => void> {
  const buffer = await renderMusic(mood, seconds, 3);
  const context = new AudioContext();
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start();
  const stop = () => {
    try {
      source.stop();
    } catch {
      // Already stopped.
    }
    void context.close();
  };
  source.onended = stop;
  return stop;
}
