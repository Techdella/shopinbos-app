import "server-only";

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db/client";
import { paystackOutcome } from "@shared/paystack-return";
import { lagosDay } from "@shared/instalments";
import {
  AJO_FEATURE,
  AJO_REF_PREFIX,
  ajoAutopayDue,
  ajoProblem,
  ajoReminderDue,
  ajoRemoveAt,
  ajoSchedule,
  ajoWeekDueAt,
  ajoWeeklyKobo,
  canShipWeek,
  cleanAjoRules,
  currentAjoWeek,
  drawOrder,
  groupFinished,
  manualOrder,
  payingMembers,
  publicFirstName,
  weekStatus,
} from "@shared/ajo";
import { chargeSavedCard, paidAmountKobo, paymentsReady, readMetadata, saleFeeKobo, sealAuthorization, sellerSplit, sellerSubaccount, startSplitPayment, verifyPayment } from "@/lib/paystack/plans.server";
import { buildSplitPlan } from "@/lib/wallet/rules";
import { checkLink, createPaidOrder, dayText, featureOnForStore, loadSaleProduct, messageShopper, naira, newReference, signLink, storeLink, tellSeller, type StoreRef } from "./common.server";
import { e164 } from "@/lib/sms/pure";
import { verifyPhoneToken, phoneVerifySecret } from "@/lib/commerce/phone-verify";
import { phoneVerificationAvailable } from "@/lib/commerce/phone-verify.server";

// Product ajo run by a seller (pilot "ajo"; rules in shared/ajo.ts). N members × N weeks; each week every member pays
// item price ÷ N, each contribution its own Paystack payment split straight to the seller's bank (Shopinbos's fee in
// the same split): Shopinbos never holds anyone's money. When the group fills, the collection order is drawn (seeded,
// recorded; returning customers first). Each week, once everyone has paid, the seller ships that week's collector their
// item (a paid store order). Missed week: 2 days' grace, then the member is removed and loses their turn; what happens
// to the weeks they paid is the seller's decision under the group's rules (recorded on the member).
//
// Members are checked by phone code only (no BVN / NIN check in the pilot).

const memberLink = (store: { slug: string; customDomain: string | null }, groupId: string, memberId: string) => storeLink(store, `/ajo/${groupId}?m=${memberId}&t=${signLink("ajo", memberId)}`);

// ─── The seller creates a group ───────────────────────────────────────────────

export async function createAjoGroup(storeId: string, input: { productId: string; variantId?: string | null; size: number; depositNaira: number; rules?: string; startDay: string }, now = new Date()) {
  if (!(await featureOnForStore(storeId, AJO_FEATURE))) return { ok: false as const, error: "Ajo isn't on for your shop." };
  if (!(await sellerSubaccount(storeId))) return { ok: false as const, error: "Set up your Shopinbos Wallet (verified ID and bank) first, so contributions settle to your bank." };
  const product = await loadSaleProduct(storeId, input.productId, input.variantId);
  if (!product) return { ok: false as const, error: "Choose a published product." };
  if ("problem" in product) return { ok: false as const, error: product.problem };
  const depositKobo = Math.round(Math.max(0, Number(input.depositNaira) || 0)) * 100;
  const problem = ajoProblem({ itemPriceKobo: product.unitKobo, size: input.size, depositKobo, startDay: input.startDay, today: lagosDay(now) });
  if (problem) return { ok: false as const, error: problem };
  const group = await db.ajoGroup.create({
    data: {
      storeId,
      productId: product.id,
      variantId: product.variantId,
      variantLabel: product.variantLabel,
      productName: product.name,
      productImage: product.image,
      itemPriceKobo: product.unitKobo,
      size: input.size,
      weeklyKobo: ajoWeeklyKobo(product.unitKobo, input.size),
      depositKobo,
      rules: cleanAjoRules(input.rules),
      startDay: input.startDay,
    },
  });
  return { ok: true as const, id: group.id };
}

// ─── Joining ──────────────────────────────────────────────────────────────────

export type JoinResult = { ok: true; authorizationUrl: string; accessCode: string | null; reference: string; memberId: string } | { ok: false; error: string; code?: string };

/** Places taken: active members plus people who started joining in the last hour (they may still pay). */
async function placesTaken(groupId: string, now: Date) {
  return db.ajoMember.count({ where: { groupId, OR: [{ status: { in: ["active", "collected"] } }, { status: "pending", createdAt: { gt: new Date(now.getTime() - 60 * 60 * 1000) } }] } });
}

/**
 * Join: a verified phone (code), the rules accepted, then the first week's contribution (plus any joining deposit)
 * through Paystack, split to the seller. The card is kept for autopay only when they ask for it.
 */
export async function joinAjoGroup(store: StoreRef, groupId: string, input: { name: string; phone: string; email: string; address: Record<string, unknown>; phoneToken?: string | null; acceptRules: boolean; autopay: boolean }, now = new Date()): Promise<JoinResult> {
  if (!paymentsReady()) return { ok: false, error: "Card payments aren't available right now. Try again later." };
  const group = await db.ajoGroup.findFirst({ where: { id: groupId, storeId: store.id } });
  if (!group || !(await featureOnForStore(store.id, AJO_FEATURE))) return { ok: false, error: "This group isn't available." };
  if (group.status !== "forming") return { ok: false, error: "This group has already started. Ask the shop about the next one." };
  if (!input.acceptRules) return { ok: false, error: "Read and accept the group rules to join." };
  const phone = e164(input.phone);
  if (!phone) return { ok: false, error: "Enter a phone number with 7 to 15 digits." };
  // Phone code (phone-only check). Skipped, as at checkout, only where no SMS / WhatsApp code provider exists (dev).
  if (phoneVerificationAvailable()) {
    const secret = phoneVerifySecret();
    if (!secret || !verifyPhoneToken(input.phoneToken, { phone, storeId: store.id }, secret)) return { ok: false, error: "Verify your phone number with the code we send you.", code: "PHONE_NOT_VERIFIED" };
  }
  const existing = await db.ajoMember.findUnique({ where: { groupId_phone: { groupId, phone } } });
  if (existing && existing.status !== "pending") return { ok: false, error: "This phone number is already in the group." };
  if (!existing && (await placesTaken(groupId, now)) >= group.size) return { ok: false, error: "This group is full." };
  const seller = await sellerSubaccount(store.id);
  if (!seller) return { ok: false, error: "This shop can't take card payments right now." };

  // New members (no earlier paid order at this shop) collect later.
  const shopper = await db.shopper.findUnique({ where: { phone }, select: { id: true, stores: { where: { storeId: store.id }, select: { orderCount: true } } } });
  const isNew = !(shopper?.stores[0]?.orderCount && shopper.stores[0].orderCount > 0);
  const data = { name: input.name, email: input.email.toLowerCase(), deliveryAddress: JSON.parse(JSON.stringify(input.address)), shopperId: shopper?.id ?? null, isNew, phoneVerifiedAt: now, rulesAcceptedAt: now, autopay: input.autopay };
  const member = existing ? await db.ajoMember.update({ where: { id: existing.id }, data }) : await db.ajoMember.create({ data: { groupId, phone, ...data } });

  const fee = await weekFeeKobo(seller.sellerUserId, group);
  const amountKobo = group.weeklyKobo + group.depositKobo;
  // Shopinbos's fee is on the contribution only; the joining deposit is the seller's in full.
  const split = sellerSplit(seller.subaccount, amountKobo, fee);
  const reference = newReference(AJO_REF_PREFIX);
  await db.ajoContribution.create({ data: { groupId, memberId: member.id, week: 1, amountKobo, depositKobo: group.depositKobo, feeKobo: split.platformKobo ?? 0, sellerKobo: split.sellerKobo, reference, split: JSON.parse(JSON.stringify(split)) } });
  try {
    const started = await startSplitPayment({ email: member.email, amountKobo, reference, callbackUrl: memberLink(store, groupId, member.id), metadata: { kind: "ajo", groupId, memberId: member.id, week: 1, storeId: store.id }, plan: split, cardOnly: input.autopay });
    return { ok: true, ...started, memberId: member.id };
  } catch (error) {
    console.error(`[ajo] Paystack could not start joining ${member.id}`, error);
    await db.ajoContribution.update({ where: { reference }, data: { status: "failed" } }).catch(() => null);
    return { ok: false, error: "Card payment isn't available right now. Try again in a moment." };
  }
}

/** Shopinbos's fee on one member's weekly contribution: the fee on the week's item, shared between the members. */
async function weekFeeKobo(sellerUserId: string, group: { itemPriceKobo: number; size: number }) {
  return Math.floor((await saleFeeKobo(sellerUserId, group.itemPriceKobo)) / group.size);
}

/** The week a member owes now: the earliest week up to the current one they haven't paid (null: nothing due). */
async function weekOwed(group: { id: string; startDay: string; size: number; status: string }, memberId: string, now: Date) {
  const current = group.status === "running" ? currentAjoWeek(group.startDay, group.size, now) : 1;
  const paid = await db.ajoContribution.findMany({ where: { memberId, status: "paid", extra: false }, select: { week: true } });
  const done = new Set(paid.map((row) => row.week));
  for (let week = 1; week <= Math.max(1, current); week += 1) if (!done.has(week)) return week;
  // Paying ahead: the next week, once the current week is paid (never past the last).
  const next = Math.max(1, current) + 1;
  return group.status === "running" && next <= group.size && !done.has(next) && lagosDay(now) >= lagosDay(new Date(ajoWeekDueAt(group.startDay, next).getTime() - 24 * 60 * 60 * 1000)) ? next : null;
}

/** A member's "Pay this week" from their link. */
export async function startAjoContribution(store: StoreRef, groupId: string, memberId: string, now = new Date()) {
  const group = await db.ajoGroup.findFirst({ where: { id: groupId, storeId: store.id } });
  const member = group ? await db.ajoMember.findFirst({ where: { id: memberId, groupId } }) : null;
  if (!group || !member) return { ok: false as const, error: "We couldn't find your place in this group." };
  if (member.status !== "active" && member.status !== "collected") return { ok: false as const, error: member.status === "removed" ? "You were removed from this group. Contact the shop." : "Join the group first." };
  if (group.status !== "running" && group.status !== "forming") return { ok: false as const, error: "This group has ended." };
  const week = await weekOwed(group, member.id, now);
  if (!week) return { ok: false as const, error: "You're all paid up for now. Thank you!" };
  const seller = await sellerSubaccount(store.id);
  if (!seller) return { ok: false as const, error: "This shop can't take card payments right now." };
  const split = sellerSplit(seller.subaccount, group.weeklyKobo, await weekFeeKobo(seller.sellerUserId, group));
  const reference = newReference(AJO_REF_PREFIX);
  await db.ajoContribution.create({ data: { groupId, memberId: member.id, week, amountKobo: group.weeklyKobo, feeKobo: split.platformKobo ?? 0, sellerKobo: split.sellerKobo, reference, split: JSON.parse(JSON.stringify(split)) } });
  try {
    const started = await startSplitPayment({ email: member.email, amountKobo: group.weeklyKobo, reference, callbackUrl: memberLink(store, groupId, member.id), metadata: { kind: "ajo", groupId, memberId: member.id, week, storeId: store.id }, plan: split });
    return { ok: true as const, ...started };
  } catch (error) {
    console.error(`[ajo] Paystack could not start week ${week} for ${member.id}`, error);
    await db.ajoContribution.update({ where: { reference }, data: { status: "failed" } }).catch(() => null);
    return { ok: false as const, error: "Card payment isn't available right now. Try again in a moment." };
  }
}

// ─── Recording a contribution ─────────────────────────────────────────────────

export type ConfirmResult = { ok: true; fresh: boolean } | { ok: false; error: string; retry?: boolean; pending?: boolean };

export async function confirmAjoContribution(reference: string, now = new Date()): Promise<ConfirmResult> {
  if (!reference.startsWith(AJO_REF_PREFIX)) return { ok: false, error: "Not an ajo payment." };
  const row = await db.ajoContribution.findUnique({ where: { reference }, include: { member: true, group: true } });
  if (!row) return { ok: false, error: "Unknown payment." };
  if (row.status === "paid") return { ok: true, fresh: false };
  let verified;
  try {
    verified = await verifyPayment(reference);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Paystack could not check this payment.", retry: true };
  }
  if (verified.status !== "success") {
    const outcome = paystackOutcome(verified.status);
    if (outcome !== "pending") await db.ajoContribution.updateMany({ where: { reference, status: "pending" }, data: { status: "failed" } });
    return { ok: false, error: "The payment didn't go through.", pending: outcome === "pending" };
  }
  const meta = readMetadata(verified.metadata);
  if (meta.kind !== "ajo" || meta.memberId !== row.memberId) return { ok: false, error: "This payment isn't for this group." };
  if (paidAmountKobo(verified) < row.amountKobo) return { ok: false, error: "The amount paid is less than the contribution." };
  const claimed = await db.ajoContribution.updateMany({ where: { reference, status: { not: "paid" } }, data: { status: "paid", paidAt: now } });
  if (claimed.count !== 1) return { ok: true, fresh: false };

  const group = row.group;
  const member = row.member;
  // Already paid this week (two tabs, autopay and a pay link): recorded, and the seller sends it back.
  const dupe = await db.ajoContribution.count({ where: { memberId: member.id, week: row.week, status: "paid", extra: false, NOT: { reference } } });
  const late = member.status === "removed" || member.status === "left" || group.status === "cancelled" || group.status === "completed";
  if (dupe > 0 || late) {
    await db.ajoContribution.update({ where: { reference }, data: { extra: true } });
    await tellSeller(group.storeId, { title: `Send a payment back: ${member.name}`, description: `${member.name} paid ${naira(row.amountKobo)} for week ${row.week} of the ${group.productName} ajo, but ${dupe > 0 ? "that week was already paid" : "they're no longer in the group"}. The money is in your bank: send it back to them.`, link: `/home/ajo/${group.id}`, dedupeKey: `ajo.extra:${reference}`, priority: "critical" });
    return { ok: true, fresh: false };
  }

  if (member.status === "pending") {
    const card = member.autopay ? sealAuthorization(verified) : null;
    await db.ajoMember.update({ where: { id: member.id }, data: { status: "active", joinedAt: now, ...(card ? { authorizationCode: card.code, authorizationEmail: (verified.customer?.email ?? member.email).toLowerCase(), cardLast4: card.last4 } : { autopay: false }) } });
    await tellSeller(group.storeId, { title: `New ajo member: ${member.name}`, description: `${member.name} joined the ${group.productName} ajo and paid week 1${row.depositKobo ? ` and the ${naira(row.depositKobo)} deposit` : ""} (to your bank through Paystack).`, link: `/home/ajo/${group.id}`, dedupeKey: `ajo.joined:${member.id}`, priority: "success" });
    const active = await db.ajoMember.count({ where: { groupId: group.id, status: "active" } });
    if (active >= group.size) await drawCollectionOrder(group.id);
  }

  await afterWeekPayment(group.id, row.week);
  return { ok: true, fresh: true };
}

/** When everyone has paid a week, the seller is told who to ship to. */
async function afterWeekPayment(groupId: string, week: number) {
  const group = await db.ajoGroup.findUnique({ where: { id: groupId }, include: { members: true } });
  if (!group || group.status !== "running") return;
  const paid = await db.ajoContribution.findMany({ where: { groupId, week, status: "paid", extra: false }, select: { memberId: true } });
  const check = canShipWeek({ week, members: group.members, paidMemberIds: paid.map((row) => row.memberId), shippedWeeks: group.shippedWeeks });
  if (!check.ok) return;
  const collector = group.members.find((member) => member.id === check.memberId);
  await tellSeller(group.storeId, { title: `Ship to ${collector?.name ?? "this week's collector"} this week`, description: `Everyone in the ${group.productName} ajo paid week ${week}. Open the group and tap "Ship" to make ${publicFirstName(collector?.name)}'s order.`, link: `/home/ajo/${group.id}`, dedupeKey: `ajo.week-paid:${group.id}:${week}`, priority: "success", event: "order.paid" });
}

/** The group is full: draw the collection order with a recorded seed (returning customers first). Once. */
export async function drawCollectionOrder(groupId: string) {
  const group = await db.ajoGroup.findUnique({ where: { id: groupId }, include: { members: { where: { status: "active" } } } });
  if (!group || group.drawnAt) return;
  const seed = `${group.id}:${randomBytes(8).toString("hex")}`;
  const order = drawOrder(group.members.map((member) => ({ id: member.id, isNew: member.isNew })), seed);
  const claimed = await db.ajoGroup.updateMany({ where: { id: group.id, drawnAt: null }, data: { drawSeed: seed, drawnAt: new Date(), orderSetBy: "draw" } });
  if (claimed.count !== 1) return;
  await db.$transaction(order.map((id, index) => db.ajoMember.update({ where: { id }, data: { position: index + 1 } })));
  await tellSeller(group.storeId, { title: `Ajo group full: ${group.productName}`, description: `All ${group.size} members joined. The collection order was drawn (returning customers first). You can change it before ${group.startDay}.`, link: `/home/ajo/${group.id}`, dedupeKey: `ajo.full:${group.id}`, priority: "success" });
}

// ─── The seller manages a group ───────────────────────────────────────────────

export async function sellerAjoGroups(storeId: string, now = new Date()) {
  const groups = await db.ajoGroup.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 100, include: { members: { select: { status: true } } } });
  return groups.map((group) => ({
    id: group.id,
    productName: group.productName,
    variantLabel: group.variantLabel,
    size: group.size,
    weekly: group.weeklyKobo / 100,
    deposit: group.depositKobo / 100,
    startDay: group.startDay,
    status: group.status,
    members: group.members.filter((member) => member.status !== "pending").length,
    week: group.status === "running" ? currentAjoWeek(group.startDay, group.size, now) : 0,
    shipped: group.shippedWeeks.length,
    createdAt: group.createdAt.toISOString(),
  }));
}

export async function sellerAjoGroup(storeId: string, groupId: string, now = new Date()) {
  const group = await db.ajoGroup.findFirst({ where: { id: groupId, storeId }, include: { members: { where: { status: { not: "pending" } }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] }, contributions: { where: { status: "paid" }, orderBy: { paidAt: "asc" } } } });
  if (!group) return null;
  const store = await db.store.findUnique({ where: { id: storeId }, select: { slug: true, customDomain: true } });
  const week = group.status === "running" ? currentAjoWeek(group.startDay, group.size, now) : group.status === "forming" ? 0 : group.size;
  const paidByWeek = new Map<number, Set<string>>();
  for (const row of group.contributions) if (!row.extra) paidByWeek.set(row.week, (paidByWeek.get(row.week) ?? new Set()).add(row.memberId));
  const thisWeek = week >= 1 ? weekStatus(group.members, paidByWeek.get(week) ?? []) : null;
  const ship = week >= 1 ? canShipWeek({ week, members: group.members, paidMemberIds: paidByWeek.get(week) ?? [], shippedWeeks: group.shippedWeeks }) : null;
  return {
    id: group.id,
    productId: group.productId,
    productName: group.productName,
    variantLabel: group.variantLabel,
    itemPrice: group.itemPriceKobo / 100,
    size: group.size,
    weekly: group.weeklyKobo / 100,
    deposit: group.depositKobo / 100,
    rules: group.rules,
    startDay: group.startDay,
    status: group.status,
    drawSeed: group.drawSeed,
    drawnAt: group.drawnAt?.toISOString() ?? null,
    orderSetBy: group.orderSetBy,
    canReorder: group.status === "forming" && Boolean(group.drawnAt) && lagosDay(now) < group.startDay,
    week,
    shippedWeeks: group.shippedWeeks,
    schedule: ajoSchedule(group.startDay, group.size).map((entry) => ({ week: entry.week, day: entry.day, paid: [...(paidByWeek.get(entry.week) ?? [])] })),
    thisWeek,
    shipTo: ship?.ok ? ship.memberId : null,
    joinUrl: store ? storeLink(store, `/ajo/${group.id}`) : null,
    members: group.members.map((member) => ({ id: member.id, name: member.name, phone: member.phone, position: member.position, status: member.status, isNew: member.isNew, autopay: member.autopay && Boolean(member.authorizationCode), collectedWeek: member.collectedWeek, orderId: member.orderId, removedReason: member.removedReason, settlement: member.settlement, paidWeeks: group.contributions.filter((row) => row.memberId === member.id && !row.extra).length })),
    settlements: group.contributions.map((row) => ({ memberId: row.memberId, week: row.week, amount: row.amountKobo / 100, deposit: row.depositKobo / 100, fee: row.feeKobo / 100, toYou: row.sellerKobo / 100, reference: row.reference, via: row.via, extra: row.extra, paidAt: row.paidAt?.toISOString() ?? null })),
  };
}

export type SellerAjoAction =
  | { action: "reorder"; order: string[] }
  | { action: "ship" }
  | { action: "cancel" }
  | { action: "start" }
  | { action: "settle"; memberId: string; note: string };

export async function sellerAjoAction(storeId: string, groupId: string, input: SellerAjoAction, now = new Date()): Promise<{ ok: true; orderId?: string } | { ok: false; error: string }> {
  const group = await db.ajoGroup.findFirst({ where: { id: groupId, storeId }, include: { members: true } });
  if (!group) return { ok: false, error: "Group not found" };
  const store = await db.store.findUnique({ where: { id: storeId }, select: { id: true, slug: true, customDomain: true, name: true } });
  if (!store) return { ok: false, error: "Store not found" };

  if (input.action === "reorder") {
    if (group.status !== "forming" || !group.drawnAt || lagosDay(now) >= group.startDay) return { ok: false, error: "The order can only change after the draw and before the start day." };
    const current = group.members.filter((member) => member.status === "active").sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((member) => member.id);
    const order = manualOrder(current, input.order);
    if (!order) return { ok: false, error: "The new order must have every member exactly once." };
    await db.$transaction([...order.map((id, index) => db.ajoMember.update({ where: { id }, data: { position: index + 1 } })), db.ajoGroup.update({ where: { id: group.id }, data: { orderSetBy: "seller" } })]);
    return { ok: true };
  }

  if (input.action === "start") {
    // Start a full group early or on its day (the sweep also starts full groups on their start day).
    const active = group.members.filter((member) => member.status === "active").length;
    if (group.status !== "forming") return { ok: false, error: "This group has already started." };
    if (active < group.size) return { ok: false, error: `The group isn't full yet (${active} of ${group.size}).` };
    if (!group.drawnAt) await drawCollectionOrder(group.id);
    await db.ajoGroup.updateMany({ where: { id: group.id, status: "forming" }, data: { status: "running", ...(lagosDay(now) < group.startDay ? { startDay: lagosDay(now) } : {}) } });
    await afterWeekPayment(group.id, 1);
    return { ok: true };
  }

  if (input.action === "cancel") {
    if (group.status !== "forming" && group.status !== "running") return { ok: false, error: "This group has already ended." };
    await db.ajoGroup.update({ where: { id: group.id }, data: { status: "cancelled", cancelledAt: now } });
    for (const member of payingMembers(group.members)) {
      await messageShopper({ storeId, phone: member.phone, email: member.email, name: member.name, event: "ajo_cancelled", refId: member.id, sms: `${store.name}: the ${group.productName} ajo was cancelled by the shop. They will contact you about what you paid.`, email_: { subject: `Ajo cancelled: ${group.productName}`, heading: "The ajo was cancelled", body: `${store.name} cancelled the ${group.productName} ajo group. The shop will contact you about what you paid, under the group's rules.` } });
    }
    return { ok: true };
  }

  if (input.action === "settle") {
    const member = group.members.find((row) => row.id === input.memberId);
    if (!member || (member.status !== "removed" && group.status !== "cancelled")) return { ok: false, error: "Record a decision for a removed member, or anyone in a cancelled group." };
    await db.ajoMember.update({ where: { id: member.id }, data: { settlement: input.note.trim().slice(0, 500) || null } });
    return { ok: true };
  }

  // Ship this week's item to the collector.
  if (group.status !== "running") return { ok: false, error: "The group hasn't started." };
  const week = currentAjoWeek(group.startDay, group.size, now);
  const paid = await db.ajoContribution.findMany({ where: { groupId, week, status: "paid", extra: false }, select: { memberId: true, amountKobo: true, depositKobo: true, feeKobo: true, reference: true } });
  const check = canShipWeek({ week, members: group.members, paidMemberIds: paid.map((row) => row.memberId), shippedWeeks: group.shippedWeeks });
  if (!check.ok) return { ok: false, error: check.reason === "not_all_paid" ? "Not everyone has paid this week yet." : check.reason === "already_shipped" ? "This week's item is already on its way." : check.reason === "nobody_left" ? "Everyone has collected." : "The group hasn't started." };
  const collector = group.members.find((member) => member.id === check.memberId)!;
  // Claim the week first, so two taps can't make two orders.
  const claimed = await db.$executeRaw`UPDATE "AjoGroup" SET "shippedWeeks" = array_append("shippedWeeks", ${week}), "updatedAt" = NOW() WHERE id = ${group.id} AND NOT (${week} = ANY("shippedWeeks"))`;
  if (claimed !== 1) return { ok: false, error: "This week's item is already on its way." };
  const seller = await sellerSubaccount(storeId);
  // The week's split, added up (for the wallet statement and Shopinbos's fee report). Deposits aren't part of the item.
  const total = paid.reduce((sum, row) => sum + row.amountKobo - row.depositKobo, 0);
  const fee = paid.reduce((sum, row) => sum + row.feeKobo, 0);
  const split = seller && total > 0 ? buildSplitPlan({ totalKobo: total, sellerSubaccount: seller.subaccount, suppliers: [], platformKobo: fee }) : null;
  try {
    const created = await createPaidOrder({
      storeId,
      product: { id: group.productId, name: group.productName, image: group.productImage, variantId: group.variantId, variantLabel: group.variantLabel },
      quantity: 1,
      unitNaira: group.itemPriceKobo / 100,
      buyer: { name: collector.name, email: collector.email, phone: collector.phone },
      address: collector.deliveryAddress,
      note: `Ajo week ${week} of ${group.size}: ${collector.name}'s turn.`,
      paystackRef: paid.at(-1)?.reference ?? null,
      split,
      logTag: "ajo",
    });
    await db.ajoMember.update({ where: { id: collector.id }, data: { status: "collected", collectedWeek: week, orderId: created.orderId } });
    const members = await db.ajoMember.findMany({ where: { groupId }, select: { id: true, status: true, position: true } });
    if (groupFinished(members)) await db.ajoGroup.update({ where: { id: group.id }, data: { status: "completed", completedAt: now } });
    await messageShopper({ storeId, phone: collector.phone, email: collector.email, name: collector.name, event: "ajo_collect", refId: `${collector.id}:${week}`, sms: `${store.name}: it's your turn in the ${group.productName} ajo! Your order ${created.orderNumber} is being prepared.`, email_: { subject: `Your turn: ${group.productName}`, heading: "It's your turn", body: `everyone paid week ${week} of the ${group.productName} ajo, and it's your turn. ${store.name} is preparing your order ${created.orderNumber}. Keep paying each week until the group ends.` } });
    return { ok: true, orderId: created.orderId };
  } catch (error) {
    console.error(`[ajo] could not make the order for ${collector.id} week ${week}`, error);
    await db.$executeRaw`UPDATE "AjoGroup" SET "shippedWeeks" = array_remove("shippedWeeks", ${week}) WHERE id = ${group.id}`;
    return { ok: false, error: "The order couldn't be made. Try again." };
  }
}

// ─── The public join page ─────────────────────────────────────────────────────

export async function publicAjoGroup(storeId: string, groupId: string, viewer: { memberId?: string | null; token?: string | null } = {}, now = new Date()) {
  const group = await db.ajoGroup.findFirst({ where: { id: groupId, storeId }, include: { members: { where: { status: { in: ["active", "collected", "removed"] } }, orderBy: [{ position: "asc" }, { joinedAt: "asc" }] } } });
  if (!group) return null;
  const week = group.status === "running" ? currentAjoWeek(group.startDay, group.size, now) : 0;
  const paidThisWeek = week ? await db.ajoContribution.findMany({ where: { groupId, week, status: "paid", extra: false }, select: { memberId: true } }) : [];
  const paidSet = new Set(paidThisWeek.map((row) => row.memberId));
  const me = viewer.memberId && checkLink("ajo", viewer.memberId, viewer.token) ? await db.ajoMember.findFirst({ where: { id: viewer.memberId, groupId } }) : null;
  const myPaid = me ? await db.ajoContribution.findMany({ where: { memberId: me.id, status: "paid", extra: false }, select: { week: true } }) : [];
  const owed = me && (me.status === "active" || me.status === "collected") ? await weekOwed(group, me.id, now) : null;
  return {
    id: group.id,
    productName: group.productName,
    productImage: group.productImage,
    variantLabel: group.variantLabel,
    itemPriceKobo: group.itemPriceKobo,
    size: group.size,
    weeklyKobo: group.weeklyKobo,
    depositKobo: group.depositKobo,
    rules: group.rules,
    startDay: group.startDay,
    status: group.status,
    week,
    joined: group.members.filter((member) => member.status !== "removed").length,
    schedule: ajoSchedule(group.startDay, group.size).map((entry) => ({ week: entry.week, day: entry.day })),
    // First names only; a green tick when they've paid this week.
    members: group.members.filter((member) => member.status !== "removed").map((member) => ({ firstName: publicFirstName(member.name), position: group.drawnAt ? member.position : null, paidThisWeek: paidSet.has(member.id), collected: member.status === "collected" })),
    me: me ? { id: me.id, status: me.status, position: me.position, paidWeeks: myPaid.map((row) => row.week).sort((a, b) => a - b), owedWeek: owed, autopay: me.autopay && Boolean(me.authorizationCode), token: viewer.token! } : null,
    verificationNote: "Members are checked by phone number only.",
  };
}

// ─── The hourly sweep ──────────────────────────────────────────────────────────

export async function runAjoSweep(now = new Date()) {
  const result = { started: 0, reminded: 0, charged: 0, removed: 0, abandoned: 0 };
  // People who started joining a day ago and never paid: let the place go.
  result.abandoned = (await db.ajoMember.deleteMany({ where: { status: "pending", createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) }, contributions: { none: { status: "paid" } } } })).count;
  // Full groups start on their start day.
  const today = lagosDay(now);
  const forming = await db.ajoGroup.findMany({ where: { status: "forming", startDay: { lte: today } }, include: { members: { select: { status: true } } } });
  for (const group of forming) {
    const active = group.members.filter((member) => member.status === "active").length;
    if (active >= group.size) {
      if (!group.drawnAt) await drawCollectionOrder(group.id);
      const moved = await db.ajoGroup.updateMany({ where: { id: group.id, status: "forming" }, data: { status: "running" } });
      if (moved.count) {
        result.started += 1;
        await afterWeekPayment(group.id, 1);
      }
    } else {
      await tellSeller(group.storeId, { title: `Ajo not full: ${group.productName}`, description: `The ${group.productName} ajo was due to start today, but only ${active} of ${group.size} have joined. It waits until it's full; you can cancel it from the group page.`, link: `/home/ajo/${group.id}`, dedupeKey: `ajo.not-full:${group.id}:${today}`, priority: "warning" });
    }
  }

  const running = await db.ajoGroup.findMany({ where: { status: "running" }, include: { members: true } });
  for (const group of running) {
    const store = await db.store.findUnique({ where: { id: group.storeId }, select: { id: true, slug: true, customDomain: true, name: true } });
    if (!store) continue;
    const current = currentAjoWeek(group.startDay, group.size, now);
    const seller = await sellerSubaccount(group.storeId);
    for (const member of payingMembers(group.members)) {
      try {
        const paid = new Set((await db.ajoContribution.findMany({ where: { memberId: member.id, status: "paid", extra: false }, select: { week: true } })).map((row) => row.week));
        // Removed after 2 days' grace on any unpaid week so far.
        const missed = Array.from({ length: current }, (_, index) => index + 1).find((week) => !paid.has(week) && now.getTime() > ajoRemoveAt(group.startDay, week).getTime());
        if (missed) {
          const moved = await db.ajoMember.updateMany({ where: { id: member.id, status: { in: ["active", "collected"] } }, data: { status: "removed", removedAt: now, removedReason: `Didn't pay week ${missed} within 2 days.` } });
          if (moved.count === 1) {
            result.removed += 1;
            await tellSeller(group.storeId, { title: `Removed from ajo: ${member.name}`, description: `${member.name} didn't pay week ${missed} of the ${group.productName} ajo within 2 days, so they're removed${member.status === "active" ? " and lose their turn" : ""}. They paid ${paid.size} week${paid.size === 1 ? "" : "s"}: record what you'll do about it under the group's rules.`, link: `/home/ajo/${group.id}`, dedupeKey: `ajo.removed:${member.id}`, priority: "warning" });
            await messageShopper({ storeId: store.id, phone: member.phone, email: member.email, name: member.name, event: "ajo_removed", refId: member.id, sms: `${store.name}: you were removed from the ${group.productName} ajo because week ${missed} wasn't paid within 2 days. The shop will contact you about the weeks you paid.`, email_: { subject: `Removed from the ajo: ${group.productName}`, heading: "You were removed from the group", body: `week ${missed} of the ${group.productName} ajo wasn't paid within 2 days of its due date, so you were removed from the group. What happens to the weeks you paid follows the group's rules; ${store.name} will contact you.` } });
            // Their removal may complete this week for everyone else.
            await afterWeekPayment(group.id, current);
          }
          continue;
        }
        const next = current + 1;
        const link = memberLink(store, group.id, member.id);
        if (next <= group.size && !paid.has(next) && ajoReminderDue(now, group.startDay, next, member.remindedWeek)) {
          await db.ajoMember.update({ where: { id: member.id }, data: { remindedWeek: next } });
          await messageShopper({ storeId: store.id, phone: member.phone, email: member.email, name: member.name, event: "ajo_reminder", refId: `${member.id}:${next}`, sms: `${store.name}: your ${group.productName} ajo payment for week ${next} (${naira(group.weeklyKobo)}) is due tomorrow. ${member.autopay && member.authorizationCode ? "We'll charge your saved card, or pay now:" : "Pay here:"} ${link}`, email_: { subject: `Ajo week ${next} due tomorrow`, heading: "Your ajo payment is due tomorrow", body: `week ${next} of the ${group.productName} ajo (${naira(group.weeklyKobo)}) is due ${dayText(ajoWeekDueAt(group.startDay, next))}.`, cta: { label: "Pay now", url: link } } });
          result.reminded += 1;
        }
        if (current >= 1 && !paid.has(current) && seller && member.autopay && member.authorizationCode && member.authorizationEmail && ajoAutopayDue(now, group.startDay, current, member.autopayTriedWeek)) {
          const claimed = await db.ajoMember.updateMany({ where: { id: member.id, autopayTriedWeek: { lt: current } }, data: { autopayTriedWeek: current } });
          if (claimed.count !== 1) continue;
          const split = sellerSplit(seller.subaccount, group.weeklyKobo, await weekFeeKobo(seller.sellerUserId, group));
          const reference = newReference(AJO_REF_PREFIX);
          await db.ajoContribution.create({ data: { groupId: group.id, memberId: member.id, week: current, amountKobo: group.weeklyKobo, feeKobo: split.platformKobo ?? 0, sellerKobo: split.sellerKobo, reference, via: "autopay", split: JSON.parse(JSON.stringify(split)) } });
          const charged = await chargeSavedCard({ email: member.authorizationEmail, sealedAuthorization: member.authorizationCode, amountKobo: group.weeklyKobo, reference, metadata: { kind: "ajo", groupId: group.id, memberId: member.id, week: current, storeId: group.storeId, autopay: true }, plan: split });
          if (charged.status === "success" && (await confirmAjoContribution(reference, now)).ok) {
            result.charged += 1;
            continue;
          }
          if (charged.status === "failed") await db.ajoContribution.updateMany({ where: { reference, status: "pending" }, data: { status: "failed" } });
          await messageShopper({ storeId: store.id, phone: member.phone, email: member.email, name: member.name, event: "ajo_autopay_failed", refId: `${member.id}:${current}`, sms: `${store.name}: we couldn't charge your card for week ${current} of the ${group.productName} ajo (${naira(group.weeklyKobo)}). Pay within 2 days to keep your place: ${link}`, email_: { subject: `Ajo payment didn't go through`, heading: "We couldn't charge your card", body: `week ${current} of the ${group.productName} ajo (${naira(group.weeklyKobo)}) couldn't be charged to your saved card. Pay within 2 days of the due date to keep your place.`, cta: { label: "Pay now", url: link } } });
        }
      } catch (error) {
        console.error(`[ajo] sweep failed for member ${member.id}`, error);
      }
    }
  }
  return result;
}

export { memberLink as ajoMemberLink };
