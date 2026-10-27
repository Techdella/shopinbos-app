"use client";

import { UPLOAD_MAX_BYTES, mediaFileProblem, mediaKindOfType, type MediaAssetView, type MediaKind } from "@shared/media";
import { readyToSend } from "@/lib/media/shrink-image";

// Browser side of the media library (/api/app/media). Used by MediaPicker, MediaLibraryDialog and the Media page.

export type { MediaAssetView };

export interface MediaPage {
  data: MediaAssetView[];
  meta: { page: number; limit: number; total: number; hasMore: boolean };
}

async function readError(response: Response, fallback: string) {
  const json = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return json?.error?.message || fallback;
}

export async function listMyMedia({ q = "", kind = null, page = 1, signal }: { q?: string; kind?: MediaKind | null; page?: number; signal?: AbortSignal }): Promise<MediaPage> {
  const params = new URLSearchParams({ page: String(page) });
  if (q.trim()) params.set("q", q.trim());
  if (kind) params.set("kind", kind);
  const response = await fetch(`/api/app/media?${params}`, { signal, credentials: "same-origin" });
  if (!response.ok) throw new Error(await readError(response, "Couldn't load your media."));
  return (await response.json()) as MediaPage;
}

/** Width and height of a picture file, read in the browser (null for videos or when it can't be read). */
async function measure(file: File): Promise<{ width: number; height: number } | null> {
  if (mediaKindOfType(file.type) !== "image" || typeof createImageBitmap !== "function" || file.type === "image/svg+xml") return null;
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

/** Uploads a file into the person's media library and returns it. Throws an Error with a plain-words message. */
export async function uploadToMyMedia(picked: File, allow: "image" | "any" = "image"): Promise<MediaAssetView> {
  const problem = mediaFileProblem(picked, allow);
  if (problem) throw new Error(problem);
  // Phone photos are shrunk before sending: the server can't take a request over about 4.5 MB.
  const file = await readyToSend(picked);
  if (file.size > UPLOAD_MAX_BYTES) {
    throw new Error(mediaKindOfType(file.type) === "video" ? "That video is over 4 MB. Trim it or paste a link to it instead." : "That picture is over 4 MB even after shrinking. Choose a smaller one.");
  }
  const form = new FormData();
  form.append("file", file);
  if (allow === "image") form.append("only", "image");
  const size = await measure(file);
  if (size) {
    form.append("width", String(size.width));
    form.append("height", String(size.height));
  }
  const response = await postOnce("/api/app/media", form);
  if (!response.ok) throw new Error(await readError(response, "That upload didn't go through. Try again."));
  const json = (await response.json()) as { data: MediaAssetView };
  return json.data;
}

/**
 * A POST that tries once more when the connection drops (a phone switching networks, or the page sent to the
 * background while the photo picker is open), waiting until the page is back on screen first.
 */
async function postOnce(url: string, form: FormData): Promise<Response> {
  try {
    return await fetch(url, { method: "POST", body: form, credentials: "same-origin" });
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    await backOnScreen();
    return fetch(url, { method: "POST", body: form, credentials: "same-origin" });
  }
}

function backOnScreen(): Promise<void> {
  if (typeof document === "undefined" || document.visibilityState === "visible") return new Promise((resolve) => setTimeout(resolve, 1000));
  return new Promise((resolve) => {
    const done = () => {
      document.removeEventListener("visibilitychange", done);
      resolve();
    };
    document.addEventListener("visibilitychange", done);
  });
}

/** Folders /api/upload accepts (see ALLOWED_FOLDERS there). */
export type UploadFolder = "products" | "brand" | "store-banners" | "supplier-logos";

/**
 * Uploads a picture through /api/upload and returns its public URL. Shrinks phone photos first (the server can't take
 * a request over about 4.5 MB; bigger ones are cut off mid-send and show up as "Failed to fetch"). Throws an Error
 * with a plain-words message.
 */
export async function uploadToFolder(picked: File, folder: UploadFolder): Promise<string> {
  const problem = mediaFileProblem(picked, "image");
  if (problem) throw new Error(problem);
  const file = await readyToSend(picked);
  if (file.size > UPLOAD_MAX_BYTES) throw new Error("That picture is over 4 MB even after shrinking. Choose a smaller one.");
  const form = new FormData();
  form.append("file", file);
  form.append("folder", folder);
  const response = await postOnce("/api/upload", form);
  const json = (await response.json().catch(() => null)) as { data?: { publicUrl?: string }; error?: { message?: string } } | null;
  if (!response.ok || !json?.data?.publicUrl) throw new Error(json?.error?.message || "That picture didn't upload. Try again.");
  return json.data.publicUrl;
}

export async function removeFromMyMedia(id: string): Promise<void> {
  const response = await fetch(`/api/app/media/${encodeURIComponent(id)}`, { method: "DELETE", credentials: "same-origin" });
  if (!response.ok) throw new Error(await readError(response, "Couldn't remove that. Try again."));
}

/** Saves a title and / or alt text (null or "" clears one) and returns the updated entry. */
export async function updateMyMedia(id: string, details: { title?: string | null; alt?: string | null }): Promise<MediaAssetView> {
  const response = await fetch(`/api/app/media/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(details),
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error(await readError(response, "Couldn't save that. Try again."));
  const json = (await response.json()) as { data: MediaAssetView };
  return json.data;
}

/** The accept= string for a file input. */
export function acceptFor(allow: "image" | "any") {
  return allow === "image" ? "image/jpeg,image/png,image/webp,image/gif,image/svg+xml" : "image/jpeg,image/png,image/webp,image/gif,image/svg+xml,video/mp4,video/webm,video/ogg";
}

/** Opens the device's file chooser and resolves with the chosen file (or null). */
export function chooseFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    let settled = false;
    const done = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };
    input.addEventListener("change", () => done(input.files?.[0] ?? null));
    input.addEventListener("cancel", () => done(null));
    document.body.appendChild(input);
    input.click();
  });
}

/** Opens the device's file chooser for several files (an empty list when cancelled). */
export function chooseFiles(accept: string): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = true;
    input.style.display = "none";
    let settled = false;
    const done = (files: File[]) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener("change", () => done(Array.from(input.files ?? [])));
    input.addEventListener("cancel", () => done([]));
    document.body.appendChild(input);
    input.click();
  });
}

export function isVideoUrl(url: string) {
  return /\.(mp4|webm|ogv|mov)(\?|#|$)/i.test(url);
}
