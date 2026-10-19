import { apiError } from "@/lib/api/response";
import { withPartnerKey } from "@/lib/logistics/api-keys";

// POST /v1/partner/cod/remittances: retired. Cash on delivery belongs to the seller and is paid to each seller
// directly (in the Shopinbos Partners app, Cash page), never to Shopinbos, so there is nothing to record here.

export const dynamic = "force-dynamic";

export const POST = withPartnerKey(async () =>
  apiError("GONE", "Cash on delivery is now paid to each seller directly from the Cash page in Shopinbos Partners, not to Shopinbos.", 410),
);
