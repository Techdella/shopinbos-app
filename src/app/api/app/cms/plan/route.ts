import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { aiConfigured } from "@/lib/ai/client";
import { meterAi } from "@/lib/ai/usage";
import { planContent } from "@/lib/cms/ai.server";
import { PLAN_CHANNELS } from "@/lib/cms/content-plan";
import { sellerStore } from "@/lib/cms/server";
import { aiOff, cmsFailure, noStore } from "../respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/app/cms/plan — Rex plans dated content ideas for the chosen collections and social channels.
const Body = z.object({
  goal: z.string().trim().max(600).default(""),
  weeks: z.number().int().min(1).max(12).default(4),
  perWeek: z.number().int().min(1).max(7).default(2),
  collectionIds: z.array(z.string().max(64)).max(20).default([]),
  channels: z.array(z.enum(PLAN_CHANNELS)).max(PLAN_CHANNELS.length).default([]),
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return noStore();
  try {
    const body = Body.parse(await req.json().catch(() => ({})));
    if (!body.collectionIds.length && !body.channels.length) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Pick at least one kind of content to plan" } }, { status: 422 });
    if (!aiConfigured()) return aiOff();
    // A plan is a long answer: it counts as two writing requests.
    const limited = await meterAi(user.id, "text", 2);
    if (limited) return limited;
    return NextResponse.json({ data: await planContent(store.id, store.name, body) });
  } catch (error) {
    return cmsFailure(error);
  }
});
