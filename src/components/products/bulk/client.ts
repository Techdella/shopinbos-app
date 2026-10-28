"use client";

import { BULK_PHOTO_MAX_SIDE, BULK_UPLOAD_CONCURRENCY, type BulkAsk, type BulkEvent, type BulkGroupSuggestion, type BulkItem, type BulkRole, type BulkSummary } from "@shared/bulk-products";
import { createUploadQueue, newClientKey, type UploadQueue, type UploadTask } from "@shared/bulk-upload-queue";

// The web side of "Add many with Peggy": calls to /api/app/bulk-products (the same handlers as the phone's
// /api/mobile/bulk-products) and the photo upload queue. The queue lives at module level, one per session, so moving
// to another page of the app (client navigation) doesn't stop the uploads; a full reload can't keep the files, so the
// keys still waiting are remembered and the screen says how many to pick again.

export interface BulkSession {
  id: string;
  role: BulkRole;
  status: string;
  thread: BulkEvent[];
  items: BulkItem[];
  summary: BulkSummary;
  ask: BulkAsk;
  groups: BulkGroupSuggestion[];
  ready: number;
  max: number;
}

export interface PublishResult {
  published: Array<{ itemId: string; number: number; productId: string; name: string; url: string | null; status: string; price: number; shortCode: string | null }>;
  failed: Array<{ itemId: string; number: number; error: string }>;
  remaining: number;
  overLimit: number;
  notReady: number;
  limit: { max: number | null; left: number | null } | null;
  session: BulkSession | null;
}

export class BulkError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

const BASE = "/api/app/bulk-products";

async function call<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      credentials: "same-origin",
      ...rest,
      headers: { Accept: "application/json", ...(json !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new BulkError("You're offline. Check your connection.", 0);
  }
  const body = (await response.json().catch(() => null)) as { data?: T; error?: { message?: string; code?: string } } | null;
  if (!response.ok) throw new BulkError(body?.error?.message ?? "Something went wrong. Try again.", response.status, body?.error?.code);
  return body?.data as T;
}

export const bulkApi = {
  current: () => call<BulkSession | null>(""),
  open: () => call<BulkSession>("", { method: "POST" }),
  get: (id: string) => call<BulkSession>(`/${id}`),
  discard: (id: string) => call(`/${id}`, { method: "DELETE" }),
  look: (id: string, more = false) => call<{ drafted: number; pending: number; capped: boolean; session: BulkSession | null }>(`/${id}/look`, { method: "POST", json: { more } }),
  reply: (id: string, text: string) => call<{ usedAi: boolean; session: BulkSession | null }>(`/${id}/reply`, { method: "POST", json: { text } }),
  items: (id: string, body: unknown) => call<BulkSession | null>(`/${id}/items`, { method: "PATCH", json: body }),
  publish: (id: string, live: boolean, ids?: string[]) => call<PublishResult>(`/${id}/publish`, { method: "POST", json: { live, ...(ids ? { ids } : {}) } }),
};

// ─── Photos ───────────────────────────────────────────────────────────────────

/** Makes a photo at most BULK_PHOTO_MAX_SIDE on its longest side, as a JPEG (a 4 MB phone photo becomes ~300 KB). */
export async function shrinkPhoto(file: File): Promise<Blob> {
  if (typeof createImageBitmap !== "function" || !/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, BULK_PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

function uploadOne(sessionId: string, task: WebTask, onProgress: (fraction: number) => void) {
  return new Promise<void>((resolve, reject) => {
    void shrinkPhoto(task.file).then((blob) => {
      const form = new FormData();
      form.append("file", blob, (task.fileName ?? "photo").replace(/\.[a-z0-9]+$/i, "") + (blob.type === "image/jpeg" ? ".jpg" : ""));
      form.append("clientKey", task.clientKey);
      if (task.fileName) form.append("fileName", task.fileName);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${BASE}/${sessionId}/photos`);
      xhr.withCredentials = true;
      xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(event.loaded / event.total);
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) return resolve();
        let message = "We couldn't upload that photo.";
        try {
          message = (JSON.parse(xhr.responseText) as { error?: { message?: string } }).error?.message ?? message;
        } catch {
          // keep the plain message
        }
        reject(new BulkError(message, xhr.status));
      };
      xhr.onerror = () => reject(new BulkError("You're offline. It will try again.", 0));
      xhr.send(form);
    }, reject);
  });
}

export interface WebTask extends UploadTask {
  file: File;
}

const queues = new Map<string, UploadQueue<WebTask>>();
const PENDING_KEY = (id: string) => `shopinbos.bulk.pending.${id}`;

function remember(id: string, queue: UploadQueue<WebTask>) {
  try {
    const left = queue.tasks().filter((task) => task.state !== "done").map((task) => task.clientKey);
    if (left.length) localStorage.setItem(PENDING_KEY(id), JSON.stringify(left));
    else localStorage.removeItem(PENDING_KEY(id));
  } catch {
    // No storage: nothing to warn about after a reload.
  }
}

export function queueFor(sessionId: string) {
  let queue = queues.get(sessionId);
  if (!queue) {
    const made: UploadQueue<WebTask> = createUploadQueue<WebTask>({
      concurrency: BULK_UPLOAD_CONCURRENCY,
      upload: (task, onProgress) => uploadOne(sessionId, task, onProgress),
      // A photo the server refused (wrong type, too big, list full) won't upload on a second try.
      isFinal: (error) => error instanceof BulkError && error.status >= 400 && error.status < 500 && error.status !== 429 && error.status !== 408,
      onChange: () => remember(sessionId, made),
    });
    queue = made;
    queues.set(sessionId, queue);
  }
  return queue;
}

/** Queues picked files (one product each). */
export function addFiles(sessionId: string, files: File[]) {
  const images = files.filter((file) => /^image\//.test(file.type)).slice(0, 300);
  queueFor(sessionId).add(images.map((file) => ({ clientKey: newClientKey("w"), fileName: file.name || null, file, state: "waiting", progress: 0, tries: 0 })));
  return images.length;
}

/** Photos that were still uploading when the page was closed (their files are gone; they must be picked again). */
export function lostUploads(sessionId: string) {
  if (queues.get(sessionId)?.tasks().length) return 0;
  try {
    const keys = JSON.parse(localStorage.getItem(PENDING_KEY(sessionId)) ?? "[]") as string[];
    return Array.isArray(keys) ? keys.length : 0;
  } catch {
    return 0;
  }
}

export function forgetLost(sessionId: string) {
  try {
    localStorage.removeItem(PENDING_KEY(sessionId));
  } catch {
    // nothing to forget
  }
}
