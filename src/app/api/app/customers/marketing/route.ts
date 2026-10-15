import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { sellerStore } from "@/lib/inbox/auth";
import { CustomerMessageError, updateCustomerMarketing } from "@/lib/customers/drawer.server";
import { NOTE_MAX } from "@/lib/customers/pure";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z
  .object({
    key: z.string().trim().min(1).max(320),
    tags: z.array(z.string().trim().max(40)).max(30).optional(),
    note: z.string().max(NOTE_MAX).optional(),
  })
  .strict()
  .refine((v) => v.tags !== undefined || v.note !== undefined, "Nothing to change");

// PATCH /api/app/customers/marketing — the customer's tags and private note on their marketing contact
// (Subscriber.tags and Subscriber.metadata.privateNote). Only the signed-in seller's own customers.
export const PATCH = withSeller(async (req: NextRequest, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid change");
  try {
    return ok(await updateCustomerMarketing(store.id, parsed.data.key, { tags: parsed.data.tags, note: parsed.data.note }));
  } catch (error) {
    if (error instanceof CustomerMessageError) return apiError(error.code, error.message, error.status);
    throw error;
  }
});
