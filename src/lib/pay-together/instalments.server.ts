import "server-only";

import { db } from "@/lib/db/client";
import { paystackOutcome } from "@shared/paystack-return";
import {
  INSTALMENT_REF_PREFIX,
  PAY_SMALL_FEATURE,
  PAY_SMALL_WEEKS,
  PENDING_PLAN_TTL_MS,
  applyPartPaid,
  autopayDue,
  cleanRefundRule,
  cleanWeeksList,
  isPlanWeeks,
  nextDueAt,
  nextPart,
  partDueAt,
  pastGrace,
  planProblem,
  reminderDue,
  repriceRemaining,
  spreadKobo,
  splitIntoParts,
  type PlanWeeks,
} from "@shared/instalments";
import { chargeSavedCard, paidAmountKobo, paymentsReady, readMetadata, saleFeeKobo, sealAuthorization, sellerSplit, sellerSubaccount, startSplitPayment, verifyPayment } from "@/lib/paystack/plans.server";
import { buildSplitPlan, type PaymentSplitPlan } from "@/lib/wallet/rules";
import { createPaidOrder, dayText, featureOnForStore, holdUnits, loadSaleProduct, messageShopper, naira, newReference, releaseUnits, signLink, storeLink, tellSeller, type StoreRef } from "./common.server";

// Pay small small (pilot "pay_small_small"; rules in shared/instalments.ts). A shopper pays for one product in 4, 6
// or 8 weekly parts, each its own Paystack payment split straight to the seller's bank (src/lib/paystack/plans.server.ts):
// Shopinbos never holds the money. The first part starts the plan (units of tracked stock are set aside); the last
// part makes the store order (paid). Missed parts: 2 days' grace, then the plan is defaulted and the seller decides
// any refund under their own rule, sending it from their own bank (the split put the money there, not with Shopinbos).

// ─── The seller's settings per product ─────────────────────────────────────────

export interface PayOptionView {
  paySmallOn: boolean;
  paySmallWeeks: PlanWeeks[];
  priceLock: boolean;
  refundRule: string;
  groupBuyOn: boolean;
  groupPrice: number | null;
  groupSize: number | null;
  groupHours: number | null;
}

export function payOptionView(row: { paySmallOn: boolean; paySmallWeeks: number[]; priceLock: boolean; refundRule: string; groupBuyOn: boolean; groupPriceKobo: number | null; groupSize: number | null; groupHours: number | null } | null): PayOptionView {
  return {
    paySmallOn: row?.paySmallOn ?? false,
    paySmallWeeks: cleanWeeksList(row?.paySmallWeeks) ?? [...PAY_SMALL_WEEKS],
    priceLock: row?.priceLock ?? true,
    refundRule: cleanRefundRule(row?.refundRule),
    groupBuyOn: row?.groupBuyOn ?? false,
    groupPrice: row?.groupPriceKobo != null ? row.groupPriceKobo / 100 : null,
    groupSize: row?.groupSize ?? null,
    groupHours: row?.groupHours ?? null,
  };
}

// ─── Storefront: what the shopper sees ─────────────────────────────────────────

export interface PaySmallOffer {
  weeks: Array<{ weeks: PlanWeeks; weeklyKobo: number; lastKobo: number; totalKobo: number }>;
  priceLock: boolean;
  refundRule: string;
  finishedPlans: number;
}

/** The Pay small small offer for a product (null when the shop's pilot, the product's switch or the seller's bank isn't on). */
export async function paySmallOffer(storeId: string, productId: string, unitKobo: number, quantity = 1): Promise<PaySmallOffer | null> {
  const option = await db.productPayOption.findUnique({ where: { productId } });
  if (!option?.paySmallOn || option.storeId !== storeId) return null;
  if (!(await featureOnForStore(storeId, PAY_SMALL_FEATURE)) || !paymentsReady() || !(await sellerSubaccount(storeId))) return null;
  const total = unitKobo * quantity;
  const weeks = (cleanWeeksList(option.paySmallWeeks) ?? []).flatMap((count) => {
    if (planProblem(total, count)) return [];
    const parts = splitIntoParts(total, count)!;
    return [{ weeks: count, weeklyKobo: parts[0]!, lastKobo: parts.at(-1)!, totalKobo: total }];
  });
  if (!weeks.length) return null;
  const finishedPlans = await db.instalmentPlan.count({ where: { storeId, status: "completed" } });
  return { weeks, priceLock: option.priceLock, refundRule: cleanRefundRule(option.refundRule), finishedPlans };
}

export type StartResult = { ok: true; authorizationUrl: string; accessCode: string | null; reference: string; returnUrl: string } | { ok: false; error: string };

function planUrl(store: { slug: string; customDomain: string | null }, planId: string) {
  return storeLink(store, `/plan/${planId}?t=${signLink("plan", planId)}`);
}

/** Starts a plan: saves it (pending) and opens Paystack for part 1, split to the seller. */
export async function startPlan(store: StoreRef, input: {
  productId: string;
  variantId?: string | null;
  quantity: number;
  weeks: number;
  buyer: { name: string; email: string; phone: string | null };
  address: Record<string, unknown>;
  autopay: boolean;
}): Promise<StartResult> {
  if (!paymentsReady()) return { ok: false, error: "Card payments aren't available right now. Try again later." };
  if (!(await featureOnForStore(store.id, PAY_SMALL_FEATURE))) return { ok: false, error: "Pay small small isn't available at this shop." };
  const option = await db.productPayOption.findUnique({ where: { productId: input.productId } });
  if (!option?.paySmallOn || option.storeId !== store.id) return { ok: false, error: "This product can't be paid in parts." };
  if (!isPlanWeeks(input.weeks) || !(cleanWeeksList(option.paySmallWeeks) ?? []).includes(input.weeks)) return { ok: false, error: "Choose one of the lengths this shop offers." };
  const product = await loadSaleProduct(store.id, input.productId, input.variantId);
  if (!product) return { ok: false, error: "This product isn't available." };
  if ("problem" in product) return { ok: false, error: product.problem };
  if (product.available !== null && product.available < input.quantity) return { ok: false, error: "Sorry, this is sold out." };
  const seller = await sellerSubaccount(store.id);
  if (!seller) return { ok: false, error: "This shop can't take card payments right now." };

  const totalKobo = product.unitKobo * input.quantity;
  const problem = planProblem(totalKobo, input.weeks);
  if (problem) return { ok: false, error: problem };
  const amounts = splitIntoParts(totalKobo, input.weeks)!;
  const feeKobo = await saleFeeKobo(seller.sellerUserId, totalKobo);
  const fees = spreadKobo(feeKobo, amounts);
  const split = sellerSplit(seller.subaccount, amounts[0]!, fees[0]!);
  const reference = newReference(INSTALMENT_REF_PREFIX);

  const plan = await db.instalmentPlan.create({
    data: {
      storeId: store.id,
      productId: product.id,
      variantId: product.variantId,
      variantLabel: product.variantLabel,
      productName: product.name,
      productImage: product.image,
      quantity: input.quantity,
      buyerName: input.buyer.name,
      buyerEmail: input.buyer.email.toLowerCase(),
      buyerPhone: input.buyer.phone,
      deliveryAddress: JSON.parse(JSON.stringify(input.address)),
      weeks: input.weeks,
      weeklyKobo: amounts[0]!,
      totalKobo,
      amountsKobo: amounts,
      feeKobo,
      priceLock: option.priceLock,
      refundRule: cleanRefundRule(option.refundRule),
      autopay: input.autopay,
      payments: { create: { n: 1, amountKobo: amounts[0]!, feeKobo: split.platformKobo ?? 0, sellerKobo: split.sellerKobo, reference, split: JSON.parse(JSON.stringify(split)) } },
    },
  });
  const returnUrl = planUrl(store, plan.id);
  try {
    const started = await startSplitPayment({
      email: plan.buyerEmail,
      amountKobo: amounts[0]!,
      reference,
      callbackUrl: returnUrl,
      metadata: { kind: "pay_small", planId: plan.id, n: 1, storeId: store.id, product: product.name },
      plan: split,
      cardOnly: input.autopay,
    });
    return { ok: true, ...started, returnUrl };
  } catch (error) {
    console.error(`[pay-small] Paystack could not start plan ${plan.id}`, error);
    await db.instalmentPlan.update({ where: { id: plan.id }, data: { status: "cancelled", cancelledAt: new Date() } }).catch(() => null);
    return { ok: false, error: "Card payment isn't available right now. Try again in a moment." };
  }
}

/** The split for part `n` of a plan, with today's subaccount (the seller may have changed bank since). */
async function partSplit(plan: { storeId: string; amountsKobo: number[]; feeKobo: number }, n: number, amounts: number[]): Promise<PaymentSplitPlan | null> {
  const seller = await sellerSubaccount(plan.storeId);
  if (!seller) return null;
  const fees = spreadKobo(plan.feeKobo, amounts);
  return sellerSplit(seller.subaccount, amounts[n - 1]!, fees[n - 1] ?? 0);
}

/**
 * Price lock off: the parts still to pay follow the product's current price (saved on the plan before the next
 * part is charged). Price lock on (the default): unchanged.
 */
async function currentAmounts(plan: { id: string; priceLock: boolean; productId: string; variantId: string | null; storeId: string; quantity: number; amountsKobo: number[]; paidCount: number; totalKobo: number }): Promise<number[]> {
  if (plan.priceLock) return plan.amountsKobo;
  const product = await loadSaleProduct(plan.storeId, plan.productId, plan.variantId);
  if (!product || "problem" in product) return plan.amountsKobo;
  const total = product.unitKobo * plan.quantity;
  if (total === plan.totalKobo) return plan.amountsKobo;
  const amounts = repriceRemaining(plan.amountsKobo, plan.paidCount, total);
  const newTotal = amounts.reduce((sum, amount) => sum + amount, 0);
  await db.instalmentPlan.update({ where: { id: plan.id }, data: { amountsKobo: amounts, totalKobo: newTotal, weeklyKobo: amounts[plan.paidCount] ?? plan.amountsKobo[0]! } });
  return amounts;
}

/** The shopper's "Pay now" on their plan page: the next part, split to the seller. */
export async function startPartPayment(store: StoreRef, planId: string): Promise<StartResult> {
  if (!paymentsReady()) return { ok: false, error: "Card payments aren't available right now. Try again later." };
  const plan = await db.instalmentPlan.findFirst({ where: { id: planId, storeId: store.id } });
  if (!plan) return { ok: false, error: "We couldn't find this plan." };
  if (plan.status !== "active") return { ok: false, error: plan.status === "completed" ? "This plan is fully paid." : "This plan is closed. Contact the shop." };
  const amounts = await currentAmounts(plan);
  const next = nextPart({ weeks: plan.weeks, paidCount: plan.paidCount, amountsKobo: amounts });
  if (!next || next.amountKobo <= 0) return { ok: false, error: "There's nothing left to pay." };
  const split = await partSplit(plan, next.n, amounts);
  if (!split) return { ok: false, error: "This shop can't take card payments right now. Contact them." };
  const reference = newReference(INSTALMENT_REF_PREFIX);
  await db.instalmentPayment.create({ data: { planId: plan.id, n: next.n, amountKobo: next.amountKobo, feeKobo: split.platformKobo ?? 0, sellerKobo: split.sellerKobo, reference, split: JSON.parse(JSON.stringify(split)) } });
  const returnUrl = planUrl(store, plan.id);
  try {
    const started = await startSplitPayment({ email: plan.buyerEmail, amountKobo: next.amountKobo, reference, callbackUrl: returnUrl, metadata: { kind: "pay_small", planId: plan.id, n: next.n, storeId: store.id }, plan: split });
    return { ok: true, ...started, returnUrl };
  } catch (error) {
    console.error(`[pay-small] Paystack could not start part ${next.n} of plan ${plan.id}`, error);
    await db.instalmentPayment.update({ where: { reference }, data: { status: "failed" } }).catch(() => null);
    return { ok: false, error: "Card payment isn't available right now. Try again in a moment." };
  }
}

// ─── Recording a payment (webhook, return page, autopay) ────────────────────────

export type ConfirmResult = { ok: true; fresh: boolean } | { ok: false; error: string; retry?: boolean; pending?: boolean };

/**
 * Records one part's payment, once: asks Paystack, checks it succeeded in naira for at least the part's amount,
 * marks the payment paid and moves the plan on (conditional on its paid count, so replays and the return page
 * racing the webhook record nothing twice). A part paid twice is recorded and the seller told to send it back.
 */
export async function confirmInstalmentPayment(reference: string): Promise<ConfirmResult> {
  if (!reference.startsWith(INSTALMENT_REF_PREFIX)) return { ok: false, error: "Not a Pay small small payment." };
  const payment = await db.instalmentPayment.findUnique({ where: { reference }, include: { plan: true } });
  if (!payment) return { ok: false, error: "Unknown payment." };
  if (payment.status === "paid") return { ok: true, fresh: false };
  let verified;
  try {
    verified = await verifyPayment(reference);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Paystack could not check this payment.", retry: true };
  }
  if (verified.status !== "success") {
    const outcome = paystackOutcome(verified.status);
    if (outcome !== "pending") await db.instalmentPayment.updateMany({ where: { reference, status: "pending" }, data: { status: "failed" } });
    return { ok: false, error: "The payment didn't go through.", pending: outcome === "pending" };
  }
  const meta = readMetadata(verified.metadata);
  if (verified.currency && verified.currency !== "NGN") return { ok: false, error: "This payment wasn't in naira." };
  if (meta.kind !== "pay_small" || meta.planId !== payment.planId) return { ok: false, error: "This payment isn't for this plan." };
  if (paidAmountKobo(verified) < payment.amountKobo) {
    console.warn(`[pay-small] ${reference} paid ${verified.amount} kobo, less than part ${payment.n} (${payment.amountKobo})`);
    return { ok: false, error: "The amount paid is less than this part." };
  }

  const now = new Date();
  const claimed = await db.instalmentPayment.updateMany({ where: { reference, status: { not: "paid" } }, data: { status: "paid", paidAt: now } });
  if (claimed.count !== 1) return { ok: true, fresh: false };
  const plan = payment.plan;
  const step = applyPartPaid(plan, payment.n, payment.amountKobo);
  const moved = step
    ? await db.instalmentPlan.updateMany({
        where: { id: plan.id, paidCount: plan.paidCount, status: { in: payment.n === 1 ? ["pending", "cancelled"] : ["active"] } },
        data: {
          paidCount: step.paidCount,
          paidKobo: step.paidKobo,
          status: step.completed ? "completed" : "active",
          ...(payment.n === 1 ? { startedAt: now, cancelledAt: null } : {}),
          nextDueAt: step.completed ? null : nextDueAt({ weeks: plan.weeks, paidCount: step.paidCount, startedAt: plan.startedAt ?? now }),
          ...(step.completed ? { completedAt: now } : {}),
        },
      })
    : { count: 0 };
  if (moved.count !== 1) {
    // Paid twice (or after the plan closed): the money is in the seller's bank; they send it back.
    await db.instalmentPayment.update({ where: { reference }, data: { extra: true } });
    await db.instalmentPlan.update({ where: { id: plan.id }, data: { refundNote: `Extra payment ${naira(payment.amountKobo)} (Paystack ${reference}): send it back to the customer.`.slice(0, 500) } }).catch(() => null);
    await tellSeller(plan.storeId, { title: `Send a payment back: ${plan.buyerName}`, description: `${plan.buyerName} paid ${naira(payment.amountKobo)} for part ${payment.n} of their Pay small small plan for ${plan.productName}, but it was already paid or the plan was closed. The money is in your bank: send it back to them.`, link: "/home/pay-small", dedupeKey: `pay-small.extra:${reference}`, priority: "critical" });
    return { ok: true, fresh: false };
  }

  if (payment.n === 1) await afterFirstPart(plan.id, verified, now);
  if (step?.completed) await completePlan(plan.id, reference);
  else await tellSeller(plan.storeId, { title: `Part ${payment.n} of ${plan.weeks} paid: ${plan.productName}`, description: `${plan.buyerName} paid ${naira(payment.amountKobo)} (Pay small small). It settles to your bank through Paystack.`, link: "/home/pay-small", dedupeKey: `pay-small.part:${reference}`, priority: "success", event: "order.paid" });
  return { ok: true, fresh: true };
}

/** Part 1 is in: keep the card (only if they asked for autopay and Paystack says it's reusable) and set units aside. */
async function afterFirstPart(planId: string, verified: Awaited<ReturnType<typeof verifyPayment>>, now: Date) {
  const plan = await db.instalmentPlan.findUnique({ where: { id: planId } });
  if (!plan) return;
  const card = plan.autopay ? sealAuthorization(verified) : null;
  const held = await holdUnits(plan.productId, plan.quantity);
  await db.instalmentPlan.update({
    where: { id: plan.id },
    data: {
      ...(card ? { authorizationCode: card.code, authorizationEmail: (verified.customer?.email ?? plan.buyerEmail).toLowerCase(), cardLast4: card.last4 } : { autopay: false }),
      stockHeld: held === "sold_out" ? 0 : held,
      startedAt: plan.startedAt ?? now,
    },
  });
  const store = await db.store.findUnique({ where: { id: plan.storeId }, select: { slug: true, customDomain: true, name: true } });
  if (!store) return;
  await tellSeller(plan.storeId, {
    title: `New Pay small small plan: ${plan.productName}`,
    description: `${plan.buyerName} started paying ${naira(plan.totalKobo)} over ${plan.weeks} weeks (${naira(plan.weeklyKobo)} a week). Part 1 settles to your bank through Paystack.${held === "sold_out" ? " Your stock of this product is used up: restock before the plan ends." : held ? ` ${held} unit${held === 1 ? " is" : "s are"} set aside for them.` : ""}`,
    link: "/home/pay-small",
    dedupeKey: `pay-small.started:${plan.id}`,
    priority: "success",
    event: "order.paid",
  });
  const due = nextDueAt({ weeks: plan.weeks, paidCount: 1, startedAt: plan.startedAt ?? now });
  await messageShopper({
    storeId: plan.storeId,
    phone: plan.buyerPhone,
    email: plan.buyerEmail,
    name: plan.buyerName,
    event: "pay_small_started",
    refId: plan.id,
    sms: `${store.name}: part 1 of ${plan.weeks} for ${plan.productName} is paid. Next ${naira(plan.amountsKobo[1] ?? 0)} due ${due ? dayText(due) : ""}. Your plan: ${planUrl(store, plan.id)}`,
    email_: { subject: `Part 1 paid: ${plan.productName}`, heading: "Your plan has started", body: `part 1 of ${plan.weeks} for ${plan.productName} is paid. Your next payment of ${naira(plan.amountsKobo[1] ?? 0)} is due ${due ? dayText(due) : "next week"}.`, cta: { label: "See your plan", url: planUrl(store, plan.id) } },
  });
}

/** The last part is in: make the order (paid, delivery as usual), release the units held, tell everyone. */
async function completePlan(planId: string, lastReference: string) {
  const plan = await db.instalmentPlan.findUnique({ where: { id: planId }, include: { payments: { where: { status: "paid", extra: false } } } });
  if (!plan || plan.orderId) return;
  const seller = await sellerSubaccount(plan.storeId);
  // The whole plan's split, for the wallet statement and Shopinbos's fee report: what each payment's split did, added up.
  const shares = plan.payments.reduce((acc, payment) => ({ total: acc.total + payment.amountKobo, fee: acc.fee + payment.feeKobo }), { total: 0, fee: 0 });
  const split = seller ? buildSplitPlan({ totalKobo: shares.total, sellerSubaccount: seller.subaccount, suppliers: [], platformKobo: shares.fee }) : null;
  try {
    const created = await createPaidOrder({
      storeId: plan.storeId,
      product: { id: plan.productId, name: plan.productName, image: plan.productImage, variantId: plan.variantId, variantLabel: plan.variantLabel },
      quantity: plan.quantity,
      unitNaira: plan.paidKobo / 100 / plan.quantity,
      buyer: { name: plan.buyerName, email: plan.buyerEmail, phone: plan.buyerPhone },
      address: plan.deliveryAddress,
      note: `Paid in ${plan.weeks} weekly parts (Pay small small).`,
      paystackRef: lastReference,
      split,
      releaseHeld: plan.stockHeld,
      logTag: "pay small small",
    });
    await db.instalmentPlan.update({ where: { id: plan.id }, data: { orderId: created.orderId, stockHeld: 0 } });
    await tellSeller(plan.storeId, {
      title: `Paid in full: ${plan.productName}`,
      description: `${plan.buyerName} finished paying (${naira(plan.paidKobo)} over ${plan.weeks} weeks). Order ${created.orderNumber} is ready to pack and send.${created.stockShort ? " Your stock ran out: restock or agree a swap with them." : ""}`,
      link: `/home/orders/${created.orderId}`,
      dedupeKey: `pay-small.done:${plan.id}`,
      priority: "success",
      event: "order.paid",
    });
  } catch (error) {
    console.error(`[pay-small] could not make the order for completed plan ${plan.id}`, error);
    await tellSeller(plan.storeId, { title: `Make the order: ${plan.productName}`, description: `${plan.buyerName} finished paying for ${plan.productName}, but the order couldn't be made automatically. Open Pay small small and contact them.`, link: "/home/pay-small", dedupeKey: `pay-small.done-failed:${plan.id}`, priority: "critical" });
  }
}

// ─── The shopper's plan page ─────────────────────────────────────────────────

export async function publicPlan(storeId: string, planId: string) {
  const plan = await db.instalmentPlan.findFirst({ where: { id: planId, storeId }, include: { payments: { where: { status: "paid" }, orderBy: { n: "asc" } } } });
  if (!plan) return null;
  const finishedPlans = await db.instalmentPlan.count({ where: { storeId, status: "completed" } });
  const next = plan.status === "active" ? nextPart(plan) : null;
  return {
    id: plan.id,
    status: plan.status,
    productName: plan.productName,
    productImage: plan.productImage,
    variantLabel: plan.variantLabel,
    quantity: plan.quantity,
    weeks: plan.weeks,
    totalKobo: plan.totalKobo,
    paidKobo: plan.paidKobo,
    paidCount: plan.paidCount,
    amountsKobo: plan.amountsKobo,
    nextKobo: next?.amountKobo ?? null,
    nextDueAt: plan.nextDueAt?.toISOString() ?? null,
    schedule: plan.startedAt ? plan.amountsKobo.map((amount, index) => ({ n: index + 1, amountKobo: amount, dueAt: partDueAt(plan.startedAt!, index + 1).toISOString(), paid: index < plan.paidCount })) : [],
    autopay: plan.autopay && Boolean(plan.authorizationCode),
    cardLast4: plan.cardLast4,
    refundRule: plan.refundRule,
    priceLock: plan.priceLock,
    buyerFirstName: plan.buyerName.split(/\s+/)[0] ?? "",
    orderId: plan.orderId,
    finishedPlans,
  };
}

// ─── The seller's list and settlement report ──────────────────────────────────

export async function sellerPlans(storeId: string) {
  const plans = await db.instalmentPlan.findMany({
    where: { storeId, status: { not: "pending" } },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { payments: { where: { status: "paid" }, orderBy: { paidAt: "asc" } } },
  });
  const rows = plans.map((plan) => ({
    id: plan.id,
    status: plan.status,
    productName: plan.productName,
    variantLabel: plan.variantLabel,
    quantity: plan.quantity,
    buyerName: plan.buyerName,
    buyerPhone: plan.buyerPhone,
    buyerEmail: plan.buyerEmail,
    weeks: plan.weeks,
    paidCount: plan.paidCount,
    total: plan.totalKobo / 100,
    paid: plan.paidKobo / 100,
    weekly: plan.weeklyKobo / 100,
    nextDueAt: plan.nextDueAt?.toISOString() ?? null,
    autopay: plan.autopay && Boolean(plan.authorizationCode),
    refundRule: plan.refundRule,
    refundStatus: plan.refundStatus,
    refundNote: plan.refundNote,
    orderId: plan.orderId,
    createdAt: plan.createdAt.toISOString(),
  }));
  // Every part that landed: what the customer paid, Shopinbos's fee in the split, what settles to the seller's bank.
  const settlements = plans
    .flatMap((plan) => plan.payments.map((payment) => ({ planId: plan.id, buyerName: plan.buyerName, productName: plan.productName, n: payment.n, weeks: plan.weeks, amount: payment.amountKobo / 100, fee: payment.feeKobo / 100, toYou: payment.sellerKobo / 100, reference: payment.reference, via: payment.via, extra: payment.extra, paidAt: payment.paidAt?.toISOString() ?? null })))
    .sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)));
  const totals = {
    active: rows.filter((row) => row.status === "active").length,
    completed: rows.filter((row) => row.status === "completed").length,
    defaulted: rows.filter((row) => row.status === "defaulted").length,
    received: settlements.reduce((sum, row) => sum + row.toYou, 0),
    owed: rows.filter((row) => row.status === "active").reduce((sum, row) => sum + (row.total - row.paid), 0),
  };
  return { plans: rows, settlements, totals };
}

export type SellerActionResult = { ok: true } | { ok: false; error: string };

/**
 * The seller cancels an active plan, or settles a defaulted / cancelled one under their refund rule. Shopinbos never
 * holds or sends this money: every part was split straight to the seller's own bank, and the existing refund path
 * can't take a split payment back through Paystack (src/lib/commerce/refunds.ts refundRoute: split → manual). So the
 * refund is recorded here and the seller sends it from their own bank.
 */
export async function sellerPlanAction(storeId: string, planId: string, action: "cancel" | "refund" | "refund_sent", input: { amountNaira?: number; note?: string } = {}): Promise<SellerActionResult> {
  const plan = await db.instalmentPlan.findFirst({ where: { id: planId, storeId } });
  if (!plan) return { ok: false, error: "Plan not found" };
  const store = await db.store.findUnique({ where: { id: storeId }, select: { slug: true, customDomain: true, name: true } });
  if (action === "cancel") {
    if (plan.status !== "active") return { ok: false, error: "Only an active plan can be cancelled." };
    const moved = await db.instalmentPlan.updateMany({ where: { id: plan.id, status: "active" }, data: { status: "cancelled", cancelledAt: new Date(), nextDueAt: null, stockHeld: 0 } });
    if (moved.count !== 1) return { ok: false, error: "This plan changed. Refresh and try again." };
    await releaseUnits(plan.productId, plan.stockHeld);
    if (store) {
      await messageShopper({ storeId, phone: plan.buyerPhone, email: plan.buyerEmail, name: plan.buyerName, event: "pay_small_cancelled", refId: plan.id, sms: `${store.name}: your Pay small small plan for ${plan.productName} was cancelled by the shop. They will contact you about the ${naira(plan.paidKobo)} you paid.`, email_: { subject: `Plan cancelled: ${plan.productName}`, heading: "Your plan was cancelled", body: `${store.name} cancelled your Pay small small plan for ${plan.productName}. You paid ${naira(plan.paidKobo)}; the shop will contact you about it under their refund rule: "${plan.refundRule}".` } });
    }
    return { ok: true };
  }
  if (plan.status !== "defaulted" && plan.status !== "cancelled") return { ok: false, error: "Refunds are for plans that were missed or cancelled." };
  if (action === "refund") {
    const amount = Math.max(0, Math.min(plan.paidKobo / 100, Math.round(Number(input.amountNaira ?? 0))));
    const note = `Refund ${naira(amount * 100)} of ${naira(plan.paidKobo)} under your rule ("${plan.refundRule}")${input.note ? `: ${input.note}` : ""}. Send it from your own bank, then mark it sent.`.slice(0, 500);
    await db.instalmentPlan.update({ where: { id: plan.id }, data: { refundStatus: amount > 0 ? "manual" : "done", refundNote: note } });
    if (store && amount > 0) {
      await messageShopper({ storeId, phone: plan.buyerPhone, email: plan.buyerEmail, name: plan.buyerName, event: "pay_small_refund", refId: plan.id, sms: `${store.name}: you'll get ${naira(amount * 100)} back from your Pay small small plan for ${plan.productName}. The shop sends it to you directly.`, email_: { subject: `Refund on its way: ${plan.productName}`, heading: "A refund is coming", body: `${store.name} is sending you ${naira(amount * 100)} from your Pay small small plan for ${plan.productName}, under their rule: "${plan.refundRule}". The shop sends it to you directly.` } });
    }
    return { ok: true };
  }
  await db.instalmentPlan.update({ where: { id: plan.id }, data: { refundStatus: "done" } });
  return { ok: true };
}

// ─── The hourly sweep: reminders, autopay, defaults, abandoned starts ─────────

export async function runInstalmentSweep(now = new Date()) {
  const result = { reminded: 0, charged: 0, chargeFailed: 0, defaulted: 0, expired: 0 };
  // Plans whose first part was never paid: let them go.
  result.expired = (await db.instalmentPlan.updateMany({ where: { status: "pending", createdAt: { lt: new Date(now.getTime() - PENDING_PLAN_TTL_MS) } }, data: { status: "cancelled", cancelledAt: now } })).count;

  const plans = await db.instalmentPlan.findMany({ where: { status: "active", nextDueAt: { not: null } }, take: 500, orderBy: { nextDueAt: "asc" } });
  for (const plan of plans) {
    try {
      const n = plan.paidCount + 1;
      const due = plan.nextDueAt!;
      const store = await db.store.findUnique({ where: { id: plan.storeId }, select: { id: true, slug: true, customDomain: true, name: true } });
      if (!store) continue;
      const link = planUrl(store, plan.id);
      const amount = plan.amountsKobo[n - 1] ?? plan.weeklyKobo;

      if (pastGrace(now, due)) {
        const moved = await db.instalmentPlan.updateMany({ where: { id: plan.id, status: "active", paidCount: plan.paidCount }, data: { status: "defaulted", defaultedAt: now, nextDueAt: null, stockHeld: 0 } });
        if (moved.count === 1) {
          result.defaulted += 1;
          await releaseUnits(plan.productId, plan.stockHeld);
          await tellSeller(plan.storeId, { title: `Missed payment: ${plan.buyerName}`, description: `${plan.buyerName} didn't pay part ${n} of ${plan.weeks} for ${plan.productName} within 2 days. The plan is closed. They paid ${naira(plan.paidKobo)}: decide any refund under your rule ("${plan.refundRule}") in Pay small small.`, link: "/home/pay-small", dedupeKey: `pay-small.defaulted:${plan.id}`, priority: "warning" });
          await messageShopper({ storeId: store.id, phone: plan.buyerPhone, email: plan.buyerEmail, name: plan.buyerName, event: "pay_small_defaulted", refId: plan.id, sms: `${store.name}: your Pay small small plan for ${plan.productName} closed because part ${n} wasn't paid. The shop will contact you about what you paid, under their rule.`, email_: { subject: `Plan closed: ${plan.productName}`, heading: "Your plan was closed", body: `part ${n} of your Pay small small plan for ${plan.productName} wasn't paid within 2 days of its due date, so the plan is closed. You paid ${naira(plan.paidKobo)}. ${store.name}'s refund rule: "${plan.refundRule}". The shop will contact you.` } });
        }
        continue;
      }

      if (reminderDue(now, due, n, plan.remindedN)) {
        await db.instalmentPlan.update({ where: { id: plan.id }, data: { remindedN: n } });
        const how = plan.autopay && plan.authorizationCode ? `We'll charge your card ending ${plan.cardLast4 ?? "on file"} tomorrow, or pay now:` : "Pay here:";
        await messageShopper({ storeId: store.id, phone: plan.buyerPhone, email: plan.buyerEmail, name: plan.buyerName, event: "pay_small_reminder", refId: `${plan.id}:${n}`, sms: `${store.name}: part ${n} of ${plan.weeks} for ${plan.productName} (${naira(amount)}) is due tomorrow. ${how} ${link}`, email_: { subject: `Due tomorrow: ${naira(amount)} for ${plan.productName}`, heading: "Your next payment is due tomorrow", body: `part ${n} of ${plan.weeks} for ${plan.productName} (${naira(amount)}) is due ${dayText(due)}. ${plan.autopay && plan.authorizationCode ? "We'll charge your saved card then, or you can pay now." : ""}`, cta: { label: "Pay now", url: link } } });
        result.reminded += 1;
      }

      if (plan.autopay && plan.authorizationCode && plan.authorizationEmail && autopayDue(now, due, n, plan.autopayTriedN)) {
        const claimed = await db.instalmentPlan.updateMany({ where: { id: plan.id, autopayTriedN: { lt: n } }, data: { autopayTriedN: n } });
        if (claimed.count !== 1) continue;
        const amounts = await currentAmounts(plan);
        const part = amounts[n - 1] ?? 0;
        const split = part > 0 ? await partSplit(plan, n, amounts) : null;
        if (!split) continue;
        const reference = newReference(INSTALMENT_REF_PREFIX);
        await db.instalmentPayment.create({ data: { planId: plan.id, n, amountKobo: part, feeKobo: split.platformKobo ?? 0, sellerKobo: split.sellerKobo, reference, via: "autopay", split: JSON.parse(JSON.stringify(split)) } });
        const charged = await chargeSavedCard({ email: plan.authorizationEmail, sealedAuthorization: plan.authorizationCode, amountKobo: part, reference, metadata: { kind: "pay_small", planId: plan.id, n, storeId: plan.storeId, autopay: true }, plan: split });
        if (charged.status === "success") {
          const confirmed = await confirmInstalmentPayment(reference);
          if (confirmed.ok) {
            result.charged += 1;
            continue;
          }
        }
        if (charged.status === "failed") await db.instalmentPayment.updateMany({ where: { reference, status: "pending" }, data: { status: "failed" } });
        result.chargeFailed += 1;
        await messageShopper({ storeId: store.id, phone: plan.buyerPhone, email: plan.buyerEmail, name: plan.buyerName, event: "pay_small_autopay_failed", refId: `${plan.id}:${n}`, sms: `${store.name}: we couldn't charge your card for part ${n} (${naira(part)}) for ${plan.productName}. Pay within 2 days to keep your plan: ${link}`, email_: { subject: `Payment didn't go through: ${plan.productName}`, heading: "We couldn't charge your card", body: `part ${n} of ${plan.weeks} for ${plan.productName} (${naira(part)}) couldn't be charged to your saved card. Pay within 2 days of the due date to keep your plan.`, cta: { label: "Pay now", url: link } } });
      }
    } catch (error) {
      console.error(`[pay-small] sweep failed for plan ${plan.id}`, error);
    }
  }
  return result;
}
