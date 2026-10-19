import { z } from "zod";
import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import { switchSettings } from "@shared/order-parts";

// The store's "When a supplier doesn't answer in time" setting: send it to another supplier automatically (on by
// default) and the most a switch may cost (at most N% above the original cost, or keep at least N% of the price).
const SELECT = { id: true, autoSwitchSupplier: true, switchCostRule: true, switchMaxIncreasePct: true, switchMinMarginPct: true } as const;

const Body = z.object({
  auto: z.boolean().optional(),
  rule: z.enum(["cost", "margin"]).optional(),
  maxIncreasePct: z.number().int().min(0).max(100).optional(),
  minMarginPct: z.number().int().min(0).max(90).optional(),
});

export const GET = withSeller(async (_req, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: SELECT });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  return ok(switchSettings(store));
});

export const PATCH = withSeller(async (req, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the setting and try again.");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const updated = await db.store.update({
    where: { id: store.id },
    data: {
      ...(parsed.data.auto !== undefined ? { autoSwitchSupplier: parsed.data.auto } : {}),
      ...(parsed.data.rule ? { switchCostRule: parsed.data.rule } : {}),
      ...(parsed.data.maxIncreasePct !== undefined ? { switchMaxIncreasePct: parsed.data.maxIncreasePct } : {}),
      ...(parsed.data.minMarginPct !== undefined ? { switchMinMarginPct: parsed.data.minMarginPct } : {}),
    },
    select: SELECT,
  });
  return ok(switchSettings(updated));
});
