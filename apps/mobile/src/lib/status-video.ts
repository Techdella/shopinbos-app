import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";
import { api } from "./api";
import { baseType, pickerDurationMs, statusVideoProblem, STATUS_POSTER_MAX_BYTES, type StatusVideoProblem } from "@shared/status-video";

// A video status from the phone (rules: shared/status-video.ts). The picker already keeps it short (30 s) and
// compressed; here it's checked, a poster frame is made from it (expo-video's thumbnail, saved as a JPG with
// expo-image-manipulator), and both go STRAIGHT to Storage with one-time signed URLs from
// POST /api/mobile/status/upload-url: never through the API, because Vercel refuses bodies over ~4.5 MB.

/** What the picker hands back (ImagePicker video assets fit). */
export interface VideoInput {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  /** Milliseconds (expo-image-picker), or seconds on some Android builds. */
  duration?: number | null;
}

export interface UploadedVideo {
  videoUrl: string;
  posterUrl: string | null;
  durationMs: number | null;
}

type Signed = { signedUrl: string; publicUrl: string; contentType: string };

/** The video's type: what the picker says, else from the file name (iPhones record .mov). */
export function videoType(input: Pick<VideoInput, "mimeType" | "fileName" | "uri">) {
  const said = baseType(input.mimeType);
  if (said.startsWith("video/")) return said;
  const name = (input.fileName || input.uri || "").toLowerCase().split("?")[0]!;
  return name.endsWith(".mov") ? "video/quicktime" : "video/mp4";
}

/** Why this picked video can't be posted (the same rule as the server), or null. */
export function pickedVideoProblem(input: VideoInput): StatusVideoProblem | null {
  return statusVideoProblem({ type: videoType(input), size: input.fileSize ?? null, durationMs: pickerDurationMs(input.duration) });
}

/** The file's size on the phone, or null. */
export async function fileBytes(uri: string): Promise<number | null> {
  if (Platform.OS === "web") return null;
  try {
    const fs = await import("expo-file-system");
    const size = new fs.File(uri).size;
    return typeof size === "number" && size > 0 ? size : null;
  } catch {
    return null;
  }
}

/** PUTs a local file to a signed Storage URL, streaming it from disk on a phone; `onProgress` gets 0..1. */
export async function putFile(signedUrl: string, uri: string, type: string, onProgress?: (fraction: number) => void) {
  const headers = { "content-type": type, "x-upsert": "false" };
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", signedUrl);
      for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
      xhr.upload.onprogress = (event) => event.lengthComputable && onProgress?.(event.loaded / event.total);
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(String(xhr.status))));
      xhr.onerror = () => reject(new Error("offline"));
      xhr.send(blob);
    });
    return;
  }
  const fs = await import("expo-file-system/legacy");
  const task = fs.createUploadTask(signedUrl, uri, { httpMethod: "PUT", uploadType: fs.FileSystemUploadType.BINARY_CONTENT, headers }, (progress) => {
    if (progress.totalBytesExpectedToSend > 0) onProgress?.(progress.totalBytesSent / progress.totalBytesExpectedToSend);
  });
  const result = await task.uploadAsync();
  if (!result || result.status < 200 || result.status >= 300) throw new Error(String(result?.status ?? "failed"));
}

const sign = (input: { kind: "video" | "poster"; type: string; size: number; durationMs?: number | null }) =>
  api<Signed>("/api/mobile/status/upload-url", { method: "POST", json: input });

/**
 * A still frame from the video as a small JPG on the phone (expo-video thumbnail → expo-image-manipulator), or null
 * when this build can't make one (the post still works: the viewer shows the video's own first frame).
 */
export async function makePoster(uri: string): Promise<{ uri: string; size: number | null } | null> {
  if (Platform.OS !== "web" && !requireOptionalNativeModule("ExpoImageManipulator")) return null;
  let player: import("expo-video").VideoPlayer | null = null;
  try {
    const { createVideoPlayer } = await import("expo-video");
    const { ImageManipulator, SaveFormat } = await import("expo-image-manipulator");
    player = createVideoPlayer(uri);
    const [thumb] = await player.generateThumbnailsAsync([0.5], { maxWidth: 720, maxHeight: 1280 });
    if (!thumb) return null;
    const image = await ImageManipulator.manipulate(thumb).renderAsync();
    const saved = await image.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
    image.release();
    const size = await fileBytes(saved.uri);
    return size != null && size > STATUS_POSTER_MAX_BYTES ? null : { uri: saved.uri, size };
  } catch {
    return null;
  } finally {
    try {
      player?.release();
    } catch {
      // Already gone.
    }
  }
}

/**
 * Uploads a picked video (and its poster) straight to Storage and returns the URLs for POST /api/mobile/status.
 * Throws an Error with a plain message the screen can show.
 */
export async function uploadStatusVideo(input: VideoInput, onProgress?: (fraction: number) => void, words?: { tooBig: string; tooLong: string; type: string }): Promise<UploadedVideo> {
  const type = videoType(input);
  const size = input.fileSize ?? (await fileBytes(input.uri));
  const durationMs = pickerDurationMs(input.duration);
  const problem = statusVideoProblem({ type, size, durationMs });
  if (problem === "too_big") throw new Error(words?.tooBig ?? "That video is too big (max 25 MB).");
  if (problem === "too_long") throw new Error(words?.tooLong ?? "Videos can be up to 30 seconds.");
  if (problem) throw new Error(words?.type ?? "Use an MP4 or MOV video.");

  // The poster is made first (it's quick), so the video's progress runs to the end on its own.
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
      // A post without a poster still plays.
    }
  }
  return { videoUrl: signed.publicUrl, posterUrl, durationMs };
}
