import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { aiConfigured, getOpenAIClient } from "@/lib/ai/client";
import { loadSellerBrandContext } from "@/lib/ai/brand-context.server";
import { makeBrandImage } from "@/lib/ai/brand-image.server";
import { creditBalance } from "@/lib/ai/credits.server";
import { EDIT_PROMPTS, editImage, ImageUnavailableError, isOwnImageUrl, type ImageSize } from "@/lib/ai/images";
import { rexPendingBody, runRexJob } from "@/lib/ai/rex-jobs.server";
import { uploadFileServer } from "@/lib/supabase/storage.server";
import { brightenParams, rexPhotoPrompt } from "@shared/store-editor";
import { overLimit, readJson } from "../../banner/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

// The phone store editor's photo tools (design SE-05 "Change photo", SE-06 "Frame your photo"). Each answers with a
// NEW picture URL and never changes the old one, so the phone's Undo (and starting again from the original) always
// works; nothing is saved here: the phone puts the URL in the draft like any picked photo.
//
//   POST { action: "brighten", url, level: 1-3 }  → { url }
//        Brighter, with a little more contrast and colour (sharp, on our server; free). Always made from the photo
//        the phone sends, which is the original it picked, so steps never stack up.
//   POST { action: "brightenPreview", url, level: 1-3 } → { preview: "data:image/jpeg;base64,…" }
//        The crop screen's true preview of Brighten before Done: the same sharp steps on a small copy (640 px), sent
//        back inline and never stored. Free; the phone asks once per level, a moment after the last tap.
//   POST { action: "cutout", url, clientKey? }    → { url, creditsLeft }
//        Remove background: OpenAI's image edit (the same gpt-image model and remove_background prompt as Rex's
//        tool and /api/ai/enhance-image) with a transparent background. One picture use, priced as bg_remove.
//   POST { action: "rex", label, words?, ask?, shape?, clientKey? } → { url, creditsLeft }
//        "Make with Rex": one picture for the selected spot, from the section and the shop (makeBrandImage: the
//        seller's colours and feel), plus what the seller typed. One picture use ("photo"); no banner words.
// The two Rex ones are Rex jobs (runRexJob with the phone's clientKey): if the seller loses signal or leaves, the
// picture is still made and saved, a retry gets it without paying twice, and 202 { pending, rexJobId } means Rex is
// still working (the phone polls). A failure gives the credits back.

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("brighten"), url: z.string().url().max(2000), level: z.number().int().min(1).max(3) }),
  z.object({ action: z.literal("brightenPreview"), url: z.string().url().max(2000), level: z.number().int().min(1).max(3) }),
  z.object({ action: z.literal("cutout"), url: z.string().url().max(2000), clientKey: z.string().max(80).optional() }),
  z.object({
    action: z.literal("rex"),
    label: z.string().trim().min(1).max(80),
    words: z.string().max(400).optional(),
    ask: z.string().trim().max(300, "Keep it under 300 characters.").optional(),
    shape: z.enum(["wide", "tall", "square"]).optional(),
    clientKey: z.string().max(80).optional(),
  }),
]);

const SIZES: Record<"wide" | "tall" | "square", ImageSize> = { wide: "1536x1024", tall: "1024x1536", square: "1024x1024" };
const MAX_BYTES = 20 * 1024 * 1024;

type Sharp = (typeof import("sharp"))["default"];
async function loadSharp(): Promise<Sharp | null> {
  try {
    return (await import("sharp")).default;
  } catch {
    return null;
  }
}

/** The photo at `url` made brighter (Brighten's sharp steps), at most `size` px on its longer side. */
async function brightened(url: string, level: number, size: number) {
  const params = brightenParams(level);
  if (!params) return null;
  const sharp = await loadSharp();
  if (!sharp) throw new Error("Brighten isn't available right now.");
  const source = await fetch(url);
  if (!source.ok) throw new Error("Couldn't load that photo.");
  const bytes = Buffer.from(await source.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) throw new Error("That photo is too large (20 MB max).");
  // modulate: brightness and colour; linear: contrast around the middle grey (a*x + b, b keeps mid-grey in place).
  return sharp(bytes, { failOn: "error" })
    .rotate()
    .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
    .modulate({ brightness: params.brightness, saturation: params.saturation })
    .linear(params.contrast, 128 * (1 - params.contrast));
}

async function brighten(userId: string, url: string, level: number) {
  const image = await brightened(url, level, 2400);
  if (!image) return url;
  const output = await image.webp({ quality: 86 }).toBuffer();
  const stored = await uploadFileServer("store-banners", new Blob([new Uint8Array(output)], { type: "image/webp" }), `store-banners/${userId}/bright-${Date.now()}.webp`);
  return stored.publicUrl;
}

/** A small JPEG of the brighter photo, inline (the crop screen's preview; nothing is stored). */
async function brightenPreview(url: string, level: number) {
  const image = await brightened(url, level, 640);
  if (!image) return null;
  const output = await image.jpeg({ quality: 72, mozjpeg: true }).toBuffer();
  return `data:image/jpeg;base64,${output.toString("base64")}`;
}

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const input = await readJson(req, Body);
  if (input instanceof NextResponse) return input;

  if (input.action === "brighten") {
    const limited = await overLimit("store-editor-brighten", user.id, 120);
    if (limited) return limited;
    if (!isOwnImageUrl(input.url)) return apiError("BAD_REQUEST", "Put the photo in your shop first, then brighten it.", 400);
    try {
      return ok({ url: await brighten(user.id, input.url, input.level) });
    } catch (error) {
      return apiError("UNAVAILABLE", error instanceof Error ? error.message : "Couldn't brighten that photo.", 503);
    }
  }

  if (input.action === "brightenPreview") {
    const limited = await overLimit("store-editor-brighten-preview", user.id, 600);
    if (limited) return limited;
    if (!isOwnImageUrl(input.url)) return apiError("BAD_REQUEST", "Put the photo in your shop first, then brighten it.", 400);
    try {
      return ok({ preview: await brightenPreview(input.url, input.level) });
    } catch (error) {
      return apiError("UNAVAILABLE", error instanceof Error ? error.message : "Couldn't brighten that photo.", 503);
    }
  }

  if (!aiConfigured() || !getOpenAIClient()) return apiError("AI_OFF", "Rex's pictures aren't switched on yet.", 503);
  const limited = await overLimit("store-editor-photo", user.id, 30);
  if (limited) return limited;

  if (input.action === "cutout") {
    if (!isOwnImageUrl(input.url)) return apiError("BAD_REQUEST", "Put the photo in your shop first, then remove its background.", 400);
    const job = await runRexJob({ user, kind: "image", clientKey: input.clientKey, input: { tool: "cutout", url: input.url } }, async (rex) => {
      await rex.charge("image", 1, "bg_remove");
      const url = await editImage({ sourceUrl: input.url, prompt: EDIT_PROMPTS.remove_background, transparent: true, path: `enhanced/${user.id}/cutout-${Date.now()}` });
      return { url };
    });
    if (job.status === "blocked") return job.response;
    if (job.status === "pending") return ok(rexPendingBody(job.jobId), 202);
    if (job.status === "failed") {
      const off = job.error instanceof ImageUnavailableError;
      return apiError(off ? "AI_OFF" : "UNAVAILABLE", off ? "Rex's pictures aren't switched on yet." : "Rex couldn't remove the background just now. Nothing was charged; try again.", 503);
    }
    return ok({ ...job.result, creditsLeft: await creditBalance(user.id).catch(() => null), rexJobId: job.jobId, resumed: job.replayed });
  }

  // "Make with Rex": one picture for the selected spot.
  const job = await runRexJob({ user, kind: "image", clientKey: input.clientKey, input: { tool: "store-photo", label: input.label, ask: input.ask ?? "", shape: input.shape ?? "wide" } }, async (rex) => {
    await rex.charge("image", 1, "photo");
    const brand = await loadSellerBrandContext(user.id).catch(() => null);
    const prompt = rexPhotoPrompt({ sectionLabel: input.label, sectionWords: input.words, shopName: brand?.storeName ?? undefined, ask: input.ask });
    const made = await makeBrandImage({ brand, prompt, size: SIZES[input.shape ?? "wide"], logo: false, colours: true, path: `generated/${user.id}/store-photo-${Date.now()}` });
    return { url: made.url };
  });
  if (job.status === "blocked") return job.response;
  if (job.status === "pending") return ok(rexPendingBody(job.jobId), 202);
  if (job.status === "failed") return apiError("UNAVAILABLE", "Rex couldn't make a photo just now. Nothing was charged; try again.", 503);
  return ok({ ...job.result, creditsLeft: await creditBalance(user.id).catch(() => null), rexJobId: job.jobId, resumed: job.replayed });
});
