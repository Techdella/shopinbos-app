import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { findRexVersion, recordDraftBeforeChange, summariseRexVersions } from "@/lib/ai/rex/studio-versions";
import { saveStudioDraft, studioDraft, studioStoreSelect, versionsOf } from "@/lib/ai/rex/studio.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rex Studio versions of the editor DRAFT. GET lists them; POST {action:"restore", id} puts a version back as
// the draft (the published store is untouched until the seller presses Publish).

async function loadStore(userId: string) {
  return db.store.findUnique({ where: { userId }, select: studioStoreSelect });
}

export const GET = withSeller(async (_req: NextRequest, { user }) => {
  const store = await loadStore(user.id);
  if (!store) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Store not found" } }, { status: 404 });
  const { draft } = studioDraft(store);
  return NextResponse.json({ data: { versions: summariseRexVersions(versionsOf(store), draft.updatedAt) } });
});

const BodySchema = z.object({ action: z.literal("restore"), id: z.string().min(1).max(80) });

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Say which version to restore." } }, { status: 400 });
  }
  const store = await loadStore(user.id);
  if (!store) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Store not found" } }, { status: 404 });

  const { draft } = studioDraft(store);
  // Keep builder edits made since the last version, so restoring never silently loses them.
  const state = recordDraftBeforeChange(versionsOf(store), draft);
  const version = findRexVersion(state, parsed.data.id);
  if (!version) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "That version is no longer kept. Pick another one." } }, { status: 404 });
  }
  const next = { ...state, current: version.id };
  await saveStudioDraft(store, version.snapshot, next);
  return NextResponse.json({
    data: { draft: version.snapshot, restored: { id: version.id, n: version.n }, versions: summariseRexVersions(next, version.snapshot.updatedAt) },
  });
});
