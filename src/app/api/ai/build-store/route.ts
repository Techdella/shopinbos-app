import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { aiConfigured } from "@/lib/ai/client";
import { meterAi } from "@/lib/ai/usage";
import { buildStore, BuildStoreError } from "@/lib/ai/rex/build-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/ai/build-store: Rex builds the store as a draft (design, editor draft, pages, sample products,
// hero and product images). It never publishes; the seller does that with /api/store/editor/publish.
const BodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) }))
    .max(40)
    .optional(),
  brief: z.string().max(8000).optional(),
  storeConfig: z.record(z.string(), z.unknown()).optional(),
  brandContext: z.record(z.string(), z.unknown()).nullable().optional(),
  templateContext: z
    .object({ templateId: z.string(), templateName: z.string() })
    .passthrough()
    .nullable()
    .optional(),
  sampleProducts: z.boolean().optional(),
  generateImages: z.boolean().optional(),
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: parsed.error.issues[0]?.message ?? "Invalid request" } }, { status: 400 });
  }
  const body = parsed.data;
  if (!body.storeConfig && !aiConfigured()) {
    return NextResponse.json(
      { error: { code: "AI_OFF", message: "Rex's AI isn't switched on yet. Add OPENAI_API_KEY or ANTHROPIC_API_KEY to the server, then try again." } },
      { status: 503 },
    );
  }

  const limited = await meterAi(user.id, "build");
  if (limited) return limited;

  try {
    const result = await buildStore({
      user,
      messages: body.messages,
      brief: body.brief,
      storeConfig: body.storeConfig,
      brandContext: body.brandContext as never,
      templateContext: body.templateContext as never,
      sampleProducts: body.sampleProducts,
      generateImages: body.generateImages,
      source: "rex-build-store",
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof BuildStoreError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    console.error("[ai/build-store] failed", error);
    return NextResponse.json({ error: { code: "BUILD_FAILED", message: "Rex couldn't finish building the store. Nothing was published; try again." } }, { status: 500 });
  }
});
