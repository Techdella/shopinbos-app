import { API_URL, ApiError, api, authHeader, phoneMessage } from "./api";
import { tNow } from "./app-locale";
import { BULK_UPLOAD_CONCURRENCY, type BulkAsk, type BulkEvent, type BulkGroupSuggestion, type BulkItem, type BulkRole, type BulkSummary } from "@shared/bulk-products";
import { createUploadQueue, newClientKey, type UploadQueue, type UploadTask } from "@shared/bulk-upload-queue";
import { filePart, preparePhoto } from "./upload-photo";
import { uploadProblem } from "./upload-photo-pure";

// "Add many with Peggy" on the phone (app/bulk-add.tsx): the calls to /api/mobile/bulk-products and the photo upload
// queue. The queue lives here, at module level, one per session: leaving the screen doesn't stop it, and the photos
// still waiting are kept on the phone, so opening the screen again (even after the app was closed) carries on.
// Photos are shrunk on the phone before sending (lib/upload-photo.ts) and resized again for the AI on the server
// (src/lib/products/bulk/vision.server.ts).

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

const BASE = "/api/mobile/bulk-products";

export const bulkApi = {
  current: () => api<BulkSession | null>(BASE),
  open: () => api<BulkSession>(BASE, { method: "POST" }),
  get: (id: string) => api<BulkSession>(`${BASE}/${id}`),
  discard: (id: string) => api(`${BASE}/${id}`, { method: "DELETE" }),
  look: (id: string, more = false) => api<{ drafted: number; pending: number; capped: boolean; session: BulkSession | null }>(`${BASE}/${id}/look`, { method: "POST", json: { more } }),
  reply: (id: string, text: string) => api<{ usedAi: boolean; session: BulkSession | null }>(`${BASE}/${id}/reply`, { method: "POST", json: { text } }),
  items: (id: string, body: unknown) => api<BulkSession | null>(`${BASE}/${id}/items`, { method: "PATCH", json: body }),
  publish: (id: string, live: boolean, ids?: string[]) => api<PublishResult>(`${BASE}/${id}/publish`, { method: "POST", json: { live, ...(ids ? { ids } : {}) } }),
};

export interface PhoneTask extends UploadTask {
  uri: string;
  mimeType: string;
}

async function uploadOne(sessionId: string, task: PhoneTask, onProgress: (fraction: number) => void) {
  const headers = await authHeader();
  // Shrunk on the phone first (a camera photo can be over the ~4.5 MB upload limit); the original name is kept.
  const ready = await preparePhoto({ uri: task.uri, mimeType: task.mimeType, fileName: task.fileName }, { base: "photo" });
  await new Promise<void>((resolve, reject) => {
    const form = new FormData();
    form.append("file", filePart(ready));
    form.append("clientKey", task.clientKey);
    if (task.fileName) form.append("fileName", task.fileName);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}${BASE}/${sessionId}/photos`);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(event.loaded / event.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let error: { message?: string; code?: string } | undefined;
      try {
        error = (JSON.parse(xhr.responseText) as { error?: { message?: string; code?: string } }).error;
      } catch {
        // a plain message by status
      }
      reject(new ApiError(phoneMessage(error?.message, xhr.status, error?.code), xhr.status, error?.code));
    };
    // No answer: offline, unless the body was too big to be taken (then it's final, not retried).
    xhr.onerror = () => reject(uploadProblem(0, ready.bytes) === "tooBig" ? new ApiError(tNow("m_ui")("error.tooBig"), 413) : new ApiError(tNow("m_ui")("error.offline"), 0));
    xhr.send(form);
  });
}

const queues = new Map<string, UploadQueue<PhoneTask>>();
const KEY = (id: string) => `shopinbos.bulk.queue.${id}`;

type Saved = Pick<PhoneTask, "clientKey" | "uri" | "fileName" | "mimeType">;

function save(sessionId: string, queue: UploadQueue<PhoneTask>) {
  try {
    const left: Saved[] = queue.tasks().filter((task) => task.state !== "done").map(({ clientKey, uri, fileName, mimeType }) => ({ clientKey, uri, fileName, mimeType }));
    if (left.length) localStorage.setItem(KEY(sessionId), JSON.stringify(left));
    else localStorage.removeItem(KEY(sessionId));
  } catch {
    // No storage: the uploads still finish while the app is open.
  }
}

export function queueFor(sessionId: string) {
  let queue = queues.get(sessionId);
  if (!queue) {
    const made: UploadQueue<PhoneTask> = createUploadQueue<PhoneTask>({
      concurrency: BULK_UPLOAD_CONCURRENCY,
      upload: (task, onProgress) => uploadOne(sessionId, task, onProgress),
      isFinal: (error) => error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 429 && error.status !== 408,
      onChange: () => save(sessionId, made),
    });
    queue = made;
    queues.set(sessionId, queue);
    // Photos still waiting from last time (the app was closed): carry on with them.
    try {
      const saved = JSON.parse(localStorage.getItem(KEY(sessionId)) ?? "[]") as Saved[];
      if (Array.isArray(saved) && saved.length) made.add(saved.map((task) => ({ ...task, state: "waiting", progress: 0, tries: 0 })));
    } catch {
      // nothing saved
    }
  }
  return queue;
}

export function addPhotos(sessionId: string, photos: Array<{ uri: string; fileName?: string | null; mimeType?: string | null }>) {
  queueFor(sessionId).add(photos.map((photo) => ({ clientKey: newClientKey("m"), uri: photo.uri, fileName: photo.fileName ?? null, mimeType: photo.mimeType ?? "image/jpeg", state: "waiting", progress: 0, tries: 0 })));
}
