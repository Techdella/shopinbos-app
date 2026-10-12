import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { buyDomainOnVercel } from "@/lib/domains/vercel";
import { normalizeDomain } from "@/lib/domains/storefront";
import { domainOrdersOf } from "@/lib/domains/orders";

const PurchaseDomainSchema = z.object({
  domain: z.string().min(3),
  years: z.number().int().min(1).max(10).default(1),
  autoRenew: z.boolean().default(true),
  // Ignored: the price is always Vercel's (see buyDomainOnVercel). Kept so older clients still validate.
  expectedPrice: z.number().positive().optional(),
  contactInformation: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    phone: z.string().min(1),
    address1: z.string().min(1),
    address2: z.string().optional(),
    city: z.string().min(1),
    state: z.string().min(1),
    zip: z.string().min(1),
    country: z.string().trim().length(2),
    companyName: z.string().min(1).optional(),
    fax: z.string().min(1).optional(),
    additional: z.record(z.string(), z.unknown()).optional(),
  }).catchall(z.unknown()),
});

// Domains are bought on the platform's Vercel account and nothing here charges the seller, so buying is off
// unless DOMAIN_PURCHASE_ENABLED=true, for one year at a time, up to DOMAIN_PURCHASE_MAX_USD (default 20), one
// order per store. The order is remembered on the store so only that store can attach it.
const MAX_PRICE_USD = Number(process.env.DOMAIN_PURCHASE_MAX_USD) > 0 ? Number(process.env.DOMAIN_PURCHASE_MAX_USD) : 20;

export const POST = withSeller(async (req: NextRequest, { user }) => {
  if (process.env.DOMAIN_PURCHASE_ENABLED !== "true") {
    return NextResponse.json(
      { error: { code: "purchase_unavailable", message: "Buying a domain here isn't available yet. Buy it from any registrar and connect it instead." } },
      { status: 403 },
    );
  }
  const body = await req.json().catch(() => null);
  const parsed = PurchaseDomainSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_purchase_body",
          message: parsed.error.issues[0]?.message ?? "Invalid domain purchase payload.",
        },
      },
      { status: 400 },
    );
  }

  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) {
    return NextResponse.json(
      { error: { code: "store_not_found", message: "Create your store before purchasing a domain." } },
      { status: 404 },
    );
  }

  const domain = normalizeDomain(parsed.data.domain);
  if (domainOrdersOf(store.brandSettings).length > 0) {
    return NextResponse.json({ error: { code: "purchase_limit", message: "This store already bought a domain. Contact support for another." } }, { status: 409 });
  }

  try {
    const purchase = await buyDomainOnVercel(domain, {
      years: 1,
      autoRenew: parsed.data.autoRenew,
      maxPrice: MAX_PRICE_USD,
      contactInformation: {
        ...parsed.data.contactInformation,
        country: parsed.data.contactInformation.country.toUpperCase(),
      },
    });

    await db.store.update({
      where: { id: store.id },
      data: { brandSettings: { ...((store.brandSettings ?? {}) as Record<string, unknown>), domainOrders: [...domainOrdersOf(store.brandSettings), String(purchase.orderId)] } },
    });

    return NextResponse.json({
      data: {
        domain,
        orderId: purchase.orderId,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "purchase_failed",
          message: error instanceof Error ? error.message : "Could not purchase that domain.",
        },
      },
      { status: 400 },
    );
  }
});
