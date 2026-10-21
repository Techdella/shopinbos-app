import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { aiConfigured } from "@/lib/ai/client";
import { meterAi } from "@/lib/ai/usage";
import { draftItem } from "@/lib/cms/ai.server";
import { getCollection, sellerStore } from "@/lib/cms/server";
import { aiOff, cmsFailure, noStore } from "../../../respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

// POST /api/app/cms/collections/:id/draft — Rex writes an item from a content-plan idea and saves it as a draft.
const Body = z.object({ brief: z.string().trim().min(3).max(1500), title: z.string().trim().max(200).optional() });

export const POST = withSeller(async (req: NextRequest, { user, params }) => {
  const store = await sellerStore(user.id);
  if (!store) return noStore();
  const collection = await getCollection(store.id, String(params.id));
  if (!collection) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Collection not found" } }, { status: 404 });
  try {
    const body = Body.parse(await req.json().catch(() => ({})));
    if (!aiConfigured()) return aiOff();
    const limited = await meterAi(user.id, "text");
    if (limited) return limited;
    const { item } = await draftItem(store.id, store.name, { collection: collection.id, brief: body.brief, title: body.title }, "rex");
    return NextResponse.json({ data: { id: item.id, title: item.title, href: `/home/cms/${collection.id}/${item.id}` } }, { status: 201 });
  } catch (error) {
    return cmsFailure(error);
  }
});
