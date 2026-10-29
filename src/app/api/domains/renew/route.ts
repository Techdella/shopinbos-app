import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { NOT_IN_APP_CODE, NOT_IN_APP_MESSAGE, isAppRequest } from "@/lib/app-session.server";
import { db } from "@/lib/db/client";
import { DomainBillingError, domainPurchaseEnabled, quoteDomain, renewableDomain, startDomainCheckout } from "@/lib/domains/billing.server";
import type { VercelContactInformation } from "@/lib/domains/vercel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Renew for ₦X": a Paystack checkout with purpose domain_renewal for a domain this store bought through us.
// After payment the same completion path renews it on Vercel (refunded if the registrar refuses).
// GET ?domain= returns the live renewal price for the button.
const Body = z.object({ domain: z.string().trim().min(3).max(260) });

function failure(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

async function storeFor(userId: string) {
  return db.store.findUnique({ where: { userId }, select: { id: true } });
}

export const GET = withSeller(async (req: NextRequest, { user }) => {
  const domain = req.nextUrl.searchParams.get("domain") ?? "";
  const store = await storeFor(user.id);
  if (!store) return failure("store_not_found", "Create your store first.", 404);
  try {
    const base = await renewableDomain(store.id, domain);
    const quote = await quoteDomain(base.domain, "renewal");
    return NextResponse.json({ data: { domain: base.domain, amountNgn: quote.amountNgn, expiresAt: base.expiresAt?.toISOString() ?? null } });
  } catch (error) {
    if (error instanceof DomainBillingError) return failure(error.code, error.message, error.status);
    return failure("price_unavailable", "We couldn't get the renewal price. Try again in a minute.", 502);
  }
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  if (isAppRequest(req.headers)) return failure(NOT_IN_APP_CODE, NOT_IN_APP_MESSAGE, 403);
  if (!domainPurchaseEnabled()) {
    return failure("renew_unavailable", "Renewing here isn't available right now. Tap Help and we'll renew it for you.", 403);
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return failure("missing_domain", "Say which domain to renew.", 400);
  const store = await storeFor(user.id);
  if (!store) return failure("store_not_found", "Create your store first.", 404);
  try {
    const base = await renewableDomain(store.id, parsed.data.domain);
    const quote = await quoteDomain(base.domain, "renewal");
    const checkout = await startDomainCheckout({
      user,
      storeId: store.id,
      domain: base.domain,
      kind: "renewal",
      costUsd: quote.costUsd,
      amountNgn: quote.amountNgn,
      contactInformation: (base.contactInformation ?? null) as VercelContactInformation | null,
      callbackUrl: new URL("/api/billing/domain/callback", req.nextUrl.origin).toString(),
    });
    return NextResponse.json({ data: { authorizationUrl: checkout.authorizationUrl, amountNgn: checkout.amountNgn } });
  } catch (error) {
    if (error instanceof DomainBillingError) return failure(error.code, error.message, error.status);
    console.error("[domains] renewal checkout failed", error);
    return failure("renew_failed", "We couldn't start the renewal. Try again in a minute.", 502);
  }
});
