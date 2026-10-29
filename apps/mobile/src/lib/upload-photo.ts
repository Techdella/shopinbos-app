import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";
import { ApiError, api, apiBody } from "./api";
import { tNow } from "./app-locale";
import {
  PHOTO_BUDGET_BYTES,
  PHOTO_MAX_SIDE,
  PHOTO_QUALITY,
  PHOTO_RETRY_QUALITY,
  PHOTO_RETRY_SIDE,
  UPLOAD_MAX_BYTES,
  photoFileName,
  photoMime,
  resizeTarget,
  retryDelayMs,
  shouldRetryUpload,
  shouldShrink,
  shrunkType,
  uploadProblem,
} from "./upload-photo-pure";

// Every photo the phone sends (product photos from the camera or gallery, Snap photos, Add many, Rex, logos, banners,
// supplier and delivery photos) is made ready here first: shrunk on the phone to at most 1600 px on the long side
// (expo-image-manipulator), so it fits under Vercel's ~4.5 MB request limit and sends quickly on a slow network.
// Then it's sent as a { uri, name, type } file part, tried again when the network drops, and a failure says what
// happened: offline, too big, or the server said no. Pure rules: upload-photo-pure.ts.

/** What the picker hands back (ImagePicker assets fit). */
export interface PhotoInput {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  width?: number | null;
  height?: number | null;
  fileSize?: number | null;
}

/** A photo ready to send: the file part for FormData and its size (null when unknown). */
export interface ReadyPhoto {
  uri: string;
  name: string;
  type: string;
  bytes: number | null;
}

type Manipulator = typeof import("expo-image-manipulator");
let manipulator: Promise<Manipulator | null> | null = null;

/** expo-image-manipulator, or null in a build without its native module (then photos go as they are). */
function loadManipulator(): Promise<Manipulator | null> {
  if (!manipulator) {
    manipulator = Platform.OS === "web" || !requireOptionalNativeModule("ExpoImageManipulator") ? Promise.resolve(null) : import("expo-image-manipulator").catch(() => null);
  }
  return manipulator;
}

/** The file's size on the phone, or null. */
async function fileBytes(uri: string): Promise<number | null> {
  if (Platform.OS === "web") return null;
  try {
    const fs = await import("expo-file-system");
    const size = new fs.File(uri).size;
    return typeof size === "number" && size > 0 ? size : null;
  } catch {
    return null;
  }
}

/** Redraws the picture at most `maxSide` px on the long side; null when it can't. */
async function redraw(tools: Manipulator, uri: string, size: { width?: number | null; height?: number | null }, maxSide: number, quality: number, type: "image/png" | "image/jpeg") {
  try {
    let width = Number(size.width) || 0;
    let height = Number(size.height) || 0;
    const first = tools.ImageManipulator.manipulate(uri);
    if (!width || !height) {
      // Unknown size: read it first.
      const probe = await first.renderAsync();
      width = probe.width;
      height = probe.height;
      probe.release();
    }
    const target = resizeTarget(width, height, maxSide);
    if (target) first.resize({ width: target.width, height: target.height });
    const image = await first.renderAsync();
    const saved = await image.saveAsync({ compress: quality, format: type === "image/png" ? tools.SaveFormat.PNG : tools.SaveFormat.JPEG });
    image.release();
    first.release();
    return { uri: saved.uri, bytes: await fileBytes(saved.uri) };
  } catch {
    return null;
  }
}

const tooBig = () => new ApiError(tNow("m_ui")("error.tooBig"), 413, "TOO_LARGE");

/**
 * Makes one photo ready to send. `base` names it when the picker gave no name; `keepTransparency` keeps a PNG logo
 * see-through. Throws "That file is too big" when even the shrunk photo can't be sent.
 */
export async function preparePhoto(photo: PhotoInput, options: { base?: string; keepTransparency?: boolean; maxSide?: number } = {}): Promise<ReadyPhoto> {
  const type = photoMime(photo.mimeType, photo.uri, photo.fileName);
  const maxSide = options.maxSide ?? PHOTO_MAX_SIDE;
  let ready: ReadyPhoto = { uri: photo.uri, type, name: photoFileName(photo.fileName, type, options.base), bytes: Number(photo.fileSize) > 0 ? Number(photo.fileSize) : await fileBytes(photo.uri) };
  const tools = shouldShrink({ type, width: photo.width, height: photo.height, bytes: ready.bytes }, maxSide) ? await loadManipulator() : null;
  if (tools) {
    const outType = shrunkType(type, Boolean(options.keepTransparency));
    let shrunk = await redraw(tools, photo.uri, photo, maxSide, PHOTO_QUALITY, outType);
    if (shrunk && shrunk.bytes && shrunk.bytes > PHOTO_BUDGET_BYTES) shrunk = (await redraw(tools, photo.uri, photo, Math.min(maxSide, PHOTO_RETRY_SIDE), PHOTO_RETRY_QUALITY, "image/jpeg")) ?? shrunk;
    // Only used when it helped (a small PNG can grow as a JPEG).
    if (shrunk && (!ready.bytes || !shrunk.bytes || shrunk.bytes < ready.bytes || type === "image/heic" || type === "image/heif")) {
      const sentType = shrunk.uri.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
      ready = { uri: shrunk.uri, type: sentType, name: photoFileName(photo.fileName, sentType, options.base), bytes: shrunk.bytes };
    }
  }
  if (ready.bytes && ready.bytes > UPLOAD_MAX_BYTES) throw tooBig();
  return ready;
}

/**
 * A smaller JPEG of the photo as base64 (for routes that take a data URI, e.g. the identity checks' selfie and ID
 * photo), or null when this build can't redraw pictures. Used when the camera's own base64 is too big.
 */
export async function shrunkBase64(photo: PhotoInput, maxSide = 1280, quality = 0.6): Promise<string | null> {
  const tools = await loadManipulator();
  if (!tools) return null;
  try {
    const context = tools.ImageManipulator.manipulate(photo.uri);
    let width = Number(photo.width) || 0;
    let height = Number(photo.height) || 0;
    if (!width || !height) {
      const probe = await context.renderAsync();
      width = probe.width;
      height = probe.height;
      probe.release();
    }
    const target = resizeTarget(width, height, maxSide);
    if (target) context.resize({ width: target.width, height: target.height });
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ compress: quality, format: tools.SaveFormat.JPEG, base64: true });
    image.release();
    context.release();
    return saved.base64 ?? null;
  } catch {
    return null;
  }
}

/** The FormData file part (React Native's FormData takes { uri, name, type }). */
export const filePart = (photo: ReadyPhoto) => ({ uri: photo.uri, name: photo.name, type: photo.type }) as unknown as Blob;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Turns a failed send into the right words: a cut connection on a big body is "too big", not "offline". */
function explain(error: unknown, bytes: number | null): unknown {
  if (!(error instanceof ApiError)) return error;
  return uploadProblem(error.status, bytes) === "tooBig" ? tooBig() : error;
}

/**
 * Sends a multipart form (built fresh for each try), trying again when the network drops or the server is busy.
 * `bytes` is what the photos weigh together. `envelope: "body"` reads routes that don't answer `{ data }`.
 */
export async function sendPhotoForm<T>(path: string, build: () => FormData, bytes: number | null, envelope: "data" | "body" = "data"): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const init = { method: "POST", body: build() };
      return envelope === "body" ? await apiBody<T>(path, init) : await api<T>(path, init);
    } catch (error) {
      const status = error instanceof ApiError ? error.status : -1;
      if (status < 0 || !shouldRetryUpload(status, attempt, bytes)) throw explain(error, bytes);
      await wait(retryDelayMs(attempt + 1));
    }
  }
}

/** One photo: made ready, then sent with the extra form fields. */
export async function uploadOnePhoto<T>(path: string, photo: PhotoInput, fields: Record<string, string> = {}, options: { base?: string; keepTransparency?: boolean; maxSide?: number; field?: string; envelope?: "data" | "body" } = {}): Promise<T> {
  const ready = await preparePhoto(photo, options);
  return sendPhotoForm<T>(
    path,
    () => {
      const form = new FormData();
      for (const [key, value] of Object.entries(fields)) form.append(key, value);
      form.append(options.field ?? "file", filePart(ready));
      return form;
    },
    ready.bytes,
    options.envelope,
  );
}
