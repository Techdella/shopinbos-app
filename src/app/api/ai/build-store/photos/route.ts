import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { MAX_BUILD_PHOTOS } from "@/lib/ai/rex/build-plan";
import { addBuildPhotos } from "@/lib/ai/rex/full-build.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/ai/build-store/photos { maxPhotos, mode }: last step of a build. Rex makes the homepage banner, the
// story photo and photos for the sample products, as many as the allowance and credits cover (checked again
// here), and puts them in the draft and on the sample products.
const BodySchema = z.object({
  maxPhotos: z.number().int().min(0).max(MAX_BUILD_PHOTOS).default(MAX_BUILD_PHOTOS),
  /** "quick": the banner and the first product only. */
  mode: z.enum(["full", "quick"]).default("full"),
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: parsed.error.issues[0]?.message ?? "Invalid request" } }, { status: 400 });
  }
  try {
    return NextResponse.json({ data: await addBuildPhotos(user.id, parsed.data.maxPhotos, parsed.data.mode) });
  } catch (error) {
    console.error("[ai/build-store/photos] failed", error);
    return NextResponse.json({ error: { code: "PHOTOS_FAILED", message: "Rex couldn't make the photos just now. Your store is saved; try again from the chat." } }, { status: 500 });
  }
});
