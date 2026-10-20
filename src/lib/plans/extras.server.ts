import "server-only";
import crypto from "node:crypto";
import { db } from "@/lib/db/client";
import { billingEmail } from "@/lib/auth/billing-email";
import { initializePaystackTransaction, verifyPaystackTransaction } from "@/lib/paystack";
import { getPriceBook } from "@/lib/pricing/price-book.server";
import { westAfricaCountries } from "@/lib/data/west-africa";
import {
  EXTRA_REFERENCE_PREFIX,
  EXTRA_ROLE,
  MESSAGES_PER_PACK,
  cleanExtraQuantity,
  extraNeedsTarget,
  extraUnitPrice,
  extraWindow,
  isExtraKind,
  type ExtraKind,
} from "@shared/plan-extras";
import { planKeyFor, supplierLimits } from "@shared/plans";

// Buying add-ons and boosts (shared/plan-extras.ts): a Paystack checkout per purchase, credited once by reference
// from the callback or the webhook, whichever comes first. Seats and boosts become a dated window; message packs
// add to MessageBalance.

export class ExtraError extends Error {}

const ALL_REGIONS = new Set(westAfricaCountries.flatMap((country) => country.regions.map((region) => region.toLowerCase())));

/** The thing a boost is for, checked against the buyer: their own product, or a real state. */
async function cleanTarget(userId: string, kind: ExtraKind, target: unknown): Promise<string | null> {
  if (!extraNeedsTarget(kind)) return null;
  const value = typeof target === "string" ? target.trim() : "";
  if (kind === "product_boost") {
    const product = value ? await db.supplierProduct.findFirst({ where: { id: value, supplier: { userId } }, select: { id: true } }) : null;
    if (!product) throw new ExtraError("Choose one of your products to boost.");
    return product.id;
  }
  if (!ALL_REGIONS.has(value.toLowerCase())) throw new ExtraError("Choose the state you want to be featured in.");
  return westAfricaCountries.flatMap((country) => country.regions).find((region) => region.toLowerCase() === value.toLowerCase()) ?? value;
}

export async function startExtraCheckout(input: {
  user: { id: string; email: string | null; role: string };
  kind: unknown;
  quantity: unknown;
  target?: unknown;
  origin: string;
  returnTo: string;
}) {
  if (!isExtraKind(input.kind)) throw new ExtraError("Choose what you'd like to buy.");
  const kind = input.kind;
  if (EXTRA_ROLE[kind] !== input.user.role) throw new ExtraError("That isn't available for your kind of account.");
  const quantity = cleanExtraQuantity(input.quantity);
  if (!quantity) throw new ExtraError("Choose how many (1 to 12).");
  const targetId = await cleanTarget(input.user.id, kind, input.target);
  const unit = extraUnitPrice(await getPriceBook(), kind);
  const amountKobo = Math.round(unit * quantity * 100);
  const reference = `${EXTRA_REFERENCE_PREFIX}${crypto.randomUUID()}`;
  await db.planExtraPurchase.create({ data: { reference, userId: input.user.id, kind, quantity, targetId, amountKobo } });
  const callbackUrl = new URL("/api/app/extras/callback", input.origin);
  callbackUrl.searchParams.set("returnTo", input.returnTo);
  const session = await initializePaystackTransaction({
    email: billingEmail(input.user),
    amountKobo,
    reference,
    callbackUrl: callbackUrl.toString(),
    metadata: { purpose: "plan_extra", user_id: input.user.id, kind, quantity, target_id: targetId },
  });
  return { authorizationUrl: session.authorization_url, reference };
}

/** The end of the latest running seat or boost for the same thing, so a new one queues after it. */
async function latestEnd(userId: string, kind: ExtraKind, targetId: string | null) {
  const row = await db.planExtraPurchase.findFirst({
    where: { userId, kind, targetId, status: "paid", endsAt: { gt: new Date() } },
    orderBy: { endsAt: "desc" },
    select: { endsAt: true },
  });
  return row?.endsAt ?? null;
}

/** Credits a verified purchase once. "paid" when it's (now or already) in. */
export async function completeExtraPurchase(reference: string): Promise<"paid" | "failed" | "pending"> {
  const row = await db.planExtraPurchase.findUnique({ where: { reference } });
  if (!row) throw new ExtraError("We couldn't find that purchase.");
  if (row.status === "paid") return "paid";
  const verified = await verifyPaystackTransaction(reference);
  if (verified.status !== "success") {
    if (verified.status === "failed" || verified.status === "abandoned" || verified.status === "reversed") {
      await db.planExtraPurchase.updateMany({ where: { reference, status: "pending" }, data: { status: "failed", error: `Paystack: ${verified.status}` } });
      return "failed";
    }
    return "pending";
  }
  const user = await db.user.findUnique({ where: { id: row.userId }, select: { id: true, email: true } });
  const metadata = (verified.metadata ?? {}) as Record<string, unknown>;
  if (
    !user ||
    verified.currency !== "NGN" ||
    Number(verified.amount) !== row.amountKobo ||
    metadata.purpose !== "plan_extra" ||
    metadata.user_id !== row.userId ||
    (verified.customer?.email?.toLowerCase() ?? null) !== billingEmail(user)
  ) {
    await db.planExtraPurchase.updateMany({ where: { reference, status: "pending" }, data: { status: "failed", error: "Payment details didn't match" } });
    throw new ExtraError("That payment doesn't match this purchase. Contact support if you were charged.");
  }
  const kind = row.kind as ExtraKind;
  const window = extraWindow(kind, row.quantity, await latestEnd(row.userId, kind, row.targetId), new Date());
  await db.$transaction(async (tx) => {
    const moved = await tx.planExtraPurchase.updateMany({
      where: { reference, status: "pending" },
      data: { status: "paid", paidAt: new Date(), error: null, startsAt: window.startsAt, endsAt: window.endsAt },
    });
    if (moved.count !== 1) return;
    if (kind === "sms_pack" || kind === "whatsapp_pack") {
      const messages = row.quantity * MESSAGES_PER_PACK;
      const channel = kind === "sms_pack" ? "sms" : "whatsapp";
      await tx.messageBalance.upsert({ where: { userId: row.userId }, create: { userId: row.userId, [channel]: messages }, update: { [channel]: { increment: messages } } });
    }
  });
  return "paid";
}

// ─── What's running ──────────────────────────────────────────────────────────

const running = (now = new Date()) => ({ status: "paid", startsAt: { lte: now }, endsAt: { gt: now } });

/** Extra staff seats a seller has paid for this month. */
export async function extraStaffSeats(userId: string) {
  const rows = await db.planExtraPurchase.findMany({ where: { userId, kind: "staff_seat", ...running() }, select: { quantity: true } });
  return rows.reduce((sum, row) => sum + row.quantity, 0);
}

/** Supplier user ids featured right now (bought weeks and Pro's own weeks). */
export async function featuredSupplierUserIds() {
  const rows = await db.planExtraPurchase.findMany({ where: { kind: "supplier_boost", ...running() }, select: { userId: true }, distinct: ["userId"] }).catch(() => []);
  return rows.map((row) => row.userId);
}

/** Supplier products boosted right now. */
export async function boostedProductIds() {
  const rows = await db.planExtraPurchase.findMany({ where: { kind: "product_boost", ...running() }, select: { targetId: true }, distinct: ["targetId"] }).catch(() => []);
  return rows.map((row) => row.targetId).filter((id): id is string => Boolean(id));
}

/** Delivery partner user ids featured right now, in `state` when given. */
export async function featuredPartnerUserIds(state?: string | null) {
  const rows = await db.planExtraPurchase
    .findMany({ where: { kind: "logistics_boost", ...running(), ...(state ? { targetId: { equals: state, mode: "insensitive" as const } } : {}) }, select: { userId: true }, distinct: ["userId"] })
    .catch(() => []);
  return rows.map((row) => row.userId);
}

/** A user's boosts and seats that haven't ended, newest first (for their billing page). */
export async function myExtras(userId: string) {
  return db.planExtraPurchase.findMany({
    where: { userId, status: "paid", OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] },
    orderBy: { paidAt: "desc" },
    take: 30,
  });
}

// ─── Supplier Pro's included featured weeks ──────────────────────────────────

function monthStart(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function includedFeaturedWeeksLeft(userId: string, now = new Date()) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true, aiCredits: true } });
  const included = user?.role === "supplier" ? supplierLimits(planKeyFor("supplier", user.aiCredits)).featuredWeeksIncluded : 0;
  if (!included) return { included: 0, left: 0 };
  const used = await db.planExtraPurchase.count({ where: { userId, kind: "supplier_boost", included: true, createdAt: { gte: monthStart(now) } } });
  return { included, left: Math.max(0, included - used) };
}

/** Starts one of the plan's own featured weeks (after any week already running). */
export async function useIncludedFeaturedWeek(userId: string) {
  const { left } = await includedFeaturedWeeksLeft(userId);
  if (left <= 0) throw new ExtraError("You've used this month's featured weeks. Buy another week or wait for next month.");
  const window = extraWindow("supplier_boost", 1, await latestEnd(userId, "supplier_boost", null), new Date());
  return db.planExtraPurchase.create({
    data: { reference: `${EXTRA_REFERENCE_PREFIX}included-${crypto.randomUUID()}`, userId, kind: "supplier_boost", quantity: 1, amountKobo: 0, included: true, status: "paid", paidAt: new Date(), ...window },
  });
}
