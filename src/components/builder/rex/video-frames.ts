"use client";

// Still frames from a video the seller gives Rex, taken in the browser: the AI models read pictures, not video,
// so a few JPEG stills (start, middle, end) go along as reference photos.

const FRAME_POINTS = [0.15, 0.5, 0.85];
const MAX_SIDE = 1280;

export function isVideoFile(file: File) {
  return file.type.startsWith("video/");
}

function once<T extends keyof HTMLVideoElementEventMap>(video: HTMLVideoElement, event: T, ms = 15_000) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("timeout")), ms);
    video.addEventListener(event, () => { window.clearTimeout(timer); resolve(); }, { once: true });
    video.addEventListener("error", () => { window.clearTimeout(timer); reject(new Error("unreadable")); }, { once: true });
  });
}

/** Up to `count` JPEG stills spread through the video. Throws an Error with plain words when it can't be read. */
export async function videoFrames(file: File, count = FRAME_POINTS.length): Promise<File[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await once(video, "loadeddata");
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
    const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth || 1, video.videoHeight || 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((video.videoWidth || 720) * scale));
    canvas.height = Math.max(1, Math.round((video.videoHeight || 1280) * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("unreadable");
    const base = file.name.replace(/\.[^.]+$/, "") || "video";
    const frames: File[] = [];
    for (const [index, point] of FRAME_POINTS.slice(0, count).entries()) {
      video.currentTime = Math.min(duration - 0.05, Math.max(0, duration * point));
      await once(video, "seeked");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
      if (blob) frames.push(new File([blob], `${base}-still-${index + 1}.jpg`, { type: "image/jpeg" }));
    }
    if (!frames.length) throw new Error("unreadable");
    return frames;
  } catch {
    throw new Error("We couldn't read that video. Try an MP4 or WebM, or send a photo instead.");
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
