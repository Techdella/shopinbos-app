import "server-only";
import { toFile } from "openai";
import { getOpenAIClient, OPENAI_IMAGE_MODEL } from "@/lib/ai/client";
import { uploadFileServer } from "@/lib/supabase/storage.server";

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
  return (await uploadFileServer("brand", blob, path)).publicUrl;
}

export async function generateImage({
  prompt,
  size = "1024x1024",
  transparent = false,
  path,
}: {
  prompt: string;
  size?: ImageSize;
  transparent?: boolean;
  /** Storage path without extension, e.g. `generated/<userId>/<timestamp>`. */
  path: string;
}): Promise<string> {
  const openai = getOpenAIClient();
  if (!openai) throw new ImageUnavailableError("Image generation needs an OpenAI key (OPENAI_API_KEY).");
  const response = await openai.images.generate({
    model: OPENAI_IMAGE_MODEL,
    prompt,
    n: 1,
    size,
    output_format: "webp",
    ...(transparent ? { background: "transparent" as const } : {}),
  });
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image came back");
  return store(b64, `${path}.webp`);
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
  path,
}: {
  sourceUrl: string;
  prompt: string;
  transparent?: boolean;
  path: string;
}): Promise<string> {
  const openai = getOpenAIClient();
  if (!openai) throw new ImageUnavailableError("Image editing needs an OpenAI key (OPENAI_API_KEY).");
  if (!isOwnImageUrl(sourceUrl)) throw new Error("Upload the photo to your shop first, then edit it.");
  const source = await fetch(sourceUrl);
  if (!source.ok) throw new Error("Couldn't load that photo");
  const type = source.headers.get("content-type")?.split(";")[0] || "image/png";
  if (!/^image\/(png|jpeg|webp)$/.test(type)) throw new Error("Use a PNG, JPEG or WebP photo");
  const bytes = Buffer.from(await source.arrayBuffer());
  if (bytes.byteLength > 20 * 1024 * 1024) throw new Error("That photo is too large (20 MB max)");
  const response = await openai.images.edit({
    model: OPENAI_IMAGE_MODEL,
    image: await toFile(bytes, `source.${type.split("/")[1]}`, { type }),
    prompt,
    size: "1024x1024",
    output_format: "webp",
    ...(transparent ? { background: "transparent" as const } : {}),
  });
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
