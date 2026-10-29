import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import { saveReturnsSetting } from "@/lib/faults/returns.server";

// The store's returns switch (shared/fault-matrix.ts row 6), web /home/shipping and the phone's Delivery screen:
//   GET   → { data: { returnsAllowed, returnWindowDays, returnShippingPayer } }
//   PATCH { returnsAllowed?, returnWindowDays? (1-30), returnShippingPayer? ("customer" | "seller") } → the same

async function current(userId: string) {
  return db.store.findUnique({ where: { userId }, select: { returnsAllowed: true, returnWindowDays: true, returnShippingPayer: true } });
}

export const GET = withSeller(async (_req, { user }) => {
  const store = await current(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  return ok(store);
});

export const PATCH = withSeller(async (req, { user }) => {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return apiError("BAD_REQUEST", "Nothing to save.");
  const saved = await saveReturnsSetting(user.id, body);
  if (!saved.ok) return apiError("BAD_REQUEST", saved.error);
  return ok(await current(user.id));
});
