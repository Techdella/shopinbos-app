// Who pays when things go wrong: the owner's table, as one pure resolver. Pure (no imports) so
// tests/fault-matrix.test.mjs can load it directly; src/lib/faults/*.server.ts reads the order and applies the outcome.
//
// Shopinbos never holds anyone's money (src/lib/wallet/rules.ts): the customer's payment is split at checkout and
// settled straight to each business's bank. So when something goes wrong, money moves only two ways:
//   1. The customer's refund, through the existing refund route (src/lib/commerce/refunds.server.ts). For a split
//      payment the seller sends it (route "manual"), except Shopinbos's own take on the part being undone, which
//      Shopinbos refunds itself from its own balance (refundFromShopinbosKobo).
//   2. Money owed between businesses (BusinessDebt, shared/money-owed.ts), recorded for the at-fault party and taken
//      automatically from their next payments (the checkout split's deductions), so nobody chases anyone.
//
// | What happened                     | Customer                        | Supplier                        | Seller                    | Logistics                         |
// | Out of stock after payment        | Full refund                     | No pay; strike                  | No margin, no fee         | Not involved                      |
// | Supplier ships late               | Can cancel for full refund      | Strike; review after 3          | Margin lost if cancelled  | Not involved                      |
// | Wrong/damaged item (packing photo)| Full refund or replacement      | Pays return trip + replacement  | Keeps margin (replacement)| Paid for both trips               |
// | Damaged in transit (photo fine)   | Full refund or replacement      | Paid                            | Paid                      | Pays (deposit, else owed) / no fee|
// | Customer unreachable              | Refund minus delivery fee       | Gets item back                  | No margin                 | Paid for the trip                 |
// | Customer changes mind             | Return at own cost (if allowed) | Gets item back, unpaid till sold| No margin                 | Paid for both trips               |
// | Pay on delivery refused           | Loses the fee paid upfront      | Gets item back                  | No margin                 | Paid for trip, no cash handled    |
//
// "The photo of the sealed parcel at handover is what decides most disputes": suggestFault reads the evidence.

export const FAULT_EVENTS = ["out_of_stock", "shipped_late", "wrong_item", "damaged_in_transit", "customer_unreachable", "changed_mind", "pod_refused"] as const;
export type FaultEvent = (typeof FAULT_EVENTS)[number];
export const isFaultEvent = (value: unknown): value is FaultEvent => (FAULT_EVENTS as readonly string[]).includes(String(value));

export const FAULT_LABELS: Record<FaultEvent, string> = {
  out_of_stock: "Out of stock after payment",
  shipped_late: "Supplier shipped late",
  wrong_item: "Wrong or damaged item (packing)",
  damaged_in_transit: "Damaged or lost in transit",
  customer_unreachable: "Customer unreachable, delivery failed",
  changed_mind: "Customer changed their mind",
  pod_refused: "Pay on delivery: customer wouldn't pay",
};

/** Who is at fault, per event (the owner's table). */
export const FAULT_PARTY: Record<FaultEvent, "supplier" | "logistics" | "customer"> = {
  out_of_stock: "supplier",
  shipped_late: "supplier",
  wrong_item: "supplier",
  damaged_in_transit: "logistics",
  customer_unreachable: "customer",
  changed_mind: "customer",
  pod_refused: "customer",
};

export const REMEDIES = ["refund", "replacement"] as const;
export type Remedy = (typeof REMEDIES)[number];
/** Events where the customer can choose a replacement instead of a refund. */
export const REPLACEABLE: readonly FaultEvent[] = ["wrong_item", "damaged_in_transit"];

export type Party = { role: "seller" } | { role: "supplier"; supplierId: string } | { role: "logistics"; partnerId: string };

/** Debts below this are too small to take from a payment (Paystack won't settle less), so they're let go. */
export const MIN_FAULT_DEBT_KOBO = 10_000;

/** One parcel of the order: the seller's own lines ("own") or one supplier's ("supplier:<id>"). */
export interface FaultPart {
  key: string;
  supplierId: string | null;
  /** What the customer paid for this part's goods (retail price × quantity), in kobo. */
  goodsKobo: number;
  /** What the split settled to the supplier for these goods (their cost less commission). 0: not paid in the split. */
  supplierPaidKobo: number;
  /** Shopinbos's own take on this part (the supplier's commission, or its fee on the seller's own lines). */
  platformKobo: number;
  /** What the customer paid for this parcel's delivery. */
  deliveryChargeKobo: number;
  /** The delivery partner carrying it (null: the seller's or the supplier's own delivery). */
  partner: {
    partnerId: string;
    /** The fee the split (or the pay-on-delivery fee) settled to the partner. 0: the seller pays them directly. */
    paidKobo: number;
    /** From the partner's rate card. */
    failedAttemptFeeKobo: number;
    returnFeeKobo: number;
  } | null;
}

export interface FaultOrder {
  orderNumber: string;
  /** false: pay on delivery whose door payment never came (only the delivery fee was paid upfront). */
  goodsPaid: boolean;
  /** The payment was split at checkout (each business already has its share). */
  split: boolean;
  parts: FaultPart[];
}

export interface FaultInput {
  event: FaultEvent;
  order: FaultOrder;
  /** The parts it's about (a partial order); default: every part. */
  partKeys?: string[];
  remedy?: Remedy;
  /** Change of mind: who pays the return trip (the store's returns setting). */
  returnPayer?: "customer" | "seller";
  /** Damaged in transit: what the partner holds as a deposit (none exists yet: 0). */
  partnerDepositKobo?: number;
}

export type DebtKind = "goods_back" | "delivery_back" | "return_trip" | "replacement_trip" | "failed_trip" | "damage";

export interface FaultDebt {
  from: Party;
  to: Party;
  kobo: number;
  kind: DebtKind;
  partKey: string;
  /** shared/money-owed.ts DEBT_REASONS key. */
  reason: string;
  /** Plain words for both sides' statements. */
  why: string;
  /** Paid from the partner's deposit (not owed, nothing to deduct). */
  fromDeposit?: boolean;
}

export interface FaultOutcome {
  event: FaultEvent;
  remedy: Remedy;
  partKeys: string[];
  /** What goes back to the customer, in all. */
  refundKobo: number;
  /** Of that, what the seller sends (a split payment) or the refund route takes from the payment. */
  refundFromSellerKobo: number;
  /** Of that, Shopinbos's own take on the undone part, refunded by Shopinbos itself. */
  refundFromShopinbosKobo: number;
  /** What the customer pays for the trips (kept back from their refund). */
  customerChargedKobo: number;
  debts: FaultDebt[];
  /** Drawn from the partner's deposit before anything is owed. */
  depositKobo: number;
  strikes: Array<{ supplierId: string; kind: "out_of_stock" | "late" }>;
  /** Parts the supplier (or seller) sends again, at no cost to the customer. */
  replacements: Array<{ partKey: string; supplierId: string | null }>;
  /** Trips back (or a replacement trip) to book with the partner, and who pays. */
  trips: Array<{ partKey: string; partnerId: string; kind: "return" | "replacement"; feeKobo: number; paidBy: "customer" | "seller" | "supplier" | "logistics" }>;
  /** The item goes back to whoever sent it (the supplier, or the seller's own stock). */
  itemBack: boolean;
  lines: { customer: string; supplier: string | null; seller: string; logistics: string | null };
}

const SELLER: Party = { role: "seller" };
const naira = (kobo: number) => `₦${(Math.round(kobo) / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
const pos = (kobo: number | null | undefined) => Math.max(0, Math.round(Number(kobo) || 0));

/** Why this outcome can't be resolved as asked, or null. */
export function faultProblem(input: FaultInput): string | null {
  if (!isFaultEvent(input.event)) return "Pick what happened.";
  if (!input.order.parts.length) return "This order has nothing to resolve.";
  const keys = input.partKeys?.length ? input.partKeys : input.order.parts.map((part) => part.key);
  if (keys.some((key) => !input.order.parts.some((part) => part.key === key))) return "That part isn't in this order.";
  if (input.remedy === "replacement" && !REPLACEABLE.includes(input.event)) return "Only a wrong, damaged or lost item can be replaced.";
  return null;
}

/**
 * The outcome of one thing going wrong on (part of) an order: the customer's refund (and who sends it), what each
 * business owes whom, strikes, replacements and trips. Amounts in kobo; nothing is ever below zero.
 */
export function resolveFault(input: FaultInput): FaultOutcome {
  const problem = faultProblem(input);
  if (problem) throw new Error(problem);
  const event = input.event;
  const remedy: Remedy = input.remedy === "replacement" && REPLACEABLE.includes(event) ? "replacement" : "refund";
  const keys = input.partKeys?.length ? input.partKeys : input.order.parts.map((part) => part.key);
  const parts = input.order.parts.filter((part) => keys.includes(part.key));
  const paid = input.order.goodsPaid;
  const order = input.order.orderNumber;

  let refund = 0;
  let fromShopinbos = 0;
  let charged = 0;
  let deposit = pos(input.partnerDepositKobo);
  let depositUsed = 0;
  let itemBack = false;
  const debts: FaultDebt[] = [];
  const strikes: FaultOutcome["strikes"] = [];
  const replacements: FaultOutcome["replacements"] = [];
  const trips: FaultOutcome["trips"] = [];
  const owe = (from: Party, to: Party, kobo: number, kind: DebtKind, partKey: string, reason: string, why: string) => {
    const amount = pos(kobo);
    if (amount > 0) debts.push({ from, to, kobo: amount, kind, partKey, reason, why });
  };

  for (const part of parts) {
    // Pay on delivery not paid at the door: no goods money moved, only the delivery fee upfront.
    const goods = paid ? pos(part.goodsKobo) : 0;
    const supplierPaid = paid ? pos(part.supplierPaidKobo) : 0;
    const take = paid && input.order.split ? Math.min(pos(part.platformKobo), goods) : 0;
    const delivery = pos(part.deliveryChargeKobo);
    const partner = part.partner;
    const partnerParty: Party | null = partner ? { role: "logistics", partnerId: partner.partnerId } : null;
    const supplierParty: Party | null = part.supplierId ? { role: "supplier", supplierId: part.supplierId } : null;
    const tag = `order ${order}`;

    switch (event) {
      case "out_of_stock":
      case "shipped_late": {
        // Nothing left: the customer gets it all back; the supplier returns its pay; a partner paid for a trip it
        // never made returns its fee; Shopinbos returns its take.
        refund += goods + delivery;
        fromShopinbos += take;
        const words = event === "out_of_stock" ? "out of stock after payment" : "not sent in time, cancelled by the customer";
        if (supplierParty) {
          owe(supplierParty, SELLER, supplierPaid, "goods_back", part.key, event === "out_of_stock" ? "out_of_stock" : "shipped_late", `${tag}: ${words}. Your pay for it goes back to the shop.`);
          strikes.push({ supplierId: part.supplierId!, kind: event === "out_of_stock" ? "out_of_stock" : "late" });
        }
        if (partnerParty) owe(partnerParty, SELLER, partner!.paidKobo, "delivery_back", part.key, "delivery_not_made", `${tag}: the parcel was never sent, so the delivery fee goes back to the shop.`);
        break;
      }
      case "wrong_item": {
        // The packing photo shows it: the sender's fault (the supplier, or the seller for their own stock).
        const returnFee = partner ? pos(partner.returnFeeKobo) : 0;
        if (remedy === "replacement") {
          replacements.push({ partKey: part.key, supplierId: part.supplierId });
          if (partner) {
            trips.push({ partKey: part.key, partnerId: partner.partnerId, kind: "return", feeKobo: returnFee, paidBy: supplierParty ? "supplier" : "seller" });
            const tripFee = pos(partner.paidKobo) || delivery;
            trips.push({ partKey: part.key, partnerId: partner.partnerId, kind: "replacement", feeKobo: tripFee, paidBy: supplierParty ? "supplier" : "seller" });
            if (supplierParty) {
              owe(supplierParty, partnerParty!, returnFee, "return_trip", part.key, "return_trip", `${tag}: wrong or damaged item, the packing photo showed it. The trip back is on you.`);
              owe(supplierParty, partnerParty!, tripFee, "replacement_trip", part.key, "return_trip", `${tag}: wrong or damaged item. The replacement's delivery is on you.`);
            } else {
              owe(SELLER, partnerParty!, returnFee + tripFee, "return_trip", part.key, "return_trip", `${tag}: wrong item from your own stock. The trip back and the replacement's delivery.`);
            }
          }
          itemBack = true;
          break;
        }
        refund += goods + delivery;
        fromShopinbos += take;
        if (supplierParty) {
          owe(supplierParty, SELLER, supplierPaid + delivery, "goods_back", part.key, "wrong_item", `${tag}: wrong or damaged item, the packing photo showed it. Your pay and the delivery the customer paid go back to the shop.`);
          if (partner) owe(supplierParty, partnerParty!, returnFee, "return_trip", part.key, "return_trip", `${tag}: wrong or damaged item. The trip back is on you.`);
        } else if (partner) {
          owe(SELLER, partnerParty!, returnFee, "return_trip", part.key, "return_trip", `${tag}: wrong item from your own stock. The trip back.`);
        }
        if (partner) trips.push({ partKey: part.key, partnerId: partner.partnerId, kind: "return", feeKobo: returnFee, paidBy: supplierParty ? "supplier" : "seller" });
        itemBack = true;
        break;
      }
      case "damaged_in_transit": {
        // The packing photos are fine and the rider took the sealed parcel: the partner pays.
        if (!partnerParty) {
          // The seller's own delivery: nobody else to pay it.
          if (remedy === "replacement") replacements.push({ partKey: part.key, supplierId: part.supplierId });
          else refund += goods + delivery;
          break;
        }
        let owed: Array<{ to: Party; kobo: number; kind: DebtKind; why: string }>;
        if (remedy === "replacement") {
          replacements.push({ partKey: part.key, supplierId: part.supplierId });
          trips.push({ partKey: part.key, partnerId: partner!.partnerId, kind: "replacement", feeKobo: 0, paidBy: "logistics" });
          owed = supplierParty
            ? [{ to: supplierParty, kobo: supplierPaid || goods, kind: "damage", why: `${tag}: damaged or lost after pickup. The supplier sends another one; you pay for the goods and redeliver for free.` }]
            : [{ to: SELLER, kobo: goods, kind: "damage", why: `${tag}: damaged or lost after pickup. The shop sends another one; you pay for the goods and redeliver for free.` }];
        } else {
          refund += goods + delivery;
          owed = [{ to: SELLER, kobo: goods + delivery, kind: "damage", why: `${tag}: damaged or lost after pickup. The customer's refund (the goods and your fee) comes from you.` }];
        }
        for (const row of owed) {
          const fromDeposit = Math.min(deposit, row.kobo);
          deposit -= fromDeposit;
          depositUsed += fromDeposit;
          if (fromDeposit > 0) debts.push({ from: partnerParty, to: row.to, kobo: fromDeposit, kind: row.kind, partKey: part.key, reason: "damaged_in_transit", why: `${row.why} Paid from your deposit.`, fromDeposit: true });
          owe(partnerParty, row.to, row.kobo - fromDeposit, row.kind, part.key, "damaged_in_transit", row.why);
        }
        break;
      }
      case "customer_unreachable": {
        // The trip was made: the partner keeps its fee, and the failed attempt and the trip back come out of the
        // customer's refund (the at-fault party). The goods go back; their money goes back.
        const tripBack = partner ? pos(partner.failedAttemptFeeKobo) + pos(partner.returnFeeKobo) : 0;
        const kept = Math.min(goods, tripBack);
        const back = goods - kept;
        refund += back;
        charged += kept;
        fromShopinbos += Math.min(take, back);
        if (supplierParty) owe(supplierParty, SELLER, supplierPaid, "goods_back", part.key, "delivery_failed", `${tag}: delivery failed, the customer couldn't be reached. The item comes back to you, so your pay goes back to the shop.`);
        if (partner && kept > 0) owe(SELLER, partnerParty!, kept, "failed_trip", part.key, "return_trip", `${tag}: delivery failed. The failed attempt and the trip back, kept from the customer's refund.`);
        if (partner) trips.push({ partKey: part.key, partnerId: partner.partnerId, kind: "return", feeKobo: tripBack, paidBy: "customer" });
        itemBack = true;
        break;
      }
      case "changed_mind": {
        // A return the store allows: the customer pays the trip back (or the seller, by the store's setting); the
        // first delivery isn't refunded (the partner made that trip).
        const returnFee = partner ? pos(partner.returnFeeKobo) : 0;
        const customerPays = input.returnPayer !== "seller";
        const kept = customerPays ? Math.min(goods, returnFee) : 0;
        const back = goods - kept;
        refund += back;
        charged += kept;
        fromShopinbos += Math.min(take, back);
        if (supplierParty) owe(supplierParty, SELLER, supplierPaid, "goods_back", part.key, "returned", `${tag}: returned by the customer. The item comes back to you; you're paid again when it sells.`);
        if (partner && returnFee > 0) owe(SELLER, partnerParty!, returnFee, "return_trip", part.key, "return_trip", `${tag}: the customer's return trip${customerPays ? ", kept from their refund" : ""}.`);
        if (partner) trips.push({ partKey: part.key, partnerId: partner.partnerId, kind: "return", feeKobo: returnFee, paidBy: customerPays ? "customer" : "seller" });
        itemBack = true;
        break;
      }
      case "pod_refused": {
        // Pay on delivery the customer wouldn't pay: they lose the delivery fee paid upfront (the partner keeps it,
        // no cash handled); nothing else was paid, so nobody owes anything. The parcel goes back.
        itemBack = true;
        break;
      }
    }
  }

  // Too small to take from a payment: let it go rather than leave it hanging.
  const kept = debts.filter((debt) => debt.fromDeposit || debt.kobo >= MIN_FAULT_DEBT_KOBO);
  const outcome: FaultOutcome = {
    event,
    remedy,
    partKeys: parts.map((part) => part.key),
    refundKobo: refund,
    refundFromSellerKobo: refund - Math.min(fromShopinbos, refund),
    refundFromShopinbosKobo: Math.min(fromShopinbos, refund),
    customerChargedKobo: charged,
    debts: kept,
    depositKobo: depositUsed,
    strikes,
    replacements,
    trips,
    itemBack,
    lines: { customer: "", supplier: null, seller: "", logistics: null },
  };
  outcome.lines = faultLines(outcome, input.order);
  return outcome;
}

/** What each party sees, in plain words with the amounts. */
export function faultLines(outcome: FaultOutcome, order: Pick<FaultOrder, "orderNumber" | "parts" | "goodsPaid">): FaultOutcome["lines"] {
  const owedBy = (role: Party["role"]) => outcome.debts.filter((debt) => debt.from.role === role && !debt.fromDeposit).reduce((sum, debt) => sum + debt.kobo, 0);
  const owedTo = (role: Party["role"]) => outcome.debts.filter((debt) => debt.to.role === role).reduce((sum, debt) => sum + debt.kobo, 0);
  const parts = order.parts.filter((part) => outcome.partKeys.includes(part.key));
  const hasSupplier = parts.some((part) => part.supplierId);
  const hasPartner = parts.some((part) => part.partner);
  const e = outcome.event;

  let customer: string;
  if (outcome.remedy === "replacement") customer = "A replacement is on its way at no cost to you.";
  else if (e === "pod_refused") customer = "Not paid at the door, so the parcel went back. The delivery fee paid upfront isn't refunded.";
  else if (outcome.refundKobo <= 0) customer = "Nothing to refund.";
  else if (outcome.customerChargedKobo > 0) customer = `Refund ${naira(outcome.refundKobo)} (${naira(outcome.customerChargedKobo)} kept for the ${e === "changed_mind" ? "return trip" : "failed delivery and the trip back"}).`;
  else customer = e === "customer_unreachable" ? `Refund ${naira(outcome.refundKobo)}, less the delivery fee.` : `Full refund: ${naira(outcome.refundKobo)}.`;

  const sellerOwes = owedBy("seller");
  const sellerGets = owedTo("seller");
  const sellerBits: string[] = [];
  if (outcome.refundFromSellerKobo > 0) sellerBits.push(`send the customer ${naira(outcome.refundFromSellerKobo)}${outcome.refundFromShopinbosKobo > 0 ? ` (Shopinbos refunds its own ${naira(outcome.refundFromShopinbosKobo)})` : ""}`);
  if (sellerGets > 0) sellerBits.push(`${naira(sellerGets)} comes back to you from ${[hasSupplier && outcome.debts.some((d) => d.to.role === "seller" && d.from.role === "supplier") ? "the supplier" : null, outcome.debts.some((d) => d.to.role === "seller" && d.from.role === "logistics") ? "the delivery partner" : null].filter(Boolean).join(" and ")}, taken from their next payments`);
  if (sellerOwes > 0) sellerBits.push(`${naira(sellerOwes)} for the trip goes to the delivery partner${outcome.customerChargedKobo > 0 ? " (kept from the customer's refund)" : ""}`);
  const margin = e === "damaged_in_transit" || outcome.remedy === "replacement" ? "You keep your margin." : e === "pod_refused" ? "No sale, so no margin." : "No margin on this one.";
  const seller = `${margin}${sellerBits.length ? ` ${sellerBits.map((bit, index) => (index === 0 ? bit.charAt(0).toUpperCase() + bit.slice(1) : bit)).join("; ")}.` : ""}`;

  let supplier: string | null = null;
  if (hasSupplier) {
    const owes = owedBy("supplier");
    const gets = owedTo("supplier");
    const strike = outcome.strikes.length ? " A strike is added (3 in 90 days and our team reviews your account)." : "";
    if (e === "damaged_in_transit") supplier = outcome.remedy === "replacement" ? `You're paid. Send a replacement: ${naira(gets)} for it comes from the delivery partner.` : "You're paid: it was damaged after pickup.";
    else if (e === "pod_refused") supplier = "The parcel comes back to you. Nothing was paid, so nothing is owed.";
    else if (owes > 0) supplier = `${naira(owes)} deducted from your next payments.${outcome.itemBack ? " The item comes back to you." : ""}${strike}`;
    else supplier = `${outcome.itemBack ? "The item comes back to you." : "Nothing to pay."}${strike}`;
  }

  let logistics: string | null = null;
  if (hasPartner) {
    const owes = owedBy("logistics");
    const gets = owedTo("logistics");
    if (e === "damaged_in_transit") logistics = `${outcome.depositKobo > 0 ? `${naira(outcome.depositKobo)} from your deposit; ` : ""}${owes > 0 ? `${naira(owes)} deducted from your next payments` : "nothing more owed"}${outcome.remedy === "replacement" ? ", and you redeliver for free" : ""}.`;
    else if (e === "out_of_stock" || e === "shipped_late") logistics = owes > 0 ? `Not involved: the parcel never left, so the ${naira(owes)} fee goes back.` : "Not involved: the parcel never left.";
    else if (e === "pod_refused") logistics = "Paid for the trip (the fee was paid upfront). No cash handled.";
    else logistics = `Paid for the trip${gets > 0 ? `, and ${naira(gets)} for the trip back` : ""}.`;
  }
  return { customer, supplier, seller, logistics };
}

/** The money each party gains (+) or loses (-) through the outcome, for checks and the admin screen. */
export function partyNets(outcome: FaultOutcome) {
  const key = (party: Party) => (party.role === "seller" ? "seller" : party.role === "supplier" ? `supplier:${party.supplierId}` : `logistics:${party.partnerId}`);
  const nets = new Map<string, number>([["customer", outcome.refundKobo], ["seller", 0 - outcome.refundFromSellerKobo], ["shopinbos", 0 - outcome.refundFromShopinbosKobo]]);
  const add = (who: string, kobo: number) => nets.set(who, (nets.get(who) ?? 0) + kobo + 0);
  for (const debt of outcome.debts) {
    add(key(debt.from), -debt.kobo);
    add(key(debt.to), debt.kobo);
  }
  return Object.fromEntries(nets);
}

// ─── What the evidence suggests ──────────────────────────────────────────────

export interface FaultEvidence {
  /** The supplier's (or seller's) photo of the item in the open box, and of the sealed parcel. */
  contentsPhoto: boolean;
  sealedPhoto: boolean;
  /** The rider's photo of the sealed parcel at pickup, and at handover. */
  pickupPhoto: boolean;
  handoverPhoto: boolean;
  delivered: boolean;
  /** The job failed or came back. */
  jobFailed: boolean;
  /** The parcel left the sender (picked up). */
  pickedUp: boolean;
}

export type ReportKind = "wrong_item" | "damaged" | "not_delivered" | "late";

/**
 * The outcome the evidence points to for a customer's report, pre-selected for the team (who confirm or change it).
 * event null: nobody owes anything (the handover photo shows it was delivered).
 */
export function suggestFault(kind: ReportKind | string, evidence: FaultEvidence): { event: FaultEvent | null; why: string } {
  if (kind === "wrong_item") {
    return { event: "wrong_item", why: evidence.contentsPhoto ? "Check the contents photo against the customer's: a different item means the sender packed it wrong." : "No contents photo: the sender can't show what they packed, so it's on them." };
  }
  if (kind === "damaged") {
    if (!evidence.contentsPhoto || !evidence.sealedPhoto) return { event: "wrong_item", why: "The packing photos are missing, so the sender can't show it left in good shape." };
    if (!evidence.pickedUp) return { event: "wrong_item", why: "It never went with a delivery partner, so the sender is responsible." };
    return { event: "damaged_in_transit", why: evidence.pickupPhoto ? "The packing photos look fine and the rider photographed the sealed parcel at pickup: it was damaged on the way." : "The packing photos look fine and the rider took the parcel (without a pickup photo): it was damaged on the way." };
  }
  if (kind === "not_delivered") {
    if (evidence.delivered && evidence.handoverPhoto) return { event: null, why: "The rider's handover photo shows it was delivered. Ask the customer to check with their household." };
    if (evidence.jobFailed) return { event: "customer_unreachable", why: "The rider couldn't reach the customer and the parcel came back." };
    if (evidence.pickedUp) return { event: "damaged_in_transit", why: evidence.delivered ? "Marked delivered without a handover photo: treated as lost after pickup." : "Picked up and never delivered: lost after pickup." };
    return { event: "shipped_late", why: "It never left the sender." };
  }
  return { event: null, why: "A late delivery: the customer can cancel once the ship-by date passes." };
}

/**
 * A failed delivery the customer caused (the Riders app's reasons: not answering, not there, refused, wrong address,
 * couldn't pay), so it's resolved on its own when the parcel is back. Anything else waits for the team.
 */
export function customerSideFailure(reason: string | null | undefined) {
  return /customer|address|refus|couldn't pay|could not pay|not at|unreachable|didn't pick/i.test(reason ?? "");
}

/** The outcome when a parcel came back: pay on delivery not paid at the door, or a customer who couldn't be reached. */
export function returnedEvent(order: { paymentMethod: string | null; goodsPaid: boolean }): FaultEvent {
  return order.paymentMethod === "pay_on_delivery" && !order.goodsPaid ? "pod_refused" : "customer_unreachable";
}

// ─── Ship-by deadline and supplier strikes ───────────────────────────────────

/** Days a strike counts for. */
export const STRIKE_DAYS = 90;
/** Strikes (within STRIKE_DAYS) that send the supplier to the team for review: never an automatic suspension. */
export const STRIKES_FOR_REVIEW = 3;
export const STRIKE_KINDS = ["late", "out_of_stock"] as const;
export type StrikeKind = (typeof STRIKE_KINDS)[number];
export const STRIKE_LABELS: Record<StrikeKind, string> = { late: "Shipped late", out_of_stock: "Out of stock after payment" };

const DAY_MS = 86_400_000;
const LAGOS_MS = 60 * 60 * 1000;

/** When a strike made `at` stops counting. */
export function strikeExpires(at: Date) {
  return new Date(at.getTime() + STRIKE_DAYS * DAY_MS);
}

/** Strikes still counting at `now`. */
export function activeStrikes<T extends { expiresAt: Date | string }>(strikes: readonly T[], now = new Date()): T[] {
  return strikes.filter((strike) => new Date(strike.expiresAt).getTime() > now.getTime());
}

/** The supplier goes to the team for review: STRIKES_FOR_REVIEW strikes still counting. */
export function needsReview(activeCount: number) {
  return activeCount >= STRIKES_FOR_REVIEW;
}

/**
 * The ship-by deadline for a supplier order: `handlingDays` working days after it was accepted, at the end of that
 * working day (18:00 in Lagos). Saturdays and Sundays don't count.
 */
export function shipByDate(acceptedAt: Date, handlingDays: number | null | undefined) {
  const days = Math.min(10, Math.max(1, Math.round(Number(handlingDays) || 1)));
  const lagos = new Date(acceptedAt.getTime() + LAGOS_MS);
  let day = Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate());
  let left = days;
  while (left > 0) {
    day += DAY_MS;
    const weekday = new Date(day).getUTCDay();
    if (weekday !== 0 && weekday !== 6) left -= 1;
  }
  return new Date(day + 18 * 60 * 60 * 1000 - LAGOS_MS);
}

/** The order is late: past its ship-by and still not handed over. */
export function isShippedLate(order: { status: string; shipBy: Date | string | null; shippedAt?: Date | string | null }, now = new Date()) {
  if (!order.shipBy || order.shippedAt) return false;
  if (order.status !== "accepted" && order.status !== "pending") return false;
  return new Date(order.shipBy).getTime() < now.getTime();
}

// ─── Returns (a per-store switch) ────────────────────────────────────────────

export const RETURN_PAYERS = ["customer", "seller"] as const;
export type ReturnPayer = (typeof RETURN_PAYERS)[number];
export const RETURN_REASONS = ["changed_mind", "doesnt_fit", "not_as_expected"] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];
export const RETURN_STATUSES = ["requested", "approved", "declined", "received", "refunded", "cancelled"] as const;
export const RETURN_WINDOW_MAX = 30;

export interface ReturnsSetting {
  returnsAllowed: boolean;
  returnWindowDays: number;
  returnShippingPayer: string;
}

export function cleanReturnWindow(value: unknown) {
  const days = Math.round(Number(value));
  return Number.isFinite(days) ? Math.min(RETURN_WINDOW_MAX, Math.max(1, days)) : 7;
}

/** Why the customer can't ask for a return of this order now, or null. */
export function returnProblem(store: ReturnsSetting, order: { status: string; deliveredAt: Date | string | null }, now = new Date()): string | null {
  if (!store.returnsAllowed) return "This shop doesn't take returns. Report a problem if something's wrong with your order.";
  if (order.status !== "delivered" || !order.deliveredAt) return "You can ask for a return once your order is delivered.";
  const days = cleanReturnWindow(store.returnWindowDays);
  if (now.getTime() - new Date(order.deliveredAt).getTime() > days * DAY_MS) return `Returns close ${days} days after delivery.`;
  return null;
}
