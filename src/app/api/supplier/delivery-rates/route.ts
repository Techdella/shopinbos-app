import { NextRequest } from "next/server";
import { withSupplier } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { saveSupplierDeliveryRates, supplierDeliveryRates } from "@/lib/supplier-dropship.server";

export const dynamic = "force-dynamic";

// The supplier's delivery prices (web portal and the phone app). The supplier never pays for delivery: the customer
// or the seller pays it at checkout, from this card.
//   GET → { data: { rateSource: "partners" | "own", zoneRates, originState, originArea, defaults } }
//   PUT { rateSource: "partners" | "own", zoneRates?: { same_city | same_state | nearby | rest: { small?, medium?, bulky? } } }
//       "own" checks the card (shared/dropship-rules.ts cleanZoneRates: 400 invalid_rates) and means the supplier's
//       own courier delivers; "partners" uses connected Shopinbos partners' rates. Answers like GET.

export const GET = withSupplier(async (_req: NextRequest, { user }) => {
  return ok(await supplierDeliveryRates(user.id));
});

export const PUT = withSupplier(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => null)) as { rateSource?: unknown; zoneRates?: unknown } | null;
  if (!body || typeof body !== "object") return apiError("BAD_REQUEST", "Send rateSource, and zoneRates for your own rates.");
  const saved = await saveSupplierDeliveryRates(user.id, { rateSource: body.rateSource, zoneRates: body.zoneRates });
  if (!saved.ok) return apiError(saved.code, saved.message, 400);
  return ok(saved.data);
});
