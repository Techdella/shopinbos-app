import { ok, apiError } from "@/lib/api/response";
import { withPartnerKey } from "@/lib/logistics/api-keys";
import { RemittanceBody, firstIssue, readJson } from "@/lib/logistics/partner-api";
import { recordRemittance } from "@/lib/logistics/remittances";

// POST /v1/partner/cod/remittances — record cash you paid in. It settles your oldest unremitted cash jobs, in
// order, as far as the amount covers them. Body: { amount, reference, note? }.

export const dynamic = "force-dynamic";

export const POST = withPartnerKey(async (req, { partner }) => {
  const parsed = RemittanceBody.safeParse(await readJson(req));
  if (!parsed.success) return apiError("BAD_REQUEST", firstIssue(parsed.error));

  const result = await recordRemittance({ partnerId: partner.id, amount: parsed.data.amount, method: "api", reference: parsed.data.reference, note: parsed.data.note });
  if (!result.ok) return apiError(result.error.includes("already recorded") ? "CONFLICT" : "BAD_REQUEST", result.error);
  return ok({ ...result.remittance, jobIds: result.jobIds, covered: result.covered, unallocated: result.unallocated }, 201);
});
