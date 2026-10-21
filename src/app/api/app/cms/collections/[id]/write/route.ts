import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { aiConfigured } from "@/lib/ai/client";
import { meterAi } from "@/lib/ai/usage";
import { writeItem } from "@/lib/cms/ai.server";
import { getCollection, sellerStore } from "@/lib/cms/server";
import { aiOff, cmsFailure, noStore } from "../../../respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

// POST /api/app/cms/collections/:id/write — Rex writes an item for the editor to fill in (title, fields,
// summary, SEO). Nothing is saved; the seller reviews it and saves from the editor.
const Body = z.object({ brief: z.string().trim().min(3, "Tell Rex what to write about").max(1500), title: z.string().trim().max(200).optional() });

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
    return NextResponse.json({ data: await writeItem(store.id, store.name, collection, body) });
  } catch (error) {
    return cmsFailure(error);
  }
});
