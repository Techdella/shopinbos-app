import "server-only";

import { db } from "@/lib/db/client";
import { paystackOutcome } from "@shared/paystack-return";
import {
  GROUP_BUY_FEATURE,
  GROUP_CHARGE_PREFIX,
  GROUP_VERIFY_KOBO,
  GROUP_VERIFY_PREFIX,
  chargeOutcome,
  countsTowardsGroup,
  groupSettingsProblem,
  groupState,
  joinedCount,
  payLinkDeadline,
  statusAfterCharges,
  timeLeft,
} from "@shared/group-buy";
import { publicFirstName } from "@shared/ajo";
import { chargeSavedCard, paidAmountKobo, paymentsReady, readMetadata, refundCardCheck, saleFeeKobo, sealAuthorization, sellerSplit, sellerSubaccount, startCardCheck, startSplitPayment, verifyPayment } from "@/lib/paystack/plans.server";
import { readSplitPlan } from "@/lib/wallet/rules";
import { checkLink, createPaidOrder, featureOnForStore, loadSaleProduct, messageShopper, naira, newReference, signLink, storeLink, tellSeller, type StoreRef } from "./common.server";

// Group buy (pilot "group_buy"; rules in shared/group-buy.ts). A lower price unlocks when enough people join before the
// deadline; nobody is charged unless the group fills.
//
// Money: joining saves the shopper's card with a ₦50 card check (card only, not split: there's no sale yet) that is
// refunded straight away. When the group fills, each saved card is charged the group price with charge_authorization,
// split straight to the seller's bank (Shopinbos's fee in the same split), and their order is made. A card that can't
// be charged gets a pay link (a normal split checkout) for 2 hours, then that member is dropped. A group that doesn't
// fill by its deadline is cancelled: nobody is charged.

const groupUrl = (store: { slug: string; customDomain: string | null }, groupId: string) => storeLink(store, `/group/${groupId}`);
const memberUrl = (store: { slug: string; customDomain: string | null }, groupId: string, memberId: string) => storeLink(store, `/group/${groupId}?m=${memberId}&t=${signLink("group", memberId)}`);

export interface GroupOffer {
  priceKobo: number;
  retailKobo: number;
  size: number;
  hours: number;
  /** The group now taking people for this product (null: joining starts a new one). */
  open: { id: string; joined: number; endsAt: string; timeLeft: string } | null;
}

/** The group-buy offer for a product (null when the shop's pilot, the product's switch or the seller's bank isn't on). */
export async function groupOffer(storeId: string, productId: string, retailKobo: number, now = new Date()): Promise<GroupOffer | null> {
  const option = await db.productPayOption.findUnique({ where: { productId } });
  if (!option?.groupBuyOn || option.storeId !== storeId || !option.groupPriceKobo || !option.groupSize || !option.groupHours) return null;
  if (groupSettingsProblem({ groupPriceKobo: option.groupPriceKobo, retailKobo, size: option.groupSize, hours: option.groupHours })) return null;
  if (!(await featureOnForStore(storeId, GROUP_BUY_FEATURE)) || !paymentsReady() || !(await sellerSubaccount(storeId))) return null;
  const open = await db.groupBuy.findFirst({ where: { storeId, productId, status: "open", endsAt: { gt: now } }, orderBy: { createdAt: "asc" }, include: { members: { select: { status: true } } } });
  const joined = open ? joinedCount(open.members) : 0;
  return {
    priceKobo: option.groupPriceKobo,
    retailKobo,
    size: option.groupSize,
    hours: option.groupHours,
    open: open && joined < open.size ? { id: open.id, joined, endsAt: open.endsAt.toISOString(), timeLeft: timeLeft(open.endsAt, now).label } : null,
  };
}

export type JoinResult = { ok: true; authorizationUrl: string; accessCode: string | null; reference: string; groupId: string } | { ok: false; error: string };

/** Joins (or starts) a group for a product: saves the member (pending) and opens Paystack for the ₦50 card check. */
export async function joinGroupBuy(store: StoreRef, input: { productId: string; groupId?: string | null; variantId?: string | null; buyer: { name: string; email: string; phone: string | null }; address: Record<string, unknown> }, now = new Date()): Promise<JoinResult> {
  if (!paymentsReady()) return { ok: false, error: "Card payments aren't available right now. Try again later." };
  if (!(await featureOnForStore(store.id, GROUP_BUY_FEATURE))) return { ok: false, error: "Group buy isn't available at this shop." };
  const option = await db.productPayOption.findUnique({ where: { productId: input.productId } });
  if (!option?.groupBuyOn || option.storeId !== store.id || !option.groupPriceKobo || !option.groupSize || !option.groupHours) return { ok: false, error: "This product has no group buy." };
  const product = await loadSaleProduct(store.id, input.productId, input.variantId);
  if (!product) return { ok: false, error: "This product isn't available." };
  if ("problem" in product) return { ok: false, error: product.problem };
  if (!(await sellerSubaccount(store.id))) return { ok: false, error: "This shop can't take card payments right now." };

  let group = input.groupId ? await db.groupBuy.findFirst({ where: { id: input.groupId, storeId: store.id, productId: input.productId }, include: { members: true } }) : null;
  if (group) {
    const state = groupState(group, joinedCount(group.members), now);
    if (state !== "open") return { ok: false, error: state === "full" ? "This group is full. Start a new one from the product page." : "This group has closed. Start a new one from the product page." };
  } else {
    group = await db.groupBuy.findFirst({ where: { storeId: store.id, productId: input.productId, status: "open", endsAt: { gt: now } }, orderBy: { createdAt: "asc" }, include: { members: true } });
    if (group && groupState(group, joinedCount(group.members), now) !== "open") group = null;
  }
  if (group && group.variantId && product.variantId !== group.variantId) return { ok: false, error: `This group is for ${group.variantLabel ?? "another version"}. Choose that one to join.` };
  const email = input.buyer.email.toLowerCase();
  if (group?.members.some((member) => member.email === email && countsTowardsGroup(member.status))) return { ok: false, error: "You're already in this group." };
  if (!group) {
    group = await db.groupBuy.create({
      data: {
        storeId: store.id,
        productId: product.id,
        variantId: product.variantId,
        variantLabel: product.variantLabel,
        productName: product.name,
        productImage: product.image,
        retailKobo: product.unitKobo,
        priceKobo: option.groupPriceKobo,
        size: option.groupSize,
        endsAt: new Date(now.getTime() + option.groupHours * 60 * 60 * 1000),
      },
      include: { members: true },
    });
  }
  const reference = newReference(GROUP_VERIFY_PREFIX);
  const member = await db.groupBuyMember.create({ data: { groupId: group.id, name: input.buyer.name, email, phone: input.buyer.phone, deliveryAddress: JSON.parse(JSON.stringify(input.address)), verifyReference: reference } });
  try {
    const started = await startCardCheck({ email, reference, callbackUrl: memberUrl(store, group.id, member.id), metadata: { kind: "group_verify", groupId: group.id, memberId: member.id, storeId: store.id } });
    return { ok: true, ...started, groupId: group.id };
  } catch (error) {
    console.error(`[group-buy] Paystack could not start the card check for ${member.id}`, error);
    await db.groupBuyMember.update({ where: { id: member.id }, data: { status: "cancelled" } }).catch(() => null);
    return { ok: false, error: "Card payment isn't available right now. Try again in a moment." };
  }
}

export type ConfirmResult = { ok: true; fresh: boolean } | { ok: false; error: string; retry?: boolean; pending?: boolean };

/**
 * The ₦50 card check is in: refund it at once, keep the card (if reusable), count the member in. Once per member
 * (conditional on status pending). Fills the group when this was the last place.
 */
export async function confirmGroupVerify(reference: string): Promise<ConfirmResult> {
  if (!reference.startsWith(GROUP_VERIFY_PREFIX)) return { ok: false, error: "Not a group buy card check." };
  const member = await db.groupBuyMember.findUnique({ where: { verifyReference: reference }, include: { group: { include: { members: { select: { id: true, status: true } } } } } });
  if (!member) return { ok: false, error: "Unknown card check." };
  if (member.status !== "pending") return { ok: true, fresh: false };
  let verified;
  try {
    verified = await verifyPayment(reference);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Paystack could not check this payment.", retry: true };
  }
  if (verified.status !== "success") return { ok: false, error: "The card check didn't go through.", pending: paystackOutcome(verified.status) === "pending" };
  const meta = readMetadata(verified.metadata);
  if (meta.kind !== "group_verify" || meta.memberId !== member.id) return { ok: false, error: "This card check isn't for this group." };
  if (paidAmountKobo(verified) < GROUP_VERIFY_KOBO) return { ok: false, error: "The card check amount is wrong." };

  // Send the ₦50 back straight away, whatever happens next (nothing of it is kept).
  const refund = await refundCardCheck(reference);
  const card = sealAuthorization(verified);
  const group = member.group;
  const open = groupState(group, joinedCount(group.members), new Date()) === "open";
  const moved = await db.groupBuyMember.updateMany({
    where: { id: member.id, status: "pending" },
    data: {
      status: open ? "joined" : "cancelled",
      verifyRefundStatus: refund.status,
      joinedAt: new Date(),
      ...(card ? { authorizationCode: card.code, authorizationEmail: (verified.customer?.email ?? member.email).toLowerCase(), cardLast4: card.last4 } : {}),
    },
  });
  if (moved.count !== 1) return { ok: true, fresh: false };
  if (refund.status === "failed") console.error(`[group-buy] the card check ${reference} couldn't be refunded: ${refund.error}`);
  if (!open) return { ok: true, fresh: true };
  const store = await db.store.findUnique({ where: { id: group.storeId }, select: { slug: true, customDomain: true, name: true } });
  if (store) {
    const link = memberUrl(store, group.id, member.id);
    await messageShopper({ storeId: group.storeId, phone: member.phone, email: member.email, name: member.name, event: "group_buy_joined", refId: member.id, sms: `${store.name}: you're in the group for ${group.productName} (${naira(group.priceKobo)} each when ${group.size} join). Nobody pays unless it fills. Share it: ${groupUrl(store, group.id)} Your place: ${link}`, email_: { subject: `You're in the group for ${group.productName}`, heading: "You've joined the group", body: `you're in the group buy for ${group.productName} at ${store.name}: ${naira(group.priceKobo)} each when ${group.size} people join. Your card is charged only if the group fills; the ₦50 card check is on its way back to you. Share the group to fill it faster: ${groupUrl(store, group.id)}`, cta: { label: "Your place in the group", url: link } } });
  }
  const joined = await db.groupBuyMember.count({ where: { groupId: group.id, status: { in: ["joined", "charged", "pay_link"] } } });
  if (joined >= group.size) await fillGroup(group.id);
  else {
    await tellSeller(group.storeId, { title: `Group buy: ${joined} of ${group.size} joined`, description: `${member.name} joined the group for ${group.productName} (${naira(group.priceKobo)} each when ${group.size} join). Nobody is charged until it fills.`, link: "/home/group-buys", dedupeKey: `group-buy.joined:${member.id}` });
  }
  return { ok: true, fresh: true };
}

/** The group is full: charge every saved card (split to the seller), give the rest a 2-hour pay link. Once. */
export async function fillGroup(groupId: string) {
  const claimed = await db.groupBuy.updateMany({ where: { id: groupId, status: "open" }, data: { status: "filled", filledAt: new Date() } });
  if (claimed.count !== 1) return;
  const group = await db.groupBuy.findUnique({ where: { id: groupId }, include: { members: true } });
  if (!group) return;
  const store = await db.store.findUnique({ where: { id: group.storeId }, select: { id: true, slug: true, customDomain: true, name: true, userId: true } });
  const seller = await sellerSubaccount(group.storeId);
  if (!store) return;
  const fee = seller ? await saleFeeKobo(seller.sellerUserId, group.priceKobo) : 0;
  for (const member of group.members.filter((row) => row.status === "joined")) {
    const reference = newReference(GROUP_CHARGE_PREFIX);
    const split = seller ? sellerSplit(seller.subaccount, group.priceKobo, fee) : null;
    await db.groupBuyMember.update({ where: { id: member.id }, data: { chargeReference: reference, chargeSplit: split ? JSON.parse(JSON.stringify(split)) : undefined } });
    let outcome: "paid" | "pay_link" = "pay_link";
    if (split && member.authorizationCode && member.authorizationEmail) {
      const charged = await chargeSavedCard({ email: member.authorizationEmail, sealedAuthorization: member.authorizationCode, amountKobo: group.priceKobo, reference, metadata: { kind: "group_charge", groupId: group.id, memberId: member.id, storeId: group.storeId }, plan: split });
      outcome = chargeOutcome(charged.status);
      if (outcome === "paid") {
        const confirmed = await confirmGroupCharge(reference);
        if (!confirmed.ok) outcome = "pay_link";
      }
    }
    if (outcome === "pay_link") {
      const deadline = payLinkDeadline(new Date());
      await db.groupBuyMember.updateMany({ where: { id: member.id, status: "joined" }, data: { status: "pay_link", payDeadline: deadline } });
      const link = memberUrl(store, group.id, member.id);
      await messageShopper({ storeId: store.id, phone: member.phone, email: member.email, name: member.name, event: "group_buy_pay_link", refId: member.id, sms: `${store.name}: your group for ${group.productName} is full! Pay ${naira(group.priceKobo)} within 2 hours to get yours: ${link}`, email_: { subject: `Your group is full: pay for ${group.productName}`, heading: "Your group is full", body: `the group buy for ${group.productName} is full, but we couldn't charge your saved card. Pay ${naira(group.priceKobo)} within 2 hours to keep your place.`, cta: { label: "Pay now", url: link } } });
    }
  }
  await settleGroupStatus(group.id);
  await tellSeller(group.storeId, { title: `Group buy full: ${group.productName}`, description: `${group.size} people joined. Their cards are being charged ${naira(group.priceKobo)} each (to your bank through Paystack), and their orders appear as each payment lands.`, link: "/home/group-buys", dedupeKey: `group-buy.full:${group.id}`, priority: "success", event: "order.paid" });
}

async function settleGroupStatus(groupId: string) {
  const members = await db.groupBuyMember.findMany({ where: { groupId }, select: { status: true } });
  if (statusAfterCharges(members) === "charged") await db.groupBuy.updateMany({ where: { id: groupId, status: "filled" }, data: { status: "charged", chargedAt: new Date() } });
}

/**
 * Records a member's group-price payment (charged card or pay link), once: asks Paystack, checks it, marks the member
 * charged and makes their order. Paid twice: the seller is told to send it back.
 */
export async function confirmGroupCharge(reference: string): Promise<ConfirmResult> {
  if (!reference.startsWith(GROUP_CHARGE_PREFIX)) return { ok: false, error: "Not a group buy payment." };
  let verified;
  try {
    verified = await verifyPayment(reference);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Paystack could not check this payment.", retry: true };
  }
  if (verified.status !== "success") return { ok: false, error: "The payment didn't go through.", pending: paystackOutcome(verified.status) === "pending" };
  const meta = readMetadata(verified.metadata);
  const memberId = typeof meta.memberId === "string" ? meta.memberId : "";
  if (meta.kind !== "group_charge" || !memberId) return { ok: false, error: "This payment isn't for a group buy." };
  const member = await db.groupBuyMember.findUnique({ where: { id: memberId }, include: { group: true } });
  if (!member) return { ok: false, error: "Unknown member." };
  if (member.status === "charged" && member.chargeReference === reference) return { ok: true, fresh: false };
  const group = member.group;
  if (paidAmountKobo(verified) < group.priceKobo) return { ok: false, error: "The amount paid is less than the group price." };
  const moved = await db.groupBuyMember.updateMany({ where: { id: member.id, status: { in: ["joined", "pay_link", "dropped"] } }, data: { status: "charged", chargeReference: reference, payDeadline: null } });
  if (moved.count !== 1) {
    await tellSeller(group.storeId, { title: `Send a payment back: ${member.name}`, description: `${member.name} paid ${naira(group.priceKobo)} again for the group buy of ${group.productName} (Paystack ${reference}). The money is in your bank: send it back to them.`, link: "/home/group-buys", dedupeKey: `group-buy.extra:${reference}`, priority: "critical" });
    return { ok: true, fresh: false };
  }
  const split = readSplitPlan(member.chargeSplit);
  try {
    const created = await createPaidOrder({
      storeId: group.storeId,
      product: { id: group.productId, name: group.productName, image: group.productImage, variantId: group.variantId, variantLabel: group.variantLabel },
      quantity: 1,
      unitNaira: group.priceKobo / 100,
      buyer: { name: member.name, email: member.email, phone: member.phone },
      address: member.deliveryAddress,
      note: `Group buy: ${group.size} people at ${naira(group.priceKobo)} each.`,
      paystackRef: reference,
      split: split && split.totalKobo === group.priceKobo ? split : null,
      logTag: "group buy",
    });
    await db.groupBuyMember.update({ where: { id: member.id }, data: { orderId: created.orderId } });
  } catch (error) {
    console.error(`[group-buy] could not make the order for ${member.id}`, error);
    await tellSeller(group.storeId, { title: `Make the order: ${member.name}`, description: `${member.name} paid ${naira(group.priceKobo)} for ${group.productName} (group buy) but the order couldn't be made automatically. Contact them.`, link: "/home/group-buys", dedupeKey: `group-buy.order-failed:${member.id}`, priority: "critical" });
  }
  await settleGroupStatus(group.id);
  return { ok: true, fresh: true };
}

/** A member with a pay link pays the group price (normal Paystack checkout, split to the seller). */
export async function startGroupPayLink(store: StoreRef, groupId: string, memberId: string, now = new Date()) {
  const member = await db.groupBuyMember.findFirst({ where: { id: memberId, groupId }, include: { group: true } });
  if (!member || member.group.storeId !== store.id) return { ok: false as const, error: "We couldn't find your place in this group." };
  if (member.status === "charged") return { ok: false as const, error: "You've already paid. Thank you!" };
  if (member.status !== "pay_link" || !member.payDeadline || member.payDeadline.getTime() < now.getTime()) return { ok: false as const, error: "This pay link has expired." };
  const seller = await sellerSubaccount(store.id);
  if (!seller) return { ok: false as const, error: "This shop can't take card payments right now." };
  const split = sellerSplit(seller.subaccount, member.group.priceKobo, await saleFeeKobo(seller.sellerUserId, member.group.priceKobo));
  const reference = newReference(GROUP_CHARGE_PREFIX);
  await db.groupBuyMember.update({ where: { id: member.id }, data: { chargeReference: reference, chargeSplit: JSON.parse(JSON.stringify(split)) } });
  try {
    const started = await startSplitPayment({ email: member.email, amountKobo: member.group.priceKobo, reference, callbackUrl: memberUrl(store, groupId, member.id), metadata: { kind: "group_charge", groupId, memberId: member.id, storeId: store.id }, plan: split });
    return { ok: true as const, ...started };
  } catch (error) {
    console.error(`[group-buy] Paystack could not start the pay link for ${member.id}`, error);
    return { ok: false as const, error: "Card payment isn't available right now. Try again in a moment." };
  }
}

// ─── Pages ─────────────────────────────────────────────────────────────────────

export async function publicGroup(storeId: string, groupId: string, viewer: { memberId?: string | null; token?: string | null } = {}, now = new Date()) {
  const group = await db.groupBuy.findFirst({ where: { id: groupId, storeId }, include: { members: { orderBy: { createdAt: "asc" } } } });
  if (!group) return null;
  const joined = joinedCount(group.members);
  const me = viewer.memberId && checkLink("group", viewer.memberId, viewer.token) ? group.members.find((member) => member.id === viewer.memberId) ?? null : null;
  return {
    id: group.id,
    productId: group.productId,
    productName: group.productName,
    productImage: group.productImage,
    variantLabel: group.variantLabel,
    priceKobo: group.priceKobo,
    retailKobo: group.retailKobo,
    size: group.size,
    joined,
    status: group.status,
    state: groupState(group, joined, now),
    endsAt: group.endsAt.toISOString(),
    timeLeft: timeLeft(group.endsAt, now).label,
    members: group.members.filter((member) => countsTowardsGroup(member.status)).map((member) => publicFirstName(member.name)),
    me: me ? { id: me.id, status: me.status, payDeadline: me.payDeadline?.toISOString() ?? null, orderId: me.orderId, token: viewer.token! } : null,
  };
}

export async function sellerGroupBuys(storeId: string) {
  const groups = await db.groupBuy.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 100, include: { members: { orderBy: { createdAt: "asc" } } } });
  return groups.map((group) => ({
    id: group.id,
    productName: group.productName,
    variantLabel: group.variantLabel,
    price: group.priceKobo / 100,
    retail: group.retailKobo / 100,
    size: group.size,
    joined: joinedCount(group.members),
    status: group.status,
    endsAt: group.endsAt.toISOString(),
    createdAt: group.createdAt.toISOString(),
    members: group.members.filter((member) => member.status !== "pending").map((member) => ({ id: member.id, name: member.name, phone: member.phone, status: member.status, orderId: member.orderId, payDeadline: member.payDeadline?.toISOString() ?? null })),
  }));
}

/** The seller closes an open group early: nobody is charged (card checks were already refunded). */
export async function cancelGroupBuy(storeId: string, groupId: string) {
  const moved = await db.groupBuy.updateMany({ where: { id: groupId, storeId, status: "open" }, data: { status: "cancelled", cancelledAt: new Date() } });
  if (moved.count !== 1) return { ok: false as const, error: "Only an open group can be closed." };
  await closeUnfilled(groupId, "closed by the shop");
  return { ok: true as const };
}

async function closeUnfilled(groupId: string, why: string) {
  const group = await db.groupBuy.findUnique({ where: { id: groupId }, include: { members: true } });
  if (!group) return;
  const store = await db.store.findUnique({ where: { id: group.storeId }, select: { name: true } });
  await db.groupBuyMember.updateMany({ where: { groupId, status: { in: ["pending", "joined"] } }, data: { status: "cancelled" } });
  for (const member of group.members.filter((row) => row.status === "joined")) {
    await messageShopper({ storeId: group.storeId, phone: member.phone, email: member.email, name: member.name, event: "group_buy_cancelled", refId: member.id, sms: `${store?.name ?? "The shop"}: the group buy for ${group.productName} didn't fill (${why}). Nobody was charged.`, email_: { subject: `Group buy closed: ${group.productName}`, heading: "The group didn't fill", body: `the group buy for ${group.productName} closed (${why}). Nobody was charged, and the ₦50 card check was sent back to you.` } });
  }
}

// ─── The hourly sweep ──────────────────────────────────────────────────────────

export async function runGroupBuySweep(now = new Date()) {
  const result = { cancelled: 0, dropped: 0 };
  const expired = await db.groupBuy.findMany({ where: { status: "open", endsAt: { lte: now } }, select: { id: true, storeId: true, productName: true }, take: 200 });
  for (const group of expired) {
    const moved = await db.groupBuy.updateMany({ where: { id: group.id, status: "open" }, data: { status: "cancelled", cancelledAt: now } });
    if (moved.count !== 1) continue;
    result.cancelled += 1;
    await closeUnfilled(group.id, "time ran out");
  }
  const late = await db.groupBuyMember.findMany({ where: { status: "pay_link", payDeadline: { lt: now } }, select: { id: true, groupId: true, name: true, group: { select: { storeId: true, productName: true } } }, take: 500 });
  for (const member of late) {
    const moved = await db.groupBuyMember.updateMany({ where: { id: member.id, status: "pay_link" }, data: { status: "dropped" } });
    if (moved.count !== 1) continue;
    result.dropped += 1;
    await settleGroupStatus(member.groupId);
    await tellSeller(member.group.storeId, { title: `Group buy: ${member.name} didn't pay`, description: `${member.name} didn't pay within 2 hours, so they're out of the group for ${member.group.productName}. Nobody else is affected.`, link: "/home/group-buys", dedupeKey: `group-buy.dropped:${member.id}` });
  }
  return result;
}

export { groupUrl };
