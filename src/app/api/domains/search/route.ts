import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { searchDomainsOnVercel } from "@/lib/domains/vercel";
import { nairaQuote, sellerGetsFreeDomain } from "@/lib/domains/billing.server";

export const GET = withSeller(async (req: NextRequest, { user }) => {
  const q = new URL(req.url).searchParams.get("q");
  if (!q?.trim()) {
    return NextResponse.json({ error: { code: "missing_q", message: "Query param q is required" } }, { status: 400 });
  }

  const query = q.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!query) {
    return NextResponse.json({ error: { code: "invalid_q", message: "Use letters, numbers, or hyphens." } }, { status: 400 });
  }

  try {
    // Sellers see naira only: the registrar's USD price × DOMAIN_USD_NGN_RATE + DOMAIN_MARKUP_NGN, rounded up to
    // ₦500 (src/lib/domains/billing-pure.ts). Names above DOMAIN_PURCHASE_MAX_USD come back without a price.
    // free: the seller's annual plan pays for it (a hint for the screen; the purchase route checks again).
    const free = await sellerGetsFreeDomain(user.id);
    const domains = (await searchDomainsOnVercel(query)).map((result) => {
      const quote = nairaQuote(result.price, result.renewalPrice);
      return {
        domain: result.domain,
        ending: result.ending,
        available: result.available,
        price: quote.priceNgn,
        renewalPrice: quote.renewalNgn,
        currency: "NGN",
        tooExpensive: result.available && result.price !== null && quote.priceNgn === null,
        free: free && result.available && quote.priceNgn !== null,
      };
    });
    return NextResponse.json({ data: domains });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "domain_search_failed",
          message: error instanceof Error ? error.message : "Domain search failed",
        },
      },
      { status: 400 },
    );
  }
});
