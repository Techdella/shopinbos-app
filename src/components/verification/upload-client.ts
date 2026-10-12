import type { DocType, VerificationDoc } from "@shared/verification-docs";
import { verificationFileHref } from "@/lib/security/private-files";

export type VerificationUploadEndpoint = "/api/supplier/verification/upload" | "/api/logistics/verification/upload";

interface UploadResponse {
  success?: boolean;
  doc?: VerificationDoc;
  error?: string | { message?: string };
}

function errorMessage(body: UploadResponse | null, status: number): string {
  const fromBody = typeof body?.error === "string" ? body.error : body?.error?.message;
  if (fromBody) return fromBody;
  if (status === 413) return "That file is too large for the server. Try a smaller file.";
  if (status === 401 || status === 403) return "Your session has ended. Sign in again and retry.";
  if (status === 0) return "Upload failed. Check your connection and try again.";
  return "Upload failed. Please try again.";
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
        reject(new Error(errorMessage(body, xhr.status)));
      }
    };
    xhr.onerror = () => reject(new Error(errorMessage(null, 0)));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    xhr.send(form);
  });
}

export async function deleteVerificationFile(endpoint: VerificationUploadEndpoint, docId: string): Promise<void> {
  const response = await fetch(endpoint, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ docId }),
  }).catch(() => null);
  const body = (await response?.json().catch(() => null)) as UploadResponse | null;
  if (!response?.ok || !body?.success) throw new Error(errorMessage(body, response?.status ?? 0).replace("Upload", "Remove"));
}

/** Opens a stored document through the signed-link route (checks the viewer owns it or is an admin). */
export function docFileUrl(filePath: string): string {
  if (filePath.startsWith("http")) return filePath;
  return verificationFileHref(filePath);
}
