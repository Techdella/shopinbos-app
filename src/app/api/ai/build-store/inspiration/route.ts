import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { InspirationError, readInspirationLink } from "@/lib/ai/rex/inspiration.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/ai/build-store/inspiration { url }: reads a store page the seller likes (public pages only) and
// returns what Rex will use from it: name, words, menu, colours, fonts and its share picture. No AI, no credits.
const BodySchema = z.object({ url: z.string().trim().min(1, "Paste a link first.").max(2000) });

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: parsed.error.issues[0]?.message ?? "Invalid request" } }, { status: 400 });
  }
  const limit = await checkRateLimitShared(rateLimitKey("rex-inspiration", user.id), { maxRequests: 12, windowMs: 10 * 60_000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: { code: "RATE_LIMITED", message: "That's a lot of links at once. Wait a few minutes and try again." } }, { status: 429 });
  }
  try {
    return NextResponse.json({ data: await readInspirationLink(parsed.data.url) });
  } catch (error) {
    if (error instanceof InspirationError) return NextResponse.json({ error: { code: "UNREADABLE", message: error.message } }, { status: 422 });
    console.error("[ai/build-store/inspiration] failed", error);
    return NextResponse.json({ error: { code: "UNREADABLE", message: "Rex couldn't read that page. Add a screenshot of it instead." } }, { status: 422 });
  }
});
