import { z } from "zod";
import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { featureOnForRequest, tablesMissing, type TogetherFeature } from "@/lib/pay-together/common.server";
import { sellerPlanAction, sellerPlans } from "@/lib/pay-together/instalments.server";
import { createAjoGroup, sellerAjoAction, sellerAjoGroups } from "@/lib/pay-together/ajo.server";
import { cancelGroupBuy, sellerGroupBuys } from "@/lib/pay-together/group-buy.server";
import { sellerSubaccount } from "@/lib/paystack/plans.server";

export const dynamic = "force-dynamic";

// The seller's Pay small small plans, ajo groups and group buys (pilots pay_small_small, ajo, group_buy).
//   GET ?view=plans | ajo | groups → { data: … } (404 when that pilot isn't on for this account on this app)
//   POST { action, … } → { data: { ok: true, … } }
// Shopinbos never holds or moves this money: refunds are recorded here and sent by the seller from their own bank.

const VIEW_FEATURE: Record<string, TogetherFeature> = { plans: "pay_small_small", ajo: "ajo", groups: "group_buy" };

async function storeOf(userId: string) {
  return db.store.findUnique({ where: { userId }, select: { id: true } });
}

export const GET = withSeller(async (req, { user }) => {
  const viewName = req.nextUrl.searchParams.get("view") ?? "plans";
  const feature = VIEW_FEATURE[viewName];
  if (!feature || !(await featureOnForRequest(req, user.id, feature))) return apiError("NOT_FOUND", "This isn't on for your shop.", 404);
  const store = await storeOf(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  try {
    const walletReady = Boolean(await sellerSubaccount(store.id));
    if (viewName === "plans") return ok({ walletReady, ...(await sellerPlans(store.id)) });
    if (viewName === "ajo") return ok({ walletReady, groups: await sellerAjoGroups(store.id) });
    return ok({ walletReady, groups: await sellerGroupBuys(store.id) });
  } catch (error) {
    if (tablesMissing(error)) return apiError("NOT_READY", "Not ready yet. Try again later.", 503);
    throw error;
  }
});

const Id = z.string().min(1).max(64);
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("plan.cancel"), planId: Id }),
  z.object({ action: z.literal("plan.refund"), planId: Id, amount: z.number().min(0).max(100_000_000), note: z.string().max(300).optional() }),
  z.object({ action: z.literal("plan.refund_sent"), planId: Id }),
  z.object({ action: z.literal("ajo.create"), productId: Id, variantId: Id.optional(), size: z.number().int(), deposit: z.number().min(0).max(100_000_000).default(0), rules: z.string().max(2000).optional(), startDay: z.string().max(10) }),
  z.object({ action: z.literal("ajo.reorder"), groupId: Id, order: z.array(Id).max(20) }),
  z.object({ action: z.literal("ajo.ship"), groupId: Id }),
  z.object({ action: z.literal("ajo.start"), groupId: Id }),
  z.object({ action: z.literal("ajo.cancel"), groupId: Id }),
  z.object({ action: z.literal("ajo.settle"), groupId: Id, memberId: Id, note: z.string().max(500) }),
  z.object({ action: z.literal("group.cancel"), groupId: Id }),
]);

export const POST = withSeller(async (req, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the details and try again.");
  const input = parsed.data;
  const feature: TogetherFeature = input.action.startsWith("plan.") ? "pay_small_small" : input.action.startsWith("ajo.") ? "ajo" : "group_buy";
  if (!(await featureOnForRequest(req, user.id, feature))) return apiError("NOT_FOUND", "This isn't on for your shop.", 404);
  const store = await storeOf(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  try {
    let result: { ok: true; [key: string]: unknown } | { ok: false; error: string };
    switch (input.action) {
      case "plan.cancel":
        result = await sellerPlanAction(store.id, input.planId, "cancel");
        break;
      case "plan.refund":
        result = await sellerPlanAction(store.id, input.planId, "refund", { amountNaira: input.amount, note: input.note });
        break;
      case "plan.refund_sent":
        result = await sellerPlanAction(store.id, input.planId, "refund_sent");
        break;
      case "ajo.create":
        result = await createAjoGroup(store.id, { productId: input.productId, variantId: input.variantId, size: input.size, depositNaira: input.deposit, rules: input.rules, startDay: input.startDay });
        break;
      case "ajo.reorder":
        result = await sellerAjoAction(store.id, input.groupId, { action: "reorder", order: input.order });
        break;
      case "ajo.ship":
        result = await sellerAjoAction(store.id, input.groupId, { action: "ship" });
        break;
      case "ajo.start":
        result = await sellerAjoAction(store.id, input.groupId, { action: "start" });
        break;
      case "ajo.cancel":
        result = await sellerAjoAction(store.id, input.groupId, { action: "cancel" });
        break;
      case "ajo.settle":
        result = await sellerAjoAction(store.id, input.groupId, { action: "settle", memberId: input.memberId, note: input.note });
        break;
      case "group.cancel":
        result = await cancelGroupBuy(store.id, input.groupId);
        break;
    }
    return result.ok ? ok(result) : apiError("BAD_REQUEST", result.error);
  } catch (error) {
    if (tablesMissing(error)) return apiError("NOT_READY", "Not ready yet. Try again later.", 503);
    throw error;
  }
});
