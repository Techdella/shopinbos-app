import { api, appHeaders } from "./api";
import { fileBytes, makePoster, putFile, videoType, type VideoInput } from "./status-video";
import { pickerDurationMs, productVideoProblem, type OwnerKind } from "@shared/product-videos";

// Product videos, "Post to Plug" (pilot feature post_to_plug; rules in shared/product-videos.ts). The same API as the
// web's Videos section: GET/POST /api/app/product-videos, PATCH/DELETE /api/app/product-videos/[id]. A picked video
// (≤ 60 s, ≤ 50 MB) and its poster frame go STRAIGHT to Storage with one-time signed URLs from
// POST /api/app/product-videos/upload-url, like status videos (lib/status-video.ts): never through the API.
// Every call says which app is asking (X-App-Platform), because the server checks post_to_plug for this app.

export type ProductVideo = {
  id: string;
  productId: string;
  videoUrl: string;
  posterUrl: string | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  caption: string;
  showOnDiscover: boolean;
  status: "active" | "hidden" | "removed";
  views: number;
};
export type RexReel = { id: string; title: string; videoUrl: string; posterUrl: string | null; seconds: number | null };
export type ProductVideos = { videos: ProductVideo[]; rex: RexReel[]; showOnDiscoverDefault: boolean };

const headers = () => appHeaders();

export function fetchProductVideos(productId: string) {
  return api<ProductVideos>(`/api/app/product-videos?productId=${encodeURIComponent(productId)}`, { headers: headers() });
}

export function updateProductVideo(id: string, patch: { caption?: string; showOnDiscover?: boolean; status?: "active" | "hidden" }) {
  return api<ProductVideo>(`/api/app/product-videos/${encodeURIComponent(id)}`, { method: "PATCH", json: patch, headers: headers() });
}

export function removeProductVideo(id: string) {
  return api<{ removed: true }>(`/api/app/product-videos/${encodeURIComponent(id)}`, { method: "DELETE", headers: headers() });
}

export function postRexVideo(productId: string, rexProjectId: string, extra: { caption: string; showOnDiscover: boolean }) {
  return api<ProductVideo>("/api/app/product-videos", { method: "POST", json: { productId, rexProjectId, ...extra }, headers: headers() });
}

/** Why this picked video can't be used (the server's rule), or null. */
export function pickedProductVideoProblem(input: VideoInput) {
  return productVideoProblem({ type: videoType(input), size: input.fileSize ?? null, durationMs: pickerDurationMs(input.duration) });
}

type Signed = { signedUrl: string; publicUrl: string; contentType: string };
const sign = (input: { kind: "video" | "poster"; type: string; size: number; durationMs?: number | null }) =>
  api<Signed>("/api/app/product-videos/upload-url", { method: "POST", json: input, headers: headers() });

/**
 * Uploads a picked video (and a poster frame) straight to Storage, then saves it on the product. Throws an Error with
 * a message the screen can show (the server's words, or `words`).
 */
export async function postProductVideo(
  productId: string,
  input: VideoInput & { width?: number | null; height?: number | null },
  extra: { caption: string; showOnDiscover: boolean },
  onProgress?: (fraction: number) => void,
  words?: { tooBig: string; tooLong: string; type: string },
): Promise<ProductVideo> {
  const type = videoType(input);
  const size = input.fileSize ?? (await fileBytes(input.uri));
  const durationMs = pickerDurationMs(input.duration);
  const problem = productVideoProblem({ type, size, durationMs });
  if (problem === "too_big") throw new Error(words?.tooBig ?? "That video is too big (max 50 MB).");
  if (problem === "too_long") throw new Error(words?.tooLong ?? "Product videos can be up to 60 seconds.");
  if (problem) throw new Error(words?.type ?? "Use an MP4 or MOV video.");

  const poster = await makePoster(input.uri);
  const signed = await sign({ kind: "video", type, size: size ?? 1, durationMs });
  await putFile(signed.signedUrl, input.uri, signed.contentType, onProgress);
  let posterUrl: string | null = null;
  if (poster) {
    try {
      const target = await sign({ kind: "poster", type: "image/jpeg", size: poster.size ?? 1 });
      await putFile(target.signedUrl, poster.uri, "image/jpeg");
      posterUrl = target.publicUrl;
    } catch {
      // Without a poster the player shows the video's first frame.
    }
  }
  return api<ProductVideo>("/api/app/product-videos", {
    method: "POST",
    json: { productId, videoUrl: signed.publicUrl, posterUrl, durationMs, width: input.width ?? null, height: input.height ?? null, ...extra },
    headers: headers(),
  });
}

export type { OwnerKind, VideoInput };
