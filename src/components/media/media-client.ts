"use client";

import { mediaFileProblem, mediaKindOfType, type MediaAssetView, type MediaKind } from "@shared/media";

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
export async function uploadToMyMedia(file: File, allow: "image" | "any" = "image"): Promise<MediaAssetView> {
  const problem = mediaFileProblem(file, allow);
  if (problem) throw new Error(problem);
  const form = new FormData();
  form.append("file", file);
  if (allow === "image") form.append("only", "image");
  const size = await measure(file);
  if (size) {
    form.append("width", String(size.width));
    form.append("height", String(size.height));
  }
  const response = await fetch("/api/app/media", { method: "POST", body: form, credentials: "same-origin" });
  if (!response.ok) throw new Error(await readError(response, "That upload didn't go through. Try again."));
  const json = (await response.json()) as { data: MediaAssetView };
  return json.data;
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
