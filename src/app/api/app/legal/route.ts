import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { legalPageStatus, readLegalPages } from "@/lib/legal/pages";
import { createCustomLegalPage, legalStore } from "@/lib/legal/server";
import { legalFailure, noStore } from "./respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: the store's legal pages (standard ones first, then the seller's own). POST { title }: add a custom page.
export const GET = withSeller(async (_req, { user }) => {
  const store = await legalStore(user.id);
  if (!store) return noStore();
  const pages = readLegalPages(store.brandSettings).map((page) => ({ ...page, status: legalPageStatus(page) }));
  return NextResponse.json({ data: pages, meta: { page: 1, limit: pages.length, total: pages.length } });
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const store = await legalStore(user.id);
  if (!store) return noStore();
  try {
    const page = await createCustomLegalPage(store, await req.json().catch(() => ({})));
    return NextResponse.json({ data: page }, { status: 201 });
  } catch (error) {
    return legalFailure(error);
  }
});
