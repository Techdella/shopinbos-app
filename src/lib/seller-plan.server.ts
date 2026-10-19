import "server-only";
import { db } from "@/lib/db/client";
import { getPlanCatalog } from "@/lib/plans/catalog.server";
import { extendPaidUntil, paystackDate, planInterval, sameSubscription, type PlanStatus } from "@/lib/seller-plan";

// Records the seller's plan from Paystack subscription webhooks on User (planCode, planInterval, planStatus,
// planPaidUntil, subscriptionCode). The user is matched by customer email, like the aiCredits updates. Only plan
// codes we know are recorded; a late event about an older, replaced subscription is ignored.

type Data = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function userByEmail(email: unknown) {
  if (typeof email !== "string" || !email) return null;
  await getPlanCatalog(); // so plan codes created from admin are known
  return db.user.findUnique({ where: { email }, select: { id: true, subscriptionCode: true, planCode: true, planInterval: true, planPaidUntil: true } });
}

export async function recordSubscriptionCreated(data: Data) {
  const code = data?.plan?.plan_code as string | undefined;
  const interval = planInterval(code);
  const user = await userByEmail(data?.customer?.email);
  if (!user || !interval) return false;
  await db.user.update({
    where: { id: user.id },
    data: {
      planCode: code,
      planInterval: interval,
      planStatus: "active",
      subscriptionCode: typeof data?.subscription_code === "string" ? data.subscription_code : null,
      planPaidUntil: paystackDate(data?.next_payment_date) ?? extendPaidUntil(null, interval, new Date()),
    },
  });
  return true;
}

export async function recordInvoicePaid(data: Data) {
  const subscription = (data?.subscription ?? {}) as Data;
  const user = await userByEmail(data?.customer?.email);
  if (!user) return false;
  const subscriptionCode = typeof subscription.subscription_code === "string" ? subscription.subscription_code : null;
  if (!sameSubscription(user.subscriptionCode, subscriptionCode)) return false;
  const code = (subscription.plan?.plan_code as string | undefined) ?? user.planCode ?? undefined;
  const interval = planInterval(code);
  if (!interval) return false;
  await db.user.update({
    where: { id: user.id },
    data: {
      planCode: code,
      planInterval: interval,
      planStatus: "active",
      ...(subscriptionCode ? { subscriptionCode } : {}),
      planPaidUntil: paystackDate(subscription.next_payment_date) ?? extendPaidUntil(user.planPaidUntil, interval, new Date()),
    },
  });
  return true;
}

export async function recordSubscriptionStatus(data: Data, status: Exclude<PlanStatus, "active">) {
  const user = await userByEmail(data?.customer?.email);
  if (!user) return false;
  const subscriptionCode = typeof data?.subscription_code === "string" ? data.subscription_code : null;
  if (!sameSubscription(user.subscriptionCode, subscriptionCode)) return false;
  await db.user.update({ where: { id: user.id }, data: { planStatus: status } });
  return true;
}
