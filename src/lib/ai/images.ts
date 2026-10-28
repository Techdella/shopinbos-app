import "server-only";
import { toFile } from "openai";
import { getOpenAIClient, withImageModel } from "@/lib/ai/client";
import { uploadFileServer } from "@/lib/supabase/storage.server";
import { recordMedia } from "@/lib/media/library.server";
import { aiImageOwner } from "@shared/media";

// Image generation and editing for Rex (products, logos, banners, hero images). OpenAI image models only;
// results are stored in Supabase so pages keep working after OpenAI's temporary URLs expire.

export const IMAGE_SIZES = ["1024x1024", "1536x1024", "1024x1536"] as const;
export type ImageSize = (typeof IMAGE_SIZES)[number];

/** Old callers asked for DALL·E 3 sizes; map them to the closest supported shape. */
export function normaliseImageSize(size: string | undefined): ImageSize {
  if (size === "1792x1024" || size === "1536x1024") return "1536x1024";
  if (size === "1024x1792" || size === "1024x1536") return "1024x1536";
  return "1024x1024";
}

export class ImageUnavailableError extends Error {}

async function store(b64: string, path: string) {
  const blob = new Blob([Buffer.from(b64, "base64")], { type: "image/webp" });
  const stored = await uploadFileServer("brand", blob, path);
  // Rex's pictures and logos join the owner's media library (paths are generated|enhanced|logos|banners/<userId>/…).
  const owner = aiImageOwner(path);
  if (owner) await recordMedia({ userId: owner, url: stored.publicUrl, path: stored.path, kind: "image", bytes: blob.size, source: "ai" });
  return stored.publicUrl;
}

export async function generateImage({
  prompt,
  size = "1024x1024",
  transparent = false,
  references = [],
  path,
}: {
  prompt: string;
  size?: ImageSize;
  transparent?: boolean;
  /**
   * Pictures to work from (the brand logo first, then the seller's photos or video stills), from loadReferences.
   * With any, the model draws from them (images.edit) instead of from words alone.
   */
  references?: ReferenceImage[];
  /** Storage path without extension, e.g. `generated/<userId>/<timestamp>`. */
  path: string;
}): Promise<string> {
  const openai = getOpenAIClient();
  if (!openai) throw new ImageUnavailableError("Image generation needs an OpenAI key (OPENAI_API_KEY).");
  const sources = references.slice(0, MAX_REFERENCES).map((ref) => ref.file);
  const response = await withImageModel((model) => sources.length
    ? openai.images.edit({
        model,
        image: sources,
        prompt,
        n: 1,
        size,
        input_fidelity: "high",
        output_format: "webp",
        ...(transparent ? { background: "transparent" as const } : {}),
      })
    : openai.images.generate({
        model,
        prompt,
        n: 1,
        size,
        output_format: "webp",
        ...(transparent ? { background: "transparent" as const } : {}),
      }));
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image came back");
  return store(b64, `${path}.webp`);
}

/** Most reference pictures sent with one request (logo plus a few photos). */
export const MAX_REFERENCES = 5;

export interface ReferenceImage {
  url: string;
  file: Awaited<ReturnType<typeof toFile>>;
}

/**
 * Loads reference pictures, keeping only the ones the image model can use (PNG, JPEG or WebP in our own
 * storage; an SVG logo or a missing file is skipped), in the order given.
 */
export async function loadReferences(urls: string[]): Promise<ReferenceImage[]> {
  const unique = Array.from(new Set(urls.filter(Boolean))).slice(0, MAX_REFERENCES);
  const files = await Promise.all(unique.map((url, index) => loadSourceImage(url, `reference-${index}`).catch(() => null)));
  return unique.flatMap((url, index) => (files[index] ? [{ url, file: files[index]! }] : []));
}

/** A PNG, JPEG or WebP from our own storage, ready to hand to the image model. */
async function loadSourceImage(url: string, name: string) {
  if (!isOwnImageUrl(url)) throw new Error("Upload the photo to your shop first, then edit it.");
  const source = await fetch(url);
  if (!source.ok) throw new Error("Couldn't load that photo");
  const type = source.headers.get("content-type")?.split(";")[0] || "image/png";
  if (!/^image\/(png|jpeg|webp)$/.test(type)) throw new Error("Use a PNG, JPEG or WebP photo");
  const bytes = Buffer.from(await source.arrayBuffer());
  if (bytes.byteLength > 20 * 1024 * 1024) throw new Error("That photo is too large (20 MB max)");
  return toFile(bytes, `${name}.${type.split("/")[1]}`, { type });
}

/**
 * Hosts we fetch source images from: our own Supabase storage only (no arbitrary URLs from the server). Once
 * the project URL is configured, other Supabase projects (anyone can make one) don't count.
 */
export function isOwnImageUrl(url: string) {
  try {
    const target = new URL(url);
    const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host : null;
    if (target.protocol !== "https:") return false;
    return supabase ? target.host === supabase && target.pathname.startsWith("/storage/v1/") : target.host.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

/** Edits an existing image (enhance, remove background, change backdrop) and stores the result. */
export async function editImage({
  sourceUrl,
  prompt,
  transparent = false,
  size = "1024x1024",
  path,
}: {
  sourceUrl: string;
  prompt: string;
  transparent?: boolean;
  size?: ImageSize;
  path: string;
}): Promise<string> {
  const openai = getOpenAIClient();
  if (!openai) throw new ImageUnavailableError("Image editing needs an OpenAI key (OPENAI_API_KEY).");
  const image = await loadSourceImage(sourceUrl, "source");
  const response = await withImageModel((model) => openai.images.edit({
    model,
    image,
    prompt,
    size,
    output_format: "webp",
    ...(transparent ? { background: "transparent" as const } : {}),
  }));
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image came back");
  return store(b64, `${path}.webp`);
}

export const EDIT_PROMPTS = {
  enhance: "Improve this product photo: better lighting, sharper detail, true-to-life colour, clean professional look. Keep the product exactly the same — same shape, colour, text and logo.",
  remove_background: "Remove the background completely, leaving only the product with clean edges. Keep the product exactly the same.",
  white_background: "Place the product on a clean pure white studio background with a soft natural shadow. Keep the product exactly the same.",
  lifestyle: "Place the product in a tasteful, bright lifestyle scene that suits it, as if photographed for a Nigerian online boutique. Keep the product exactly the same.",
} as const;
export type EditKind = keyof typeof EDIT_PROMPTS;
