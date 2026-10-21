import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { meterAiCharged } from "@/lib/ai/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/ai/store-editor/apply — the seller keeps a design Rex previewed in the builder (a menu, a section, a
// new layout). Previews are free; this takes the credits, and the builder then saves the change to the draft.
const Body = z.object({ kind: z.enum(["menu", "edit"]) });

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Nothing to apply" } }, { status: 400 });
  const { blocked, credits } = await meterAiCharged(user.id, "text", 1, "store_design");
  if (blocked) return blocked;
  return NextResponse.json({ data: { charged: credits } });
});
