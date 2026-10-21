import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { aiConfigured } from "@/lib/ai/client";
import { meterAi } from "@/lib/ai/usage";
import { InspirationSchema } from "@/lib/ai/rex/inspiration";
import { writeEveryPage } from "@/lib/ai/rex/full-build.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

// POST /api/ai/build-store/pages: step two of a full build. Rex writes every page of the draft (words in every
// section, About us and Questions pages, search titles) as one new version. Never publishes.
const BodySchema = z.object({ inspiration: InspirationSchema.nullable().optional() });

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: parsed.error.issues[0]?.message ?? "Invalid request" } }, { status: 400 });
  }
  if (!aiConfigured()) {
    return NextResponse.json({ error: { code: "AI_OFF", message: "Rex's AI isn't switched on yet." } }, { status: 503 });
  }
  const limited = await meterAi(user.id, "text");
  if (limited) return limited;

  const result = await writeEveryPage(user.id, parsed.data.inspiration ?? null);
  if (!result) {
    return NextResponse.json({ error: { code: "AI_UNAVAILABLE", message: "Rex couldn't write the pages just now. Your store design is saved; try again in a moment." } }, { status: 503 });
  }
  return NextResponse.json({ data: result });
});
