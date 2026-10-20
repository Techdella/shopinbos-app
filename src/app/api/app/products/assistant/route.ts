import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { meterAi } from "@/lib/ai/usage";
import { suggestProductChanges } from "@/lib/products/assistant.server";
import { ProductAssistantRequestSchema } from "@shared/product-variants-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

// Peggy on the product form (src/app/components/product-form/ProductPeggy.tsx). Body: { message, history?, photoUrl?,
// productId?, form: { name, description, productType, basePrice, options, variants, details } }.
// Reply: { data: { message, suggestion | null, changes: string[] } }. It only proposes; the form applies and saves.
export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = ProductAssistantRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Tell Peggy what to change.");

  const limited = await meterAi(user.id, "text", 1, "product_copy");
  if (limited) return limited;

  const reply = await suggestProductChanges(parsed.data);
  return ok({ message: reply.message, suggestion: reply.suggestion, changes: reply.changes });
});
