import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { domainOrdersOf } from "@/lib/domains/orders";
import { markPurchasedDomainVerified } from "@/lib/domains/ownership.server";
import { assignDomainOnVercel, getDomainOrderOnVercel, hasVercelDomainConfig } from "@/lib/domains/vercel";

export const GET = withSeller(async (_req: NextRequest, { params, user }) => {
  const { orderId } = await params;

  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) {
    return NextResponse.json(
      { error: { code: "store_not_found", message: "Create your store before managing domains." } },
      { status: 404 },
    );
  }

  // Only an order this store placed: otherwise any seller could attach another store's purchased domain.
  if (!domainOrdersOf(store.brandSettings).includes(String(orderId))) {
    return NextResponse.json({ error: { code: "not_found", message: "Domain order not found." } }, { status: 404 });
  }

  try {
    const order = await getDomainOrderOnVercel(orderId);
    const orderDomain = order.domains[0]?.domainName ?? null;

    if (!hasVercelDomainConfig()) {
      return NextResponse.json({
        data: {
          order,
          assignedDomain: orderDomain
            ? {
                domain: orderDomain,
                verified: false,
                verification: [],
                configuration: null,
                demo: true,
              }
            : null,
        },
      });
    }

    if (order.status !== "completed" || !orderDomain) {
      return NextResponse.json({ data: { order, assignedDomain: null } });
    }

    try {
      const assignedDomain = await assignDomainOnVercel(orderDomain);

      // Bought through the platform's registrar account, so the platform controls its DNS: verified as is.
      if (!(await markPurchasedDomainVerified(store.id, assignedDomain.domain))) {
        return NextResponse.json({
          data: { order, assignedDomain: null, integrationError: "The domain was purchased but is already connected to another store. Contact support." },
        });
      }

      return NextResponse.json({ data: { order, assignedDomain } });
    } catch (error) {
      return NextResponse.json({
        data: {
          order,
          assignedDomain: null,
          integrationError:
            error instanceof Error ? error.message : "The domain was purchased but could not be attached to the project yet.",
        },
      });
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "domain_order_failed",
          message: error instanceof Error ? error.message : "Could not check your domain order.",
        },
      },
      { status: 400 },
    );
  }
});
