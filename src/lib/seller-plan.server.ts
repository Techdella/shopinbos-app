import "server-only";
import { db } from "@/lib/db/client";
import { notify } from "@/lib/notifications/notify.server";
import { getPlanCatalog } from "@/lib/plans/catalog.server";
import { planTierOf } from "@shared/plan-catalog";
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
  await recordRenewalPayment(user.id, data);
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

/** The renewal's money on Admin › Wallets › Shopinbos fees (the first payment's receipt comes from applyPlanUpgrade). */
async function recordRenewalPayment(userId: string, data: Data) {
  const tier = planTierOf(data?.subscription?.plan?.plan_code);
  const key = (data?.invoice_code as string | undefined) ?? (data?.transaction?.reference as string | undefined);
  const amountKobo = Number(data?.amount ?? data?.transaction?.amount);
  if (!tier || !key || !Number.isFinite(amountKobo) || amountKobo <= 0) return;
  await db.paymentReceipt
    .createMany({ data: [{ reference: `renewal:${key}`, userId, purpose: tier, amount: amountKobo / 100, provider: "paystack" }], skipDuplicates: true })
    .catch((error) => console.error("[seller plan] renewal receipt not recorded", error));
}

export async function recordSubscriptionStatus(data: Data, status: Exclude<PlanStatus, "active">) {
  const user = await userByEmail(data?.customer?.email);
  if (!user) return false;
  const subscriptionCode = typeof data?.subscription_code === "string" ? data.subscription_code : null;
  if (!sameSubscription(user.subscriptionCode, subscriptionCode)) return false;
  await db.user.update({ where: { id: user.id }, data: { planStatus: status } });
  return true;
}

const BILLING_PAGE: Record<string, string> = { seller: "/home/settings?tab=Billing", supplier: "/supplier/profile", logistics_partner: "/logistics/billing" };

/** Paystack couldn't charge a plan renewal: tell them (bell, push, email) before the plan lapses. Once per invoice. */
export async function notifyRenewalFailed(data: Data) {
  const user = await userByEmail(data?.customer?.email);
  if (!user) return false;
  const account = await db.user.findUnique({ where: { id: user.id }, select: { role: true } });
  const invoice = (data?.invoice_code as string | undefined) ?? (data?.subscription?.subscription_code as string | undefined) ?? new Date().toISOString().slice(0, 10);
  const page = BILLING_PAGE[account?.role ?? "seller"] ?? BILLING_PAGE.seller;
  await notify({
    userId: user.id,
    category: "money",
    priority: "warning",
    title: "We couldn't renew your plan",
    description: "Your card was declined for this month's plan payment. Update your card or pay another way so you keep your plan's features and monthly AI credits.",
    link: page,
    actionLabel: "Update payment",
    actionUrl: page,
    dedupeKey: `plan-renewal-failed-${invoice}`,
    email: "transactional",
    urgent: true,
  });
  return true;
}
