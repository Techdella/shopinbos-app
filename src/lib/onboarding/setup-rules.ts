// When each setup step counts as done (src/lib/onboarding/setup-status.server.ts reads the facts, these decide).
// Pure, unit-tested in tests/peggy-call.test.mjs with the values the app really writes, so Peggy (chat, voice and the
// admin inbox) never says a step is missing when the person has done it on any screen (web or phone).

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

const filled = (value: unknown) => typeof value === "string" && value.trim().length > 0;

/**
 * A seller's store is live. Publishing (src/lib/store-publishing.ts publishStoreDraft, from the web editor, Rex Studio
 * and the phone's Go live) sets onboardingState "LIVE", status "active" and brandSettings.editor.published; publishing
 * is free, so no launch payment is ever made. The same rule as the onboarding status and Start here: Store.status
 * defaults to "active", so it alone doesn't mean launched. A paid launch from before publishing was free still counts.
 */
export function storeIsLive(store: { onboardingState?: string | null; status?: string | null; brandSettings?: unknown; paidLaunches?: number }) {
  if (store.onboardingState === "LIVE") return true;
  if ((store.paidLaunches ?? 0) > 0) return true;
  const editor = record(record(store.brandSettings).editor);
  return (store.status === "active" || store.status === "published") && Boolean(editor.published);
}

/**
 * The payout bank is set: the Shopinbos Wallet bank (saved, or its Paystack split active or in review), a supplier's
 * or delivery partner's payout account, or a seller's older payout bank in the store settings.
 */
export function bankIsSet(facts: { walletAccountNumber?: string | null; walletSubaccountStatus?: string | null; payoutAccount?: boolean; brandSettings?: unknown }) {
  if (filled(facts.walletAccountNumber)) return true;
  if (facts.walletSubaccountStatus === "active" || facts.walletSubaccountStatus === "review") return true;
  if (facts.payoutAccount) return true;
  const bank = record(record(facts.brandSettings).payoutBank);
  return Boolean(bank.paystackRecipientCode || bank.accountNumberMask);
}

/** A seller has set up delivery: where they sell (delivery settings), delivery prices (zones) or a delivery company. */
export function sellerDeliverySet(facts: { deliverySettings: boolean; activeZones: number; deliveryPartners: number }) {
  return facts.deliverySettings || facts.activeZones > 0 || facts.deliveryPartners > 0;
}

/** Verification documents are in: all required ones uploaded, or the team has already verified the business. */
export function documentsDone(requiredMissing: number, verificationStatus: string | null | undefined) {
  return verificationStatus === "verified" || requiredMissing === 0;
}

/** A supplier's pickup address: on the business, or in its delivery settings ("Where I ship from" or self pickup). */
export function supplierPickupSet(facts: { address?: string | null; pickupAddress?: string | null; originAddress?: string | null }) {
  return filled(facts.address) || filled(facts.pickupAddress) || filled(facts.originAddress);
}

/** A supplier's business details: the name, and the city or what they sell (the phone asks the city at pickup). */
export function supplierProfileSet(facts: { businessName?: string | null; city?: string | null; description?: string | null; categories?: readonly string[] }) {
  return filled(facts.businessName) && (filled(facts.city) || filled(facts.description) || (facts.categories?.length ?? 0) > 0);
}

/** A delivery partner's company: the name and where it is (city, address or the states it collects from). */
export function partnerProfileSet(facts: { companyName?: string | null; city?: string | null; address?: string | null; pickupAreas?: readonly string[] }) {
  return filled(facts.companyName) && (filled(facts.city) || filled(facts.address) || (facts.pickupAreas?.length ?? 0) > 0);
}

/** Where a partner delivers: the setup's coverage zones or the marketplace's delivery areas (the phone writes these). */
export function partnerCoverageSet(facts: { coverageZones: readonly string[]; deliveryAreas: readonly string[] }) {
  return facts.coverageZones.length > 0 || facts.deliveryAreas.length > 0;
}

/** A partner's prices: a starting price, or a public rate card (the phone's Rates screen saves one). */
export function partnerRatesSet(facts: { basePrice: number; rateCards: number }) {
  return facts.basePrice > 0 || facts.rateCards > 0;
}
