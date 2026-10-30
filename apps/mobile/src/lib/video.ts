import { naira } from "@shared/onboarding";
import { rexApi } from "./rex-jobs";
import { api } from "./api";
import { rexCardProject, type StudioProduct, type VideoConfig, type VideoLanguage, type VideoPurpose, type VideoRow, type VideoScript } from "./video-pure";

// Video studio (web /home/video, src/app/api/app/videos): the seller's video projects, Rex's words and shots.

export const fetchVideos = () => api<VideoRow[]>("/api/app/videos");

export const fetchVideo = (id: string) => api<VideoRow>(`/api/app/videos/${encodeURIComponent(id)}`);

export const createVideo = (body: { purpose: VideoPurpose; productId?: string | null; title?: string; config?: VideoConfig }) =>
  api<VideoRow>("/api/app/videos", { method: "POST", json: body });

/** Autosave (config), rename (title), and publish ({ published: { kind } }) for one project. */
export const patchVideo = (id: string, body: { title?: string; productId?: string | null; config?: VideoConfig; published?: { kind: "product" | "ad" | "social"; id?: string } }) =>
  api<VideoRow>(`/api/app/videos/${encodeURIComponent(id)}`, { method: "PATCH", json: body });

export const deleteVideo = (id: string) => api<{ id: string }>(`/api/app/videos/${encodeURIComponent(id)}`, { method: "DELETE" });

interface ProductRow {
  id: string;
  name: string;
  images: string[] | null;
  retailPrice: number | string | null;
  description?: string | null;
  status?: string | null;
}

/** The shop's products with photos (what the web studio's "From a product" offers), best sellers first. */
export async function fetchStudioProducts(): Promise<StudioProduct[]> {
  const rows = await api<ProductRow[]>("/api/store/products?sort=sales&limit=100");
  return rows
    .filter((row) => row.status !== "archived" && row.images?.length)
    .map((row) => ({ id: row.id, name: row.name, images: (row.images ?? []).slice(0, 6), priceText: naira(Number(row.retailPrice) || 0), description: row.description ?? "", retailPrice: Number(row.retailPrice) || 0 }));
}

/** Rex (or Peggy offline) writes the captions, voiceover and last screen. `drafted` is false for a starter script. */
export const writeVideoScript = (body: { name: string; price: string; description: string; language: VideoLanguage; photos: number }) =>
  rexApi<VideoScript & { drafted?: boolean }>("/api/ai/video-script", body, "video-script");

/** "Make shots with Rex": product photos cleaned up for the reel (cut out, studio backdrop or brand ad shot). */
export const makeReelShots = (body: { photos: string[]; look: string; product?: string }) =>
  rexApi<{ shots: { source: string; url: string | null; error?: string }[]; creditsNeeded: boolean; message?: string }>("/api/ai/reel-shots", body, "reel-shots");

/** A Rex Studio video card becomes a draft with his words; returns its id. */
export async function startVideoFromRex(card: Parameters<typeof rexCardProject>[0]) {
  const project = await createVideo(rexCardProject(card));
  return project.id;
}
