import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { aiConfigured } from "@/lib/ai/client";
import { meterAi } from "@/lib/ai/usage";
import { loadStudioStore, runStudioEdit } from "@/lib/ai/rex/studio-edit.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/ai/build-store/studio: one direct store-design edit. Rex replies with a JSON plan that is applied
// to the editor DRAFT only, recorded as a new version (v1 is the store before Rex's first change), and returned
// with the new draft for the live preview. Shoppers see nothing until the seller publishes. The Rex Studio
// chat now goes through Rex's agent (/api/ai/rex), whose store tools share this path.
const BodySchema = z.object({
  message: z.string().trim().min(1, "Tell Rex what to change.").max(2000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(20)
    .optional(),
  imageUrls: z.array(z.string().trim().max(2000).regex(/^https:\/\/\S+$/)).max(4).optional(),
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: parsed.error.issues[0]?.message ?? "Invalid request" } }, { status: 400 });
  }
  if (!aiConfigured()) {
    return NextResponse.json(
      { error: { code: "AI_OFF", message: "Rex's AI isn't switched on yet. Add OPENAI_API_KEY or ANTHROPIC_API_KEY to the server, then try again." } },
      { status: 503 },
    );
  }
  const store = await loadStudioStore(user.id);
  if (!store) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Set up your store first." } }, { status: 404 });

  const limited = await meterAi(user.id, "text");
  if (limited) return limited;

  const result = await runStudioEdit(store, parsed.data);
  if (!result) {
    return NextResponse.json({ error: { code: "AI_UNAVAILABLE", message: "Rex couldn't reach the AI right now. Nothing was changed; try again in a moment." } }, { status: 503 });
  }
  return NextResponse.json({ data: result });
});
