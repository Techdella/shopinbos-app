import { z } from "zod";
import { withVideoMaker } from "@/lib/video/owner.server";
import { apiError, ok } from "@/lib/api/response";
import { aiText, firstJsonObject } from "@/lib/ai/text";
import { rexPendingBody, runRexJob } from "@/lib/ai/rex-jobs.server";
import { MAX_PHOTOS, VIDEO_LANGUAGES, fallbackScript, normaliseScript } from "@shared/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const LANGUAGE_KEYS = VIDEO_LANGUAGES.map((language) => language.key) as [string, ...string[]];

const Schema = z.object({
  name: z.string().trim().min(1, "Add the product name").max(120),
  price: z.string().trim().max(30).optional().default(""),
  description: z.string().trim().max(600).optional().default(""),
  language: z.enum(LANGUAGE_KEYS),
  photos: z.number().int().min(1).max(MAX_PHOTOS),
  clientKey: z.string().max(80).optional(),
});

const LANGUAGE_NOTE: Record<string, string> = {
  english: "Nigerian English, warm and direct.",
  pidgin: "Nigerian Pidgin, natural and playful, the way Lagos sellers talk on WhatsApp status.",
  yoruba: "Yorùbá with correct tone marks.",
  hausa: "Hausa with correct hooked letters (ɓ, ɗ, ƙ).",
};

// Video studio: captions, a voiceover and an end-card line for a short product reel. Delivery partners get a reel
// about their delivery business instead ("name" is what the video is about, e.g. "Same-day delivery in Lagos").
// With `clientKey` it is a Rex job (src/lib/ai/rex-jobs.server.ts): saved if the seller leaves, replayed free on a retry.
export const POST = withVideoMaker(async (req, { user }) => {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the details");
  const { name, price, description, language, photos } = parsed.data;
  const fallback = fallbackScript(name, price, language as never, photos);

  const partner = user.role === "logistics_partner";
  const job = await runRexJob({ user, kind: "video_script", clientKey: parsed.data.clientKey, input: { name, price, language, photos } }, async (rex) => {
    const credits = await rex.charge("text");

    // Video scripts are written by Claude (pictures for the shots are made with OpenAI, in reel-shots).
    const raw = (await aiText({
      fast: true,
      prefer: "anthropic",
      prompt: [
        partner
          ? `Write a ${photos}-shot vertical promo reel for a Nigerian delivery business that wants online shops to book it.`
          : `Write a ${photos}-shot vertical product reel for a small Nigerian online shop.`,
        `${partner ? "About" : "Product"}: ${name}${price ? `, ${price}` : ""}.${description ? ` Details: ${description}` : ""}`,
        `Language: ${LANGUAGE_NOTE[language]}`,
        `Return JSON only: {"captions": [${photos} on-screen lines, max 6 words each, one per photo], "voiceover": "2-3 short sentences, under 40 words, ${partner ? "ends by telling shops how to book the delivery" : "ends by telling viewers to tap the link"}", "cta": "end card line, max 5 words"}.`,
        "No emojis, no hashtags, no prices other than the one given, no claims you can't know (materials, origin) unless in the details.",
      ].join("\n"),
    }))?.text ?? null;
    // Rex didn't write it (the template script stands in): that request is given back.
    if (!raw) await rex.refund("text", 1, credits);
    const script = normaliseScript(firstJsonObject(raw), fallback, photos);
    return { ...script, drafted: Boolean(raw) };
  });
  if (job.status === "blocked") return job.response;
  if (job.status === "pending") return ok(rexPendingBody(job.jobId), 202);
  // The script never fails the seller: the template one is always there.
  if (job.status === "failed") return ok({ ...fallback, drafted: false });
  return ok({ ...job.result, rexJobId: job.jobId, resumed: job.replayed });
});
