import type { DocType, VerificationDoc } from "@shared/verification-docs";
import { verificationFileHref } from "@/lib/security/private-files";
import type { TFunction } from "@shared/i18n";

/** Optional translate function (any page's t): the messages live in the "verification" namespace. */
type Translate = Pick<TFunction, "dynamic">;

export type VerificationUploadEndpoint = "/api/supplier/verification/upload" | "/api/logistics/verification/upload";

interface UploadResponse {
  success?: boolean;
  doc?: VerificationDoc;
  error?: string | { message?: string };
}

function errorMessage(body: UploadResponse | null, status: number, t?: Translate, verb: "upload" | "remove" = "upload"): string {
  const fromBody = typeof body?.error === "string" ? body.error : body?.error?.message;
  if (fromBody) return fromBody;
  const say = (key: string, english: string) => (t ? t.dynamic(key, english) : english);
  if (status === 413) return say("upload.tooLarge", "That file is too large for the server. Try a smaller file.");
  if (status === 401 || status === 403) return say("upload.sessionEnded", "Your session has ended. Sign in again and retry.");
  if (verb === "remove") {
    if (status === 0) return say("upload.removeFailedConnection", "Remove failed. Check your connection and try again.");
    return say("upload.removeFailed", "Remove failed. Please try again.");
  }
  if (status === 0) return say("upload.failedConnection", "Upload failed. Check your connection and try again.");
  return say("upload.failed", "Upload failed. Please try again.");
}

/**
 * Sends one verification document to the upload route (which stores it in Supabase storage and
 * records it on the account). Uses XHR rather than fetch so we can report upload progress.
 * Resolves with the record the server saved; rejects with a readable message.
 */
export function uploadVerificationFile(
  endpoint: VerificationUploadEndpoint,
  docType: DocType,
  file: File,
  onProgress?: (percent: number) => void,
  t?: Translate,
): Promise<VerificationDoc> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("docType", docType);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint);
    xhr.responseType = "text";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      let body: UploadResponse | null = null;
      try {
        body = JSON.parse(xhr.responseText) as UploadResponse;
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && body?.success && body.doc?.filePath) {
        onProgress?.(100);
        resolve(body.doc);
      } else {
        reject(new Error(errorMessage(body, xhr.status, t)));
      }
    };
    xhr.onerror = () => reject(new Error(errorMessage(null, 0, t)));
    xhr.onabort = () => reject(new Error(t ? t.dynamic("upload.cancelled", "Upload cancelled.") : "Upload cancelled."));
    xhr.send(form);
  });
}

export async function deleteVerificationFile(endpoint: VerificationUploadEndpoint, docId: string, t?: Translate): Promise<void> {
  const response = await fetch(endpoint, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ docId }),
  }).catch(() => null);
  const body = (await response?.json().catch(() => null)) as UploadResponse | null;
  if (!response?.ok || !body?.success) throw new Error(errorMessage(body, response?.status ?? 0, t, "remove"));
}

/** Opens a stored document through the signed-link route (checks the viewer owns it or is an admin). */
export function docFileUrl(filePath: string): string {
  if (filePath.startsWith("http")) return filePath;
  return verificationFileHref(filePath);
}
