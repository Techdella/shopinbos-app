import "server-only";
import crypto from "node:crypto";
import type { DomainPurchase, Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { getPlanCatalog } from "@/lib/plans/catalog.server";
import { billingEmail } from "@/lib/auth/billing-email";
import { notify } from "@/lib/notifications/notify.server";
import {
  chargePaystackAuthorization,
  initializePaystackTransaction,
  refundPaystackTransaction,
  verifyPaystackTransaction,
} from "@/lib/paystack";
import { naira } from "@shared/onboarding";
import { freeDomainEligible } from "@/lib/seller-plan";
import { getPriceBook } from "@/lib/pricing/price-book.server";
import { domainOrdersOf } from "./orders";
import { markPurchasedDomainVerified, releaseStoreDomain } from "./ownership.server";
import { normalizeDomain } from "./storefront";
import {
  VercelApiError,
  assignDomainOnVercel,
  buyDomainOnVercel,
  getDomainAvailabilityOnVercel,
  getDomainOrderOnVercel,
  getDomainPriceOnVercel,
  renewDomainOnVercel,
  setDomainAutoRenewOnVercel,
  type VercelContactInformation,
} from "./vercel";
import {
  addOneYear,
  daysLeft,
  dueReminder,
  expiryDecision,
  latestBoughtPerDomain,
  maxBuyUsd,
  nairaPriceForUsd,
  readSavedAuthorization,
  remindersOf,
  savedAuthorization,
  shouldAutoCharge,
  storeHasDomainPurchase,
  withinMaxUsd,
  type DomainPricingConfig,
  type DomainPurchaseKind,
  type SavedAuthorization,
} from "./billing-pure";

// Buying and renewing domains through Shopinbos, paid by the seller first.
//
//   checkout (pending_payment) → Paystack → completeDomainPayment (callback or webhook, either order, any number
//   of times) → verified like the store launch payment → paid → ONE caller moves it paid → buying with a
//   conditional UPDATE → Vercel buy/renew (autoRenew false, maxPrice = quoted cost + a little) → the registrar
//   order completes → bought (+ attached to the store). If the registrar refuses, the payment is refunded through
//   Paystack (refunded, or refund_failed for the team). Vercel is never called without a verified payment.
//
// The daily cron (runDomainRenewals) finishes orders still in progress, reminds 30/7/1 days before expiry, tries
// the saved card 7 days before, and takes an unrenewed domain off the store 3 days after it expires.

export const DOMAIN_REFERENCE_PREFIX = "domain-";
/** Free rows (annual plan) get their own prefix: no Paystack transaction ever has it, so no webhook reaches them. */
export const PLAN_REFERENCE_PREFIX = "plan-";
const PURPOSE: Record<DomainPurchaseKind, string> = { new: "domain_purchase", renewal: "domain_renewal" };

export class DomainBillingError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "DomainBillingError";
  }
}

export function domainPurchaseEnabled() {
  return process.env.DOMAIN_PURCHASE_ENABLED === "true";
}

/** Exchange rate, markup and USD cap from Admin › Pricing (defaults: the old DOMAIN_* environment variables). */
export async function domainPricing(): Promise<DomainPricingConfig> {
  const book = await getPriceBook();
  return { usdNgnRate: book["domains.usd_rate"], markupNgn: book["domains.markup"], maxUsd: book["domains.max_usd"] };
}

/** Naira prices for a search result (null when we don't sell it: no price, or above DOMAIN_PURCHASE_MAX_USD). */
export function nairaQuote(purchaseUsd: number | null | undefined, renewalUsd: number | null | undefined, config: DomainPricingConfig) {
  if (!withinMaxUsd(purchaseUsd, config)) return { priceNgn: null, renewalNgn: null };
  return { priceNgn: nairaPriceForUsd(purchaseUsd, config), renewalNgn: nairaPriceForUsd(renewalUsd ?? purchaseUsd, config) };
}

/** The registrar's price right now (USD) and what the seller pays. Throws DomainBillingError when we don't sell it. */
export async function quoteDomain(rawDomain: string, kind: DomainPurchaseKind) {
  const domain = normalizeDomain(rawDomain);
  const config = await domainPricing();
  const price = await getDomainPriceOnVercel(domain, 1);
  const costUsd = kind === "new" ? price.purchasePrice : price.renewalPrice;
  if (!withinMaxUsd(costUsd, config)) {
    throw new DomainBillingError("too_expensive", "This domain costs more than we can sell here. Pick another name.", 409);
  }
  const amountNgn = nairaPriceForUsd(costUsd, config)!;
  const renewalNgn = nairaPriceForUsd(price.renewalPrice, config) ?? amountNgn;
  return { domain, costUsd, amountNgn, renewalNgn };
}

function reference() {
  return `${DOMAIN_REFERENCE_PREFIX}${crypto.randomUUID()}`;
}

function asJson(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function plainError(error: unknown) {
  return (error instanceof Error ? error.message : String(error ?? "unknown error")).slice(0, 400);
}

/** A row the seller's annual plan paid for: there is no Paystack payment behind it, so nothing to verify or refund. */
export function isPlanCovered(row: Pick<DomainPurchase, "coveredByPlan" | "amountNgn">) {
  return row.coveredByPlan || row.amountNgn <= 0;
}

const PLAN_SELECT = { planCode: true, planInterval: true, planStatus: true, planPaidUntil: true } as const;

/** Whether the seller's plan pays for a domain now (renewalStartsAt: the domain's current expiry, for a renewal). */
export async function sellerGetsFreeDomain(userId: string, now = new Date(), renewalStartsAt?: Date | null) {
  const [user] = await Promise.all([db.user.findUnique({ where: { id: userId }, select: PLAN_SELECT }), getPlanCatalog()]);
  return renewalStartsAt === undefined ? freeDomainEligible(user, now) : freeDomainEligible(user, now, renewalStartsAt);
}

/**
 * A domain (or renewal) the seller's annual plan pays for: recorded as paid with amountNgn 0 and coveredByPlan, no
 * Paystack, then bought through the same buyOrRenew path. Callers check eligibility on the server first.
 */
export async function startPlanCoveredDomain(input: {
  userId: string;
  storeId: string;
  domain: string;
  kind: DomainPurchaseKind;
  costUsd: number;
  contactInformation: VercelContactInformation | null;
}) {
  const row = await db.domainPurchase.create({
    data: {
      storeId: input.storeId,
      userId: input.userId,
      domain: input.domain,
      kind: input.kind,
      years: 1,
      costUsd: input.costUsd,
      amountNgn: 0,
      coveredByPlan: true,
      reference: `${PLAN_REFERENCE_PREFIX}${crypto.randomUUID()}`,
      status: "paid",
      paidAt: new Date(),
      ...(input.contactInformation ? { contactInformation: asJson(input.contactInformation) } : {}),
    },
  });
  await buyOrRenew(row);
  return (await db.domainPurchase.findUnique({ where: { id: row.id } }))!;
}

/**
 * Creates the pending_payment row and the Paystack checkout. The seller pays on Paystack and comes back through
 * /api/billing/domain/callback.
 */
export async function startDomainCheckout(input: {
  user: { id: string; email: string | null };
  storeId: string;
  domain: string;
  kind: DomainPurchaseKind;
  costUsd: number;
  amountNgn: number;
  contactInformation: VercelContactInformation | null;
  callbackUrl: string;
}) {
  const email = billingEmail(input.user);
  const row = await db.domainPurchase.create({
    data: {
      storeId: input.storeId,
      userId: input.user.id,
      domain: input.domain,
      kind: input.kind,
      years: 1,
      costUsd: input.costUsd,
      amountNgn: input.amountNgn,
      reference: reference(),
      status: "pending_payment",
      payerEmail: email,
      ...(input.contactInformation ? { contactInformation: asJson(input.contactInformation) } : {}),
    },
  });
  try {
    const payment = await initializePaystackTransaction({
      email,
      amountKobo: input.amountNgn * 100,
      reference: row.reference,
      callbackUrl: input.callbackUrl,
      metadata: {
        purpose: PURPOSE[input.kind],
        store_id: input.storeId,
        user_id: input.user.id,
        domain: input.domain,
        purchase_id: row.id,
      },
    });
    return { authorizationUrl: payment.authorization_url!, amountNgn: input.amountNgn, reference: row.reference };
  } catch (error) {
    await db.domainPurchase.updateMany({ where: { id: row.id, status: "pending_payment" }, data: { status: "payment_failed", error: plainError(error) } });
    throw new DomainBillingError("checkout_failed", "We couldn't open the payment page. Try again in a minute.", 502);
  }
}

/** Checks Paystack's record of the payment against the row, exactly like the store launch payment, then marks it paid. */
async function recordVerifiedPayment(row: DomainPurchase) {
  if (isPlanCovered(row)) throw new DomainBillingError("not_found", "Payment record was not found.", 404);
  const verified = await verifyPaystackTransaction(row.reference);
  if (verified.status !== "success") {
    throw new DomainBillingError("not_paid", "Paystack hasn't confirmed this payment.");
  }
  if (verified.currency !== "NGN" || verified.amount !== row.amountNgn * 100) {
    throw new DomainBillingError("amount_mismatch", "Paystack did not confirm the expected payment amount.");
  }
  const metadata = verified.metadata ?? {};
  if (
    verified.reference !== row.reference ||
    metadata.purpose !== PURPOSE[row.kind as DomainPurchaseKind] ||
    metadata.store_id !== row.storeId ||
    metadata.user_id !== row.userId ||
    metadata.purchase_id !== row.id ||
    metadata.domain !== row.domain
  ) {
    throw new DomainBillingError("details_mismatch", "Paystack returned payment details that do not match this domain.");
  }
  const user = await db.user.findUnique({ where: { id: row.userId }, select: { id: true, email: true } });
  const customer = verified.customer?.email?.toLowerCase() ?? "";
  const allowed = new Set([user ? billingEmail(user) : "", row.payerEmail?.toLowerCase() ?? ""].filter(Boolean));
  if (!user || !customer || !allowed.has(customer)) {
    throw new DomainBillingError("customer_mismatch", "The Paystack customer does not match this Shopinbos account.");
  }
  const authorization = savedAuthorization(verified.authorization, customer);
  await db.domainPurchase.updateMany({
    where: { id: row.id, status: { in: ["pending_payment", "payment_failed"] } },
    data: { status: "paid", paidAt: new Date(), error: null, ...(authorization ? { paystackAuthorization: asJson(authorization) } : {}) },
  });
}

/**
 * Finishes a paid domain checkout. Idempotent and safe to call from the Paystack callback, the webhook and the
 * cron at the same time: only a verified payment moves to paid, and only one caller moves paid → buying.
 */
export async function completeDomainPayment(ref: string) {
  let row = await db.domainPurchase.findUnique({ where: { reference: ref } });
  // Plan-covered rows have no Paystack payment: a callback or webhook naming one (a made-up reference) does nothing.
  if (!row || isPlanCovered(row)) throw new DomainBillingError("not_found", "Payment record was not found.", 404);
  if (row.status === "pending_payment" || row.status === "payment_failed") {
    await recordVerifiedPayment(row);
    row = (await db.domainPurchase.findUnique({ where: { id: row.id } }))!;
  }
  if (row.status === "paid") {
    await buyOrRenew(row);
  } else if (row.status === "buying" && row.vercelOrderId) {
    await settleDomainOrder(row.id, 0);
  }
  return (await db.domainPurchase.findUnique({ where: { id: row.id } }))!;
}

/** The registrar clearly said no (4xx) or our own checks did before anything was bought: safe to refund. */
class Refusal extends Error {}

function refusedByRegistrar(error: unknown) {
  return error instanceof Refusal || (error instanceof VercelApiError && error.status >= 400 && error.status < 500 && error.status !== 429);
}

async function buyOrRenew(row: DomainPurchase) {
  const claimed = await db.domainPurchase.updateMany({ where: { id: row.id, status: "paid" }, data: { status: "buying" } });
  if (claimed.count !== 1) return; // someone else is buying it

  const maxPrice = maxBuyUsd(row.costUsd);
  // Checks before anything is bought. A refusal here refunds; a network error puts it back to "paid" for the cron.
  try {
    if (row.kind === "new") {
      const others = await db.domainPurchase.findMany({ where: { storeId: row.storeId, kind: "new" }, select: { id: true, kind: true, status: true } });
      if (storeHasDomainPurchase(others, row.id)) throw new Refusal("This store already has a domain from us.");
      const availability = await getDomainAvailabilityOnVercel(row.domain);
      if (!availability.available) throw new Refusal("Someone else bought this domain before your payment went through.");
    }
    const price = await getDomainPriceOnVercel(row.domain, 1);
    const cost = row.kind === "new" ? price.purchasePrice : price.renewalPrice;
    if (!(cost <= maxPrice)) throw new Refusal("The domain company raised the price after you paid.");
  } catch (error) {
    if (refusedByRegistrar(error)) {
      await refundPurchase(row.id, plainError(error));
    } else {
      await db.domainPurchase.updateMany({ where: { id: row.id, status: "buying", vercelOrderId: null }, data: { status: "paid", error: plainError(error) } });
    }
    return;
  }

  try {
    const contactInformation = (row.contactInformation ?? undefined) as VercelContactInformation | undefined;
    const result =
      row.kind === "new"
        ? await buyDomainOnVercel(row.domain, { years: 1, autoRenew: false, maxPrice, contactInformation: contactInformation! })
        : await renewDomainOnVercel(row.domain, { years: 1, maxPrice, contactInformation });
    const orderId = String(result.orderId);
    await db.domainPurchase.update({ where: { id: row.id }, data: { vercelOrderId: orderId, error: null } });
    if (row.kind === "new") await rememberOrderOnStore(row.storeId, orderId);
  } catch (error) {
    if (refusedByRegistrar(error)) {
      await refundPurchase(row.id, plainError(error));
    } else {
      // We can't tell whether the registrar took the order (timeout, 5xx). Leave it "buying" for the team.
      await db.domainPurchase.update({ where: { id: row.id }, data: { error: `Unclear if the registrar took the order: ${plainError(error)}` } });
      console.error(`[domain billing] ${row.reference}: registrar call failed, needs checking`, error);
    }
    return;
  }

  await settleDomainOrder(row.id, 10_000);
}

/** The order route (/api/domains/order/[orderId]) only shows orders listed on the store. */
async function rememberOrderOnStore(storeId: string, orderId: string) {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { brandSettings: true } });
  if (!store) return;
  const orders = domainOrdersOf(store.brandSettings);
  if (orders.includes(orderId)) return;
  const settings = store.brandSettings && typeof store.brandSettings === "object" && !Array.isArray(store.brandSettings) ? (store.brandSettings as Record<string, unknown>) : {};
  await db.store.update({ where: { id: storeId }, data: { brandSettings: asJson({ ...settings, domainOrders: [...orders, orderId].slice(-20) }) } });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Checks the registrar order of a "buying" row; waits up to `waitMs` for it to finish. */
export async function settleDomainOrder(id: string, waitMs = 0) {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const row = await db.domainPurchase.findUnique({ where: { id } });
    if (!row || row.status !== "buying" || !row.vercelOrderId) return row;
    let status: string;
    let reason = "";
    try {
      const order = await getDomainOrderOnVercel(row.vercelOrderId);
      status = order.status;
      reason = order.error?.code ?? order.domains[0]?.error?.code ?? "";
    } catch (error) {
      console.error(`[domain billing] could not read order ${row.vercelOrderId}`, error);
      return row;
    }
    if (status === "completed") {
      await finishBought(row);
      return db.domainPurchase.findUnique({ where: { id } });
    }
    if (status === "failed") {
      await refundPurchase(row.id, `The registrar order failed${reason ? ` (${reason})` : ""}.`);
      return db.domainPurchase.findUnique({ where: { id } });
    }
    if (Date.now() + 2000 > deadline) return row;
    await sleep(2000);
  }
}

async function latestBought(storeId: string, domain: string, exceptId?: string) {
  return db.domainPurchase.findFirst({
    where: { storeId, domain, status: "bought", ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    orderBy: { expiresAt: "desc" },
  });
}

async function finishBought(row: DomainPurchase) {
  const base = row.kind === "renewal" ? await latestBought(row.storeId, row.domain, row.id) : null;
  const expiresAt = row.kind === "renewal" ? addOneYear(base?.expiresAt ?? new Date()) : addOneYear(row.paidAt ?? new Date());
  const moved = await db.domainPurchase.updateMany({ where: { id: row.id, status: "buying" }, data: { status: "bought", expiresAt, error: null } });
  if (moved.count !== 1) return;

  // Vercel must never renew on our bill: the seller pays each year first.
  await setDomainAutoRenewOnVercel(row.domain, false).catch((error) => console.warn(`[domain billing] auto-renew off for ${row.domain} failed`, plainError(error)));

  const when = expiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  if (row.kind === "renewal") {
    if (row.coveredByPlan) {
      await tellSeller(row, `renewed:${row.id}`, "info", `${row.domain} renewed free with your annual plan`, `Your domain now runs until ${when}. Nothing to pay.`);
      return;
    }
    await tellSeller(row, `renewed:${row.id}`, "success", `${row.domain} is renewed`, `Your domain now runs until ${when}. Nothing else to do.`);
    return;
  }

  // Attach it the same way the order route did: add to the hosting project, then mark it verified on the store.
  let attachNote = "";
  try {
    const assigned = await assignDomainOnVercel(row.domain);
    if (!(await markPurchasedDomainVerified(row.storeId, assigned.domain))) {
      attachNote = "Bought, but the domain is connected to another store.";
    }
  } catch (error) {
    attachNote = `Bought, but adding it to the store failed: ${plainError(error)}`;
  }
  if (attachNote) await db.domainPurchase.update({ where: { id: row.id }, data: { error: attachNote } });
  await tellSeller(
    row,
    `bought:${row.id}`,
    "success",
    `${row.domain} is yours`,
    `Your shop will open at ${row.domain} in a few minutes. It runs until ${when}; ${row.coveredByPlan ? "it renews free while you stay on an annual plan" : "we remind you before it's due"}. Check your email in the next 15 days: the domain company sends a message to confirm your email. If you don't confirm, the domain is paused.`,
  );
}

/** Refunds a paid purchase the registrar refused. Only the caller that moves it to "failed" sends the refund. */
async function refundPurchase(id: string, reason: string) {
  const claimed = await db.domainPurchase.updateMany({ where: { id, status: { in: ["paid", "buying"] } }, data: { status: "failed", error: reason } });
  if (claimed.count !== 1) return;
  const row = (await db.domainPurchase.findUnique({ where: { id } }))!;
  const amount = naira(row.amountNgn);
  const what = row.kind === "renewal" ? `renew ${row.domain}` : `buy ${row.domain}`;
  if (isPlanCovered(row)) {
    // Free with the annual plan: nothing was charged, so nothing goes to Paystack. It stays "failed".
    await tellSeller(
      row,
      `free_failed:${id}`,
      "warning",
      `We couldn't ${what}`,
      row.kind === "renewal"
        ? `${reason} Nothing was charged. We'll remind you before it ends so you can renew it.`
        : `${reason} Nothing was charged. Pick another name, or tap Help and we'll sort it out.`,
    );
    return;
  }
  try {
    await refundPaystackTransaction(row.reference);
    await db.domainPurchase.update({ where: { id }, data: { status: "refunded" } });
    await tellSeller(row, `refunded:${id}`, "warning", `We couldn't ${what}`, `${reason} We've sent your ${amount} back to your card or account. It can take a few days to show.`);
  } catch (error) {
    await db.domainPurchase.update({ where: { id }, data: { status: "refund_failed", error: `${reason} Refund failed: ${plainError(error)}`.slice(0, 500) } });
    console.error(`[domain billing] refund of ${row.reference} failed`, error);
    await tellSeller(row, `refund_failed:${id}`, "critical", `We couldn't ${what}`, `${reason} Our team will send your ${amount} back to you within 2 working days. You don't need to do anything.`);
  }
}

async function tellSeller(
  row: Pick<DomainPurchase, "userId" | "domain">,
  key: string,
  priority: "success" | "warning" | "critical" | "info",
  title: string,
  description: string,
  action?: { label: string; url: string },
) {
  await notify({
    userId: row.userId,
    event: "account.update",
    type: "system",
    priority,
    title,
    description,
    link: action?.url ?? "/home/domain",
    actionLabel: action?.label ?? null,
    actionUrl: action?.url ?? null,
    email: "transactional",
    dedupeKey: `domain:${key}`.slice(0, 190),
  }).catch((error) => console.error("[domain billing] could not notify seller", error));
}

// ── Renewal by the seller (a Paystack checkout) ───────────────────────────────

/** The bought domain this store renews, and whether a renewal is already under way. */
export async function renewableDomain(storeId: string, rawDomain: string) {
  const domain = normalizeDomain(rawDomain);
  const base = await latestBought(storeId, domain);
  if (!base) throw new DomainBillingError("not_found", "We can only renew domains you bought through Shopinbos.", 404);
  const inProgress = await db.domainPurchase.findFirst({ where: { storeId, domain, kind: "renewal", status: { in: ["paid", "buying"] } }, select: { id: true } });
  if (inProgress) throw new DomainBillingError("renewing", "We're already renewing this domain.", 409);
  return base;
}

// ── Daily renewals cron ───────────────────────────────────────────────────────

const STALE_MS = 10 * 60_000;

async function savedCardFor(storeId: string, domain: string): Promise<SavedAuthorization | null> {
  const rows = await db.domainPurchase.findMany({
    where: { storeId, domain, status: "bought" },
    orderBy: { paidAt: "desc" },
    select: { paystackAuthorization: true },
    take: 10,
  });
  for (const row of rows) {
    const card = readSavedAuthorization(row.paystackAuthorization);
    if (card?.reusable) return card;
  }
  return null;
}

/** Set on a bought domain once the seller has taken its transfer code (see /api/domains/transfer). */
export const MOVING_MARK = "moving";

/** The seller is moving the domain to another company: no more renewal charges or reminders for it. */
export async function markDomainMoving(storeId: string, domain: string) {
  const row = await latestBought(storeId, domain);
  if (row) await markReminders(row.id, row.remindersSent, [MOVING_MARK]);
}

async function markReminders(id: string, current: unknown, add: string[]) {
  const next = [...new Set([...remindersOf(current), ...add])];
  await db.domainPurchase.update({ where: { id }, data: { remindersSent: asJson(next) } });
}

async function tryCard(row: DomainPurchase, card: SavedAuthorization) {
  // Recorded first, so a crash halfway never charges twice.
  await markReminders(row.id, row.remindersSent, ["charge"]);
  let quote: Awaited<ReturnType<typeof quoteDomain>>;
  try {
    quote = await quoteDomain(row.domain, "renewal");
  } catch (error) {
    console.warn(`[domain renewals] no renewal price for ${row.domain}`, plainError(error));
    return false;
  }
  const user = await db.user.findUnique({ where: { id: row.userId }, select: { id: true, email: true } });
  if (!user) return false;
  const email = card.email ?? billingEmail(user);
  const renewal = await db.domainPurchase.create({
    data: {
      storeId: row.storeId,
      userId: row.userId,
      domain: row.domain,
      kind: "renewal",
      years: 1,
      costUsd: quote.costUsd,
      amountNgn: quote.amountNgn,
      reference: reference(),
      status: "pending_payment",
      payerEmail: email,
      ...(row.contactInformation ? { contactInformation: asJson(row.contactInformation) } : {}),
    },
  });
  let result: { status: string; message: string };
  try {
    result = await chargePaystackAuthorization({
      email,
      amountKobo: quote.amountNgn * 100,
      authorizationCode: card.authorization_code,
      reference: renewal.reference,
      metadata: { purpose: PURPOSE.renewal, store_id: row.storeId, user_id: row.userId, domain: row.domain, purchase_id: renewal.id, auto: true },
    });
  } catch (error) {
    result = { status: "failed", message: plainError(error) };
  }
  if (result.status === "success") {
    const done = await completeDomainPayment(renewal.reference).catch((error) => {
      console.error(`[domain renewals] completing ${renewal.reference} failed`, error);
      return null;
    });
    return done?.status === "bought";
  }
  if (result.status === "failed") {
    await db.domainPurchase.updateMany({ where: { id: renewal.id, status: "pending_payment" }, data: { status: "payment_failed", error: result.message.slice(0, 400) } });
    await tellSeller(
      row,
      `card_failed:${renewal.id}`,
      "warning",
      `Your card didn't go through for ${row.domain}`,
      `We tried to renew ${row.domain} for ${naira(quote.amountNgn)} with your saved card${card.last4 ? ` ending ${card.last4}` : ""}, and it didn't work. Renew it yourself before it ends so your shop keeps this address.`,
      { label: `Renew for ${naira(quote.amountNgn)}`, url: renewLink(row.domain) },
    );
  }
  // Anything else (the bank asked for an OTP): the webhook completes it if it goes through; reminders continue.
  return false;
}

/** How early (days before expiry) a plan-covered renewal is tried, and the mark that it was. */
const FREE_RENEWAL_DAYS = 30;
const FREE_TRIED_MARK = "free";

async function renewFreeWithPlan(row: DomainPurchase) {
  // Recorded first, so a crash halfway never renews twice on our bill.
  await markReminders(row.id, row.remindersSent, [FREE_TRIED_MARK]);
  let costUsd: number;
  try {
    costUsd = (await quoteDomain(row.domain, "renewal")).costUsd;
  } catch (error) {
    console.warn(`[domain renewals] no free renewal for ${row.domain}`, plainError(error));
    return false;
  }
  const renewal = await startPlanCoveredDomain({
    userId: row.userId,
    storeId: row.storeId,
    domain: row.domain,
    kind: "renewal",
    costUsd,
    contactInformation: (row.contactInformation ?? null) as VercelContactInformation | null,
  });
  // "buying"/"paid" finish later (cron); the renewal row then carries the new expiry.
  return renewal.status === "bought" || renewal.status === "buying" || renewal.status === "paid";
}

function renewLink(domain: string) {
  return `/home/domain?renew=${encodeURIComponent(domain)}`;
}

async function sendReminder(row: DomainPurchase, key: string, now: Date) {
  let amount = row.amountNgn;
  try {
    amount = (await quoteDomain(row.domain, "renewal")).amountNgn;
  } catch {
    // Keep last year's price in the message; the checkout always uses the live price.
  }
  const left = Math.max(1, daysLeft(row.expiresAt!, now));
  await tellSeller(
    row,
    `reminder:${row.id}:${key}`,
    left <= 7 ? "warning" : "info",
    `${row.domain} ends in ${left} ${left === 1 ? "day" : "days"}`,
    `Renew it for ${naira(amount)} so your shop keeps this address. If it isn't renewed, your shop goes back to its free Shopinbos address.`,
    { label: `Renew for ${naira(amount)}`, url: renewLink(row.domain) },
  );
}

export async function runDomainRenewals(now = new Date()) {
  const summary = { retried: 0, settled: 0, reminded: 0, charged: 0, renewedFree: 0, expired: 0, errors: 0 };
  const stale = new Date(now.getTime() - STALE_MS);

  // 1. Paid but not sent to the registrar (a network error last time): try again.
  for (const row of await db.domainPurchase.findMany({ where: { status: "paid", updatedAt: { lt: stale } }, take: 50 })) {
    try {
      await buyOrRenew(row);
      summary.retried++;
    } catch (error) {
      summary.errors++;
      console.error(`[domain renewals] retry ${row.reference} failed`, error);
    }
  }

  // 2. Registrar orders still in progress.
  for (const row of await db.domainPurchase.findMany({ where: { status: "buying", NOT: { vercelOrderId: null } }, take: 100 })) {
    const after = await settleDomainOrder(row.id, 0).catch(() => null);
    if (after && after.status !== "buying") summary.settled++;
  }

  // 3. Bought domains: reminders, the saved card, expiry.
  const bought = await db.domainPurchase.findMany({ where: { status: "bought", NOT: { expiresAt: null } } });
  const renewing = new Set(
    (await db.domainPurchase.findMany({ where: { kind: "renewal", status: { in: ["paid", "buying"] } }, select: { storeId: true, domain: true } }))
      .map((row) => `${row.storeId}|${row.domain}`),
  );
  for (const row of latestBoughtPerDomain(bought)) {
    if (renewing.has(`${row.storeId}|${row.domain}`)) continue;
    try {
      const decision = expiryDecision(row.expiresAt!, now);
      // The seller took the transfer code to move the domain to another company: we stop charging and reminding,
      // and at the end we don't detach it from the store (it may live on with the new company).
      const moving = remindersOf(row.remindersSent).includes(MOVING_MARK);
      if (moving) {
        if (decision === "expire") await db.domainPurchase.updateMany({ where: { storeId: row.storeId, domain: row.domain, status: "bought" }, data: { status: "expired" } });
        continue;
      }
      if (decision === "expire") {
        await releaseStoreDomain(row.storeId, row.domain);
        const moved = await db.domainPurchase.updateMany({ where: { storeId: row.storeId, domain: row.domain, status: "bought" }, data: { status: "expired" } });
        if (moved.count > 0) {
          summary.expired++;
          await tellSeller(
            row,
            `expired:${row.id}`,
            "critical",
            `${row.domain} has ended`,
            "It wasn't renewed, so your shop is back on its free Shopinbos address. Your products and orders are all still there. Talk to us if you want the domain back.",
          );
        }
        continue;
      }
      if (decision !== "active") continue;

      const sent = remindersOf(row.remindersSent);
      // Annual plan, paid up past the date the domain's next year starts: renew free (once tried, the normal
      // reminders and the saved card take over if it didn't work).
      if (daysLeft(row.expiresAt!, now) <= FREE_RENEWAL_DAYS && !sent.includes(FREE_TRIED_MARK) && (await sellerGetsFreeDomain(row.userId, now, row.expiresAt))) {
        if (await renewFreeWithPlan(row)) {
          summary.renewedFree++;
          continue;
        }
      }
      const card = await savedCardFor(row.storeId, row.domain);
      if (shouldAutoCharge(row.expiresAt!, sent, now, Boolean(card?.reusable))) {
        if (await tryCard(row, card!)) {
          summary.charged++;
          continue; // renewed: the reminders belong to the new row
        }
      }
      const fresh = await db.domainPurchase.findUnique({ where: { id: row.id }, select: { remindersSent: true } });
      const reminder = dueReminder(row.expiresAt!, remindersOf(fresh?.remindersSent), now);
      if (reminder.markSent.length) await markReminders(row.id, fresh?.remindersSent, reminder.markSent);
      if (reminder.send) {
        await sendReminder(row, reminder.send, now);
        summary.reminded++;
      }
    } catch (error) {
      summary.errors++;
      console.error(`[domain renewals] ${row.domain} failed`, error);
    }
  }
  return summary;
}

/** For the seller's screens: never the contact details or the card token. */
export function publicPurchase(row: DomainPurchase) {
  const card = readSavedAuthorization(row.paystackAuthorization);
  return {
    id: row.id,
    domain: row.domain,
    kind: row.kind,
    status: row.status,
    amountNgn: row.amountNgn,
    coveredByPlan: row.coveredByPlan,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    paidAt: row.paidAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    card: card ? { last4: card.last4, brand: card.brand, reusable: card.reusable } : null,
  };
}
