import { NextRequest, NextResponse } from "next/server";
import { customDomainProblem } from "@/lib/plans/gates.server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { getDomainAvailabilityOnVercel } from "@/lib/domains/vercel";
import { normalizeDomain } from "@/lib/domains/storefront";
import { storeHasDomainPurchase } from "@/lib/domains/billing-pure";
import {
  DomainBillingError,
  publicPurchase,
  quoteDomain,
  sellerGetsFreeDomain,
  settleDomainOrder,
  startDomainCheckout,
  startPlanCoveredDomain,
} from "@/lib/domains/billing.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A free (annual plan) purchase is bought right away and waits up to ~10 seconds for the registrar order.
export const maxDuration = 60;

const PurchaseDomainSchema = z.object({
  domain: z.string().min(3),
  years: z.literal(1).default(1),
  // The naira price the seller saw on the confirm step. If the live price differs we say so instead of charging.
  expectedAmountNgn: z.number().int().positive().optional(),
  // The seller saw "Free with your annual plan". Only a hint: the server decides from the stored plan. If the plan
  // no longer covers it we answer not_free (with the price) instead of sending them to a payment they didn't see.
  expectFree: z.boolean().optional(),
  contactInformation: z.object({
    firstName: z.string().trim().min(1),
    lastName: z.string().trim().min(1),
    email: z.string().trim().email(),
    phone: z.string().trim().regex(/^\+[1-9]\d{0,2}\.?\d{4,14}$/, "Write the phone number with the country code, like +2348012345678."),
    address1: z.string().trim().min(1),
    address2: z.string().trim().min(1).optional(),
    city: z.string().trim().min(1),
    state: z.string().trim().min(1),
    zip: z.string().trim().min(1),
    country: z.string().trim().length(2),
    companyName: z.string().trim().min(1).optional(),
    fax: z.string().trim().min(1).optional(),
    additional: z.record(z.string(), z.unknown()).optional(),
  }).catchall(z.unknown()),
});

// Buying a domain: the seller pays first (Paystack), then the domain is bought on the platform's Vercel account
// (src/lib/domains/billing.server.ts). Switched on with DOMAIN_PURCHASE_ENABLED=true; one year at a time, up to
// DOMAIN_PURCHASE_MAX_USD (default 20) registrar cost, one domain per store.
// POST: checks the name and the price, records a pending_payment purchase and returns the Paystack page.
// GET: this store's domain purchases (for the progress banner and the connected-domain card).

function failure(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export const POST = withSeller(async (req: NextRequest, { user }) => {
  if (process.env.DOMAIN_PURCHASE_ENABLED !== "true") {
    return failure("purchase_unavailable", "Buying a domain here isn't available yet. Buy it from any registrar and connect it instead.", 403);
  }
  const parsed = PurchaseDomainSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return failure("invalid_purchase_body", parsed.error.issues[0]?.message ?? "Invalid domain purchase payload.", 400);
  }

  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return failure("store_not_found", "Create your store before purchasing a domain.", 404);
  const planProblem = await customDomainProblem(user.id);
  if (planProblem) return failure("plan_limit", planProblem, 402);

  const purchases = await db.domainPurchase.findMany({ where: { storeId: store.id }, select: { id: true, kind: true, status: true } });
  if (storeHasDomainPurchase(purchases)) {
    return failure("purchase_limit", "This store already bought a domain. Contact support for another.", 409);
  }

  const domain = normalizeDomain(parsed.data.domain);
  try {
    const availability = await getDomainAvailabilityOnVercel(domain);
    if (!availability.available) return failure("domain_taken", "Someone already has this domain. Pick another name.", 409);

    const quote = await quoteDomain(domain, "new");
    const { country, ...contact } = parsed.data.contactInformation;
    const contactInformation = { ...contact, country: country.toUpperCase() } as Parameters<typeof startDomainCheckout>[0]["contactInformation"];

    // Free with an active, paid-up annual Growth or Pro plan (checked here from the stored plan, never the client),
    // within DOMAIN_PURCHASE_MAX_USD (quoteDomain refuses dearer names). No Paystack: bought straight away.
    if (await sellerGetsFreeDomain(user.id)) {
      const row = await startPlanCoveredDomain({ userId: user.id, storeId: store.id, domain, kind: "new", costUsd: quote.costUsd, contactInformation });
      return NextResponse.json({ data: { free: true, domain, status: row.status, purchase: publicPurchase(row) } });
    }
    if (parsed.data.expectFree) {
      return NextResponse.json(
        { error: { code: "not_free", message: "Your plan doesn't cover a free domain right now. Check the price, then pay." }, data: { amountNgn: quote.amountNgn, renewalNgn: quote.renewalNgn } },
        { status: 409 },
      );
    }

    if (parsed.data.expectedAmountNgn !== undefined && parsed.data.expectedAmountNgn !== quote.amountNgn) {
      return NextResponse.json(
        { error: { code: "price_changed", message: "The price changed. Check the new price, then pay." }, data: { amountNgn: quote.amountNgn, renewalNgn: quote.renewalNgn } },
        { status: 409 },
      );
    }

    const callbackUrl = new URL("/api/billing/domain/callback", req.nextUrl.origin).toString();
    const checkout = await startDomainCheckout({
      user,
      storeId: store.id,
      domain,
      kind: "new",
      costUsd: quote.costUsd,
      amountNgn: quote.amountNgn,
      contactInformation,
      callbackUrl,
    });
    return NextResponse.json({ data: { free: false, authorizationUrl: checkout.authorizationUrl, amountNgn: checkout.amountNgn } });
  } catch (error) {
    if (error instanceof DomainBillingError) return failure(error.code, error.message, error.status);
    console.error("[domains] purchase checkout failed", error);
    return failure("purchase_failed", "We couldn't start buying this domain. Try again in a minute.", 502);
  }
});

export const GET = withSeller(async (_req: NextRequest, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return failure("store_not_found", "Create your store first.", 404);
  let rows = await db.domainPurchase.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" }, take: 20 });
  // A seller waiting on the progress banner moves a finished registrar order along (the cron does it otherwise).
  const inProgress = rows.find((row) => row.status === "buying" && row.vercelOrderId);
  if (inProgress) {
    await settleDomainOrder(inProgress.id, 0).catch(() => null);
    rows = await db.domainPurchase.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" }, take: 20 });
  }
  // meta.freeDomain: the seller's annual plan covers a domain right now (the connected card says "Renews free").
  return NextResponse.json({ data: rows.map(publicPurchase), meta: { freeDomain: await sellerGetsFreeDomain(user.id) } });
});
