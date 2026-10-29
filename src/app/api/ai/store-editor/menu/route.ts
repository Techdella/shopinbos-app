import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { aiConfigured } from "@/lib/ai/client";
import { aiCost, meterAiPreview } from "@/lib/ai/usage";
import { designStoreMenu } from "@/lib/ai/rex/menu-design.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/ai/store-editor/menu — Rex designs the store's menus (structure, labels, mega menu, pictures, phone
// menu). The answer is a preview: free to look at (daily cap only); applying it costs credits through
// /api/ai/store-editor/apply.
const Body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "rex"]), text: z.string().max(4000) })).min(1).max(20),
  /** The menus as the builder has them now (may be unsaved, or Rex's last preview). */
  current: z.object({ main: z.array(z.unknown()).max(60), footer: z.array(z.unknown()).max(60), menuStyle: z.string().max(20), mobileStyle: z.string().max(20), colors: z.record(z.string(), z.string().max(20)).optional() }).optional(),
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Tell Rex what kind of menu you want" } }, { status: 400 });
  if (!aiConfigured()) return NextResponse.json({ error: { code: "AI_OFF", message: "Rex isn't switched on yet. Try again later." } }, { status: 503 });

  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, brandSettings: true } });
  if (!store) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Create your store first" } }, { status: 404 });

  const limited = await meterAiPreview(user.id, "text");
  if (limited) return limited;

  const designed = await designStoreMenu(store, parsed.data);
  if ("error" in designed) {
    return designed.error === "AI_FAILED"
      ? NextResponse.json({ error: { code: "AI_FAILED", message: "Rex couldn't design that just now. Nothing was changed; try again." } }, { status: 502 })
      : NextResponse.json({ error: { code: "AI_FORMAT", message: "Rex's menu came back unusable. Nothing was changed; try describing it another way." } }, { status: 502 });
  }
  return NextResponse.json({ data: { design: designed.design, reply: designed.reply, applyCost: await aiCost("text", 1, "store_design") } });
});
