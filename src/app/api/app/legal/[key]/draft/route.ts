import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { draftLegalPage, legalContext, legalStore, sellerLegalPage } from "@/lib/legal/server";
import { legalFailure, noStore, notFound } from "../../respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ title: z.string().trim().max(120).optional(), brief: z.string().trim().max(1000).optional() });

// POST: Peggy's draft of this page ({ doc, source: "ai" | "template" }). Nothing is saved; the editor shows it.
export const POST = withSeller(async (req: NextRequest, { user, params }) => {
  const store = await legalStore(user.id);
  if (!store) return noStore();
  const page = sellerLegalPage(store, String(params.key));
  if (!page) return notFound();
  try {
    const body = Body.parse(await req.json().catch(() => ({})));
    const owner = await db.user.findUnique({ where: { id: user.id }, select: { email: true, phone: true } }).catch(() => null);
    const ctx = await legalContext(store, { email: owner?.email ?? user.email, phone: owner?.phone ?? null });
    return NextResponse.json({ data: await draftLegalPage(page.key, body.title || page.title, ctx, body.brief) });
  } catch (error) {
    return legalFailure(error);
  }
});
