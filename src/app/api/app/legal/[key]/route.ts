import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { legalPageStatus } from "@/lib/legal/pages";
import { deleteLegalPage, legalStore, saveLegalPage, sellerLegalPage } from "@/lib/legal/server";
import { legalFailure, noStore, notFound } from "../respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One legal page: GET it, PUT { title, doc, style, seo, published } to save, DELETE (custom pages only).
export const GET = withSeller(async (_req, { user, params }) => {
  const store = await legalStore(user.id);
  if (!store) return noStore();
  const page = sellerLegalPage(store, String(params.key));
  return page ? NextResponse.json({ data: { ...page, status: legalPageStatus(page) } }) : notFound();
});

export const PUT = withSeller(async (req: NextRequest, { user, params }) => {
  const store = await legalStore(user.id);
  if (!store) return noStore();
  try {
    const page = await saveLegalPage(store, String(params.key), await req.json().catch(() => ({})));
    return NextResponse.json({ data: { ...page, status: legalPageStatus(page) } });
  } catch (error) {
    return legalFailure(error);
  }
});

export const DELETE = withSeller(async (_req, { user, params }) => {
  const store = await legalStore(user.id);
  if (!store) return noStore();
  try {
    await deleteLegalPage(store, String(params.key));
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    return legalFailure(error);
  }
});
