import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { buildStorefrontOrigin } from "@/lib/domains/storefront";
import { hasVercelDomainConfig } from "@/lib/domains/vercel";
import { getDomainSettings } from "@/lib/domains/ownership.server";
import { domainPurchaseEnabled } from "@/lib/domains/billing.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The phone app's Web address screen (apps/mobile/src/app/domain.tsx) in one call: the shop's free address
// (<slug>.mybos.store) and whether the shop is live, the own-domain state (the same as GET /api/domains/connect:
// live and pending domains with the DNS records to add), and whether a new domain can be bought (that checkout
// stays on the website). Connecting, checking and removing use /api/domains/connect and /api/domains/verify.
export const GET = withSeller(async (_req: NextRequest, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { slug: true, status: true } });
  if (!store) return apiError("NOT_FOUND", "Set up your shop first.", 404);
  const origin = buildStorefrontOrigin({ slug: store.slug });
  return ok({
    free: { url: origin, host: origin.replace(/^https?:\/\//, ""), live: store.status === "active" || store.status === "published" },
    own: await getDomainSettings(user.id),
    canBuy: hasVercelDomainConfig() && domainPurchaseEnabled(),
  });
});
