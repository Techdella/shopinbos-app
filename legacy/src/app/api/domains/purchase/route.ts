import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { buyDomainOnVercel } from "@/lib/domains/vercel";
import { normalizeDomain } from "@/lib/domains/storefront";

const PurchaseDomainSchema = z.object({
  domain: z.string().min(3),
  years: z.number().int().min(1).max(10).default(1),
  autoRenew: z.boolean().default(true),
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

export const POST = withSeller(async (req: NextRequest, { user }) => {
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

  try {
    const purchase = await buyDomainOnVercel(domain, {
      years: parsed.data.years,
      autoRenew: parsed.data.autoRenew,
      expectedPrice: parsed.data.expectedPrice,
      contactInformation: {
        ...parsed.data.contactInformation,
        country: parsed.data.contactInformation.country.toUpperCase(),
      },
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
