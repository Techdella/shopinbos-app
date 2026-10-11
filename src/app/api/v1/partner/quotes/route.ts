import { ok, apiError } from "@/lib/api/response";
import { withPartnerKey } from "@/lib/logistics/api-keys";
import { QuoteBody, firstIssue, readJson } from "@/lib/logistics/partner-api";
import { replyToQuote } from "@/lib/logistics/quotes";

// POST /v1/partner/quotes — reply to a seller's quote request with your price, or decline it.
// Body: { quoteId, quotedPrice, message?, expiresAt? } or { quoteId, decline: true, message? }.

export const dynamic = "force-dynamic";

const STATUS = { NOT_FOUND: 404, CONFLICT: 409, BAD_REQUEST: 400 } as const;

export const POST = withPartnerKey(async (req, { partner }) => {
  const parsed = QuoteBody.safeParse(await readJson(req));
  if (!parsed.success) return apiError("BAD_REQUEST", firstIssue(parsed.error));
  const body = parsed.data;

  const result = await replyToQuote({
    partnerId: partner.id,
    quoteId: body.quoteId,
    intent: body.decline ? "reject" : "respond",
    quotedPrice: body.quotedPrice,
    partnerResponse: body.message,
    expiresAt: body.expiresAt,
  });
  if (!result.ok) return apiError(result.code, result.error, STATUS[result.code]);
  return ok(result.quote);
});
