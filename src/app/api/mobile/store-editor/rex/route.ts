import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { aiConfigured } from "@/lib/ai/client";
import { meterAi } from "@/lib/ai/usage";
import { loadStudioStore, runStudioEdit } from "@/lib/ai/rex/studio-edit.server";
import { storedDraftVersion } from "@/lib/store-editor/mobile.server";
import { draftVersion, versionConflict } from "@shared/store-editor";
import { overLimit } from "../../banner/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/mobile/store-editor/rex { message, section?, page?, baseVersion } → { reply, changes, draft, version }
// "Ask Rex" in the phone's store editor (design SE-11): the seller says what to change in plain words and Rex's store
// designer changes the DRAFT (src/lib/ai/rex/studio-edit.server.ts runStudioEdit, the same path as Rex Studio and
// Rex's edit_store_section tool), recorded as a Rex version. The phone shows the new draft at once with "what
// changed" (changes: plain lines), Keep it or Undo all (the phone's undo saves the previous draft back). The phone
// saves its own last change first and sends that version, so Rex works on what the seller sees. Metered like Rex
// Studio (one text use: the day's allowance, then AI credits).
const Body = z.object({
  message: z.string().trim().min(1, "Tell Rex what to change.").max(1000),
  /** The selected section's friendly name, so "make this bolder" means that section. */
  section: z.string().trim().max(120).optional(),
  /** The page being edited ("Home", "About"). */
  page: z.string().trim().max(120).optional(),
  baseVersion: z.string().max(80).nullable().optional(),
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Tell Rex what to change.", 400);
  if (!aiConfigured()) return apiError("AI_OFF", "Rex isn't switched on yet.", 503);
  const limited = await overLimit("mobile-store-editor-rex", user.id, 40);
  if (limited) return limited;

  const store = await loadStudioStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Set up your shop first.", 404);
  if (versionConflict(storedDraftVersion(store.brandSettings), parsed.data.baseVersion)) {
    return apiError("CONFLICT", "Your shop was changed on another device.", 409);
  }

  const metered = await meterAi(user.id, "text");
  if (metered) return metered;

  const where = [parsed.data.page ? `the ${parsed.data.page} page` : null, parsed.data.section ? `the "${parsed.data.section}" section` : null].filter(Boolean).join(", ");
  const message = where ? `${parsed.data.message}\n\n(I'm looking at ${where} on my phone.)` : parsed.data.message;
  const result = await runStudioEdit(store, { message, label: parsed.data.message });
  if (!result) return apiError("AI_UNAVAILABLE", "Rex couldn't reach the AI right now. Nothing was changed; try again in a moment.", 503);

  return ok({
    reply: result.reply,
    changes: result.changes,
    draft: result.draft,
    version: result.draft ? draftVersion(result.draft) : parsed.data.baseVersion ?? null,
  });
});
