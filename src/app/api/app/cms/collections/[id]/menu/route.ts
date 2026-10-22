import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { addCollectionToMenu, collectionMenuState } from "@/lib/cms/menu.server";
import { getCollection, sellerStore } from "@/lib/cms/server";
import { cmsFailure, noStore } from "../../../respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: where the collection shows in the store's menus. POST { placement }: add it to the header, footer or both.
const Body = z.object({ placement: z.enum(["header", "footer", "both"]) });

const notFound = () => NextResponse.json({ error: { code: "NOT_FOUND", message: "Collection not found" } }, { status: 404 });

export const GET = withSeller(async (_req, { user, params }) => {
  const store = await sellerStore(user.id);
  if (!store) return noStore();
  const collection = await getCollection(store.id, String(params.id));
  if (!collection) return notFound();
  return NextResponse.json({ data: await collectionMenuState(user.id, collection) });
});

export const POST = withSeller(async (req: NextRequest, { user, params }) => {
  const store = await sellerStore(user.id);
  if (!store) return noStore();
  const collection = await getCollection(store.id, String(params.id));
  if (!collection) return notFound();
  try {
    const { placement } = Body.parse(await req.json().catch(() => ({})));
    const result = await addCollectionToMenu(user.id, collection, placement);
    if (result === "missing") return noStore();
    if (result === "conflict") return NextResponse.json({ error: { code: "CONFLICT", message: "Your menus were changed somewhere else just now. Try again." } }, { status: 409 });
    return NextResponse.json({ data: await collectionMenuState(user.id, collection) });
  } catch (error) {
    return cmsFailure(error);
  }
});
