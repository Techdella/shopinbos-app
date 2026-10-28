// Dropship at checkout (the owner's "Supplier & Dropship Rules", Oct 2026): who pays each supplier parcel's delivery,
// the parcels the customer sees ("Ships from Port Harcourt · ₦4,500 · Arrives Mon 3 – Thu 6 Nov"), the seller's part
// of delivery that comes out of their share, and the dearest delivery a seller could have to cover (the margin check
// when they add a supplier's product). Pure, shared by the server, the web checkout and the phone app; unit-tested in
// tests/dropship-checkout.test.mjs.
//
// Money: the carrier (a delivery partner, or the supplier delivering its own parcel) is always paid the parcel's full
// `price`. The customer pays its `charge` (customerDeliveryCharge). The order's total is lower by the difference, and
// the payment split pays the seller whatever is left after the carriers, suppliers and Shopinbos's fee
// (src/lib/wallet/rules.ts buildSplitPlan), so the seller's share is lower by exactly the part of delivery they cover.

import {
  BRANDING_CHOICE_LABELS,
  DEFAULT_ZONE_RATES,
  DELIVERY_ZONES,
  ZONE_LABELS,
  arrivalWords,
  brandingChoicesFor,
  brandingOfferFor,
  cleanDropshipMinQty,
  cleanHandlingDays,
  customerDeliveryCharge,
  dropshipMargin,
  dropshipOptionWords,
  dropshipUnitPrice,
  isDeliveryPayer,
  readBrandingOffer,
  readZoneRates,
  retailFloor,
  sellerPriceProblem,
  supplierStockState,
  zoneQuote,
  zoneRatesEmpty,
  type BrandingChoice,
  type ChannelPrices,
  type DeliveryPayer,
  type DeliveryZone,
  type ZoneRates,
} from "./dropship-rules.ts";
import { SIZE_BANDS, isSizeBand, timeframeWords, type DeliveryPlan, type Place, type MarketChoice, type MarketOption, type OptionPart, type SizeBand } from "./delivery-market.ts";

const money = (value: number) => Math.round(value * 100) / 100;

/** Who pays delivery for one product (StoreProduct.deliveryPayer / deliveryFlatFee). */
export interface PayerRule {
  payer: string | null | undefined;
  flatFee?: number | null;
}

/**
 * The rule for a parcel holding several of the seller's products: the kindest to the customer wins (one product
 * with free delivery makes that parcel free), so the customer never pays more than any product page promised.
 * No rules: the customer pays.
 */
export function parcelPayer(rules: readonly PayerRule[], probeFee = 1_000_000): PayerRule {
  if (!rules.length) return { payer: "customer", flatFee: null };
  return rules.reduce((best, rule) => (customerDeliveryCharge(rule.payer, probeFee, rule.flatFee) < customerDeliveryCharge(best.payer, probeFee, best.flatFee) ? rule : best));
}

/** What the customer pays for one part of an option. */
export const partCharge = (part: Pick<OptionPart, "price" | "charge">) => (typeof part.charge === "number" ? part.charge : part.price);

/**
 * Applies each parcel's payer rule to every option: each part gets its `charge` (what the customer pays) and the
 * option's price becomes the sum of the charges. Parts with no rule (the shop's own parcel) are unchanged.
 */
export function applyDeliveryPayers(choice: MarketChoice, rules: Readonly<Record<string, PayerRule>>): MarketChoice {
  const keys = Object.keys(rules);
  if (!keys.length) return choice;
  const options: MarketOption[] = choice.options.map((option) => {
    if (!option.parts.some((part) => rules[part.shipmentKey])) return option;
    const parts = option.parts.map((part) => {
      const rule = rules[part.shipmentKey];
      if (!rule) return part;
      const charge = customerDeliveryCharge(rule.payer, part.price, rule.flatFee);
      return charge === part.price ? part : { ...part, charge };
    });
    return { ...option, price: money(parts.reduce((sum, part) => sum + partCharge(part), 0)), parts };
  });
  return { ...choice, options };
}

/** The part of delivery the seller covers on these parcels (the carriers' full fees less what the customer pays). */
export function sellerDeliveryCost(parts: ReadonlyArray<Pick<OptionPart, "price" | "charge">>): number {
  return money(parts.reduce((sum, part) => sum + Math.max(0, part.price - partCharge(part)), 0));
}

/** One parcel as the customer sees it at checkout. */
export interface ParcelLine {
  shipmentKey: string;
  /** "Port Harcourt": where it ships from (the supplier's city), or null for the shop's own parcel. */
  from: string | null;
  /** What the customer pays for it. */
  fee: number;
  /** What the carrier is paid (more than `fee` when the seller covers some of it). */
  carrierFee: number;
  /** The supplier delivers it with its own courier. */
  bySupplier: boolean;
  minDays: number;
  maxDays: number;
  /** "Arrives Mon 3 – Thu 6 Nov", or "2–5 days" when there's no date to show. */
  arrival: string | null;
}

/** The parcels of an option: one line per supplier parcel (and the shop's own one when there are several). */
export function parcelLines(parts: ReadonlyArray<OptionPart>, fromOf: Readonly<Record<string, string | null | undefined>>, now: Date = new Date()): ParcelLine[] {
  return parts
    .filter((part) => part.shipmentKey.startsWith("supplier:") || parts.length > 1)
    .map((part) => ({
      shipmentKey: part.shipmentKey,
      from: fromOf[part.shipmentKey]?.trim() || null,
      fee: partCharge(part),
      carrierFee: part.price,
      bySupplier: part.service === "supplier_self",
      minDays: part.minDays,
      maxDays: part.maxDays,
      arrival: part.maxDays > 0 ? arrivalWords(part.minDays, part.maxDays, now) : null,
    }));
}

/** "Ships from Port Harcourt · ₦4,500 · Arrives Mon 3 – Thu 6 Nov" (₦0 reads "Free delivery"). */
export function parcelWords(line: ParcelLine, format: (amount: number) => string = (amount) => `₦${Math.round(amount).toLocaleString("en-NG")}`): string {
  return [line.from ? `Ships from ${line.from}` : "From the shop", line.fee > 0 ? format(line.fee) : "Free delivery", line.arrival ?? (line.maxDays > 0 ? timeframeWords(line.minDays, line.maxDays) : null)]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The dearest delivery a seller could have to cover for one parcel of this size from this supplier's own rate card
 * (the price for the size, or the next bigger size when it's empty, in the dearest zone). 0 when the card is empty.
 */
export function dearestZoneFee(zoneRates: unknown, band: SizeBand | string | null | undefined): number {
  const rates: ZoneRates = readZoneRates(zoneRates);
  const start = Math.max(0, SIZE_BANDS.indexOf((band ?? "small") as SizeBand));
  let dearest = 0;
  for (const zone of DELIVERY_ZONES) {
    const size = SIZE_BANDS.slice(start).find((each) => rates[zone][each] !== undefined);
    if (size) dearest = Math.max(dearest, rates[zone][size]!);
  }
  return dearest;
}

/**
 * The delivery plan saved on an order from a store on its own zones whose bag has suppliers' own parcels: only those
 * parcels (the shop's own items go the old way), so each supplier gets its order marked "you deliver it" with its
 * full fee and the customer's code (src/lib/supplier-orders/service.server.ts reads supplier_self parts).
 */
export function zoneParcelsPlan(optionId: string | null | undefined, parts: readonly OptionPart[], ownItems: boolean): DeliveryPlan {
  return {
    version: 1,
    optionId: optionId || "supplier_parcels",
    kind: ownItems || parts.length > 1 ? "multi" : "doorstep",
    pod: false,
    shipments: parts.map((part) => ({ ...part, bookingId: null })),
  };
}

// ─── A supplier's product as a seller sees it before adding it ───────────────

/** What a seller sees before adding a supplier's dropship product: "You pay / Your price / You earn" and the rules. */
export interface DropshipTerms {
  /** You pay: the supplier's dropship price per piece. */
  cost: number;
  suggestedPrice: number;
  /** Lowest price allowed: the supplier's lowest retail price, and never below what the seller pays. */
  floor: number;
  minRetailPrice: number | null;
  /** "Ships 1 piece" · "Packs in 1 day" · "1 sample at the dropship price". */
  options: string[];
  minQty: number;
  handlingDays: number;
  sizeBand: SizeBand;
  /** The supplier's city ("Ships from Port Harcourt"). */
  shipsFrom: string | null;
  /** own: the supplier's own zone rates and courier; partners: delivery partners' rates. */
  rateSource: "partners" | "own";
  /** The delivery fee from the supplier to the seller's own state (own rates only), with its arrival window. */
  deliveryToYou: { zone: DeliveryZone; zoneLabel: string; price: number; minDays: number; maxDays: number } | null;
  /** The dearest delivery the seller could have to cover per parcel (free delivery or a flat fee). */
  dearestDelivery: number;
  /** dearestDelivery is Shopinbos's starting rate card, since partner prices depend on the route. */
  dearestIsEstimate: boolean;
  /** Branding the supplier offers (blind is always there), with the per-parcel fee of each. */
  branding: Array<{ choice: BrandingChoice; label: string; fee: number }>;
  stock: number;
  stockState: "out" | "low" | "ok";
}

export interface DropshipTermsInput {
  product: ChannelPrices & { dropshipMinQty?: number | null; handlingDays?: number | null; sizeBand?: string | null; sampleAvailable?: boolean | null; stockQuantity?: number | null };
  supplier: { city?: string | null; level?: string | null; brandingOffer?: unknown };
  /** The supplier's DeliverySettings (rateSource, zoneRates, origin). */
  delivery?: { rateSource?: string | null; zoneRates?: unknown } | null;
  origin?: Place | null;
  /** Where the seller is, for "delivery to your state". */
  sellerPlace?: Place | null;
}

export function dropshipTerms(input: DropshipTermsInput): DropshipTerms {
  const { product, supplier } = input;
  const cost = dropshipUnitPrice(product);
  const floor = retailFloor(product);
  const sizeBand: SizeBand = isSizeBand(product.sizeBand) ? product.sizeBand : "small";
  const handlingDays = cleanHandlingDays(product.handlingDays);
  const own = input.delivery?.rateSource === "own" && !zoneRatesEmpty(readZoneRates(input.delivery?.zoneRates));
  const quote = own && input.origin && input.sellerPlace ? zoneQuote(readZoneRates(input.delivery?.zoneRates), input.origin, input.sellerPlace, sizeBand, handlingDays) : null;
  const offer = brandingOfferFor(supplier.level, readBrandingOffer(supplier.brandingOffer));
  return {
    cost,
    suggestedPrice: Math.max(product.suggestedRetailPrice ?? 0, floor),
    floor,
    minRetailPrice: product.minRetailPrice && product.minRetailPrice > 0 ? product.minRetailPrice : null,
    options: dropshipOptionWords(product),
    minQty: cleanDropshipMinQty(product.dropshipMinQty),
    handlingDays,
    sizeBand,
    shipsFrom: supplier.city?.trim() || null,
    rateSource: own ? "own" : "partners",
    deliveryToYou: quote ? { zone: quote.zone, zoneLabel: ZONE_LABELS[quote.zone], price: quote.price, minDays: quote.minDays, maxDays: quote.maxDays } : null,
    dearestDelivery: dearestZoneFee(own ? input.delivery?.zoneRates : DEFAULT_ZONE_RATES, sizeBand),
    dearestIsEstimate: !own,
    branding: brandingChoicesFor(offer).map((entry) => ({ ...entry, label: BRANDING_CHOICE_LABELS[entry.choice] })),
    stock: Math.max(0, Math.floor(product.stockQuantity ?? 0)),
    stockState: supplierStockState(product.stockQuantity),
  };
}

/** The seller's choices when adding it: price, who pays delivery, the flat fee and the branding. */
export interface ListingChoice {
  retailPrice: number;
  payer?: string | null;
  flatFee?: number | null;
  brandingChoice?: string | null;
}

/** The choices cleaned: an unknown payer is the customer, a flat fee only with "flat", branding the supplier offers. */
export function cleanListingChoice(terms: Pick<DropshipTerms, "branding">, choice: ListingChoice): { payer: DeliveryPayer; flatFee: number | null; brandingChoice: BrandingChoice; brandingFee: number } {
  const payer: DeliveryPayer = isDeliveryPayer(choice.payer) ? choice.payer : "customer";
  const flat = Number(choice.flatFee);
  const branding = terms.branding.find((entry) => entry.choice === choice.brandingChoice) ?? terms.branding[0] ?? { choice: "blind" as const, fee: 0 };
  return { payer, flatFee: payer === "flat" && Number.isFinite(flat) && flat >= 0 ? money(flat) : null, brandingChoice: branding.choice, brandingFee: branding.fee };
}

/** "You earn" per order at this price and these choices, on the dearest delivery the seller could cover. */
export function listingEarn(terms: DropshipTerms, choice: ListingChoice): number {
  const clean = cleanListingChoice(terms, choice);
  return dropshipMargin({ retailPrice: choice.retailPrice, unitCost: terms.cost, payer: clean.payer, flatFee: clean.flatFee, deliveryFee: terms.dearestDelivery, brandingFee: clean.brandingFee });
}

/** Why the seller can't add it at this price with these choices, or null (the supplier's floor, or a loss). */
export function listingProblem(terms: DropshipTerms, choice: ListingChoice): string | null {
  if (!(choice.retailPrice > 0)) return "Enter your price.";
  const clean = cleanListingChoice(terms, choice);
  if (clean.payer === "flat" && clean.flatFee === null) return "Enter the flat delivery fee your customers pay.";
  return sellerPriceProblem({ retailPrice: choice.retailPrice, unitCost: terms.cost, payer: clean.payer, flatFee: clean.flatFee, deliveryFee: terms.dearestDelivery, brandingFee: clean.brandingFee, floor: terms.floor });
}

