import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { aiConfigured } from "@/lib/ai/client";
import { meterAi } from "@/lib/ai/usage";
import { buildStore, BuildStoreError } from "@/lib/ai/rex/build-store";
import { db } from "@/lib/db/client";
import { pushRexVersion, recordDraftBeforeChange, summariseRexVersions } from "@/lib/ai/rex/studio-versions";
import { saveStudioDraft, studioDraft, studioStoreSelect, versionsOf } from "@/lib/ai/rex/studio.server";

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
  /** Rex Studio: record the build as a version of the draft, labelled with the seller's request. */
  versionLabel: z.string().max(200).optional(),
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

  // The draft before the build, so Rex Studio can undo it.
  const beforeStore = body.versionLabel ? await db.store.findUnique({ where: { userId: user.id }, select: studioStoreSelect }) : null;
  const beforeDraft = beforeStore ? studioDraft(beforeStore).draft : null;

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
    if (!body.versionLabel) return NextResponse.json({ data: result });

    const afterStore = await db.store.findUnique({ where: { userId: user.id }, select: studioStoreSelect });
    if (!afterStore) return NextResponse.json({ data: result });
    const before = beforeDraft ? recordDraftBeforeChange(versionsOf(afterStore), beforeDraft) : versionsOf(afterStore);
    const { state, version } = pushRexVersion(before, { label: body.versionLabel, snapshot: result.draft });
    await saveStudioDraft(afterStore, result.draft, state);
    return NextResponse.json({
      data: { ...result, version: { id: version.id, n: version.n }, undoTo: before.current, versions: summariseRexVersions(state, result.draft.updatedAt) },
    });
  } catch (error) {
    if (error instanceof BuildStoreError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    console.error("[ai/build-store] failed", error);
    return NextResponse.json({ error: { code: "BUILD_FAILED", message: "Rex couldn't finish building the store. Nothing was published; try again." } }, { status: 500 });
  }
});
