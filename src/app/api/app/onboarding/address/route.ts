import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { buildPlatformStoreBase } from "@/lib/domains/storefront";
import { RESERVED_SUBDOMAINS } from "@/lib/storefront/host-routing";
import { changeStoreSlug, isStoreSlugTaken } from "@/lib/store-address.server";
import { normalizeStoreSlug, storeSlugShapeProblem } from "@shared/store-address";

export const dynamic = "force-dynamic";

// Sign-up's "Choose your store address" (shared/onboarding.ts SELLER_QUESTIONS "address"): the free address.
//   GET ?slug=adaskloset → { slug, available, problem, url }   (is it free? what would the link be?)
//   PUT { slug }        → { slug, url }                          (moves the store there; changeStoreSlug's rules)

function addressOf(slug: string) {
  const url = buildPlatformStoreBase(slug);
  return { url, host: url.replace(/^https?:\/\//, "") };
}

export const GET = withSeller(async (req: NextRequest, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, slug: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const slug = normalizeStoreSlug(req.nextUrl.searchParams.get("slug") ?? store.slug);
  const problem = storeSlugShapeProblem(slug, RESERVED_SUBDOMAINS) ?? (slug !== store.slug && (await isStoreSlugTaken(slug, store.id)) ? "That web address is already taken. Try another." : null);
  return ok({ slug, available: !problem, problem, current: slug === store.slug, ...addressOf(slug) });
});

export const PUT = withSeller(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => null)) as { slug?: unknown } | null;
  if (typeof body?.slug !== "string" || !body.slug.trim()) return apiError("BAD_REQUEST", "Type the address you want.");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const moved = await changeStoreSlug(store.id, body.slug);
  if (!moved.ok) return apiError("BAD_REQUEST", moved.message);
  return ok({ slug: moved.slug, ...addressOf(moved.slug) });
});
