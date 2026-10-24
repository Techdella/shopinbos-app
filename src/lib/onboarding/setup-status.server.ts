import "server-only";

import { db } from "@/lib/db/client";
import { docTypesForRole, normalizeVerificationDocs } from "@shared/verification-docs";
import { bankIsSet, documentsDone, partnerCoverageSet, partnerProfileSet, partnerRatesSet, sellerDeliverySet, storeIsLive, supplierPickupSet, supplierProfileSet } from "./setup-rules";

// Where a supplier, delivery partner or seller is in getting set up: what's done, what's next and where to do it.
// Peggy uses it to guide people in their dashboard (chat and voice) and to answer them in the admin inbox.

export type SetupStep = { id: string; label: string; done: boolean; href: string; hint: string };

export type SetupStatus = {
  role: "supplier" | "logistics_partner" | "seller";
  firstName: string;
  business: string;
  verification: string | null;
  steps: SetupStep[];
  next: SetupStep | null;
  done: number;
};

const first = (name: string | null | undefined) => name?.trim().split(/\s+/)[0] || "there";

function docsDone(raw: unknown, role: "supplier" | "logistics_partner", verificationStatus: string | null) {
  const docs = normalizeVerificationDocs(raw);
  const required = docTypesForRole(role).filter((d) => d.required);
  const missing = required.filter((need) => !docs.some((d) => d.type === need.type && d.status !== "rejected" && d.status !== "draft"));
  return { done: documentsDone(missing.length, verificationStatus), missing: missing.map((d) => d.label) };
}

const safe = <T,>(work: Promise<T>, fallback: T) => work.catch(() => fallback);

function finish(role: SetupStatus["role"], firstName: string, business: string, verification: string | null, steps: SetupStep[]): SetupStatus {
  return { role, firstName, business, verification, steps, next: steps.find((s) => !s.done) ?? null, done: steps.filter((s) => s.done).length };
}

export async function setupStatus(userId: string): Promise<SetupStatus | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      role: true,
      wallet: { select: { accountNumber: true, subaccountStatus: true } },
      supplier: { select: { id: true, businessName: true, displayName: true, city: true, address: true, description: true, categories: true, verificationStatus: true, verificationDocuments: true, payoutAccount: { select: { id: true } }, _count: { select: { products: true } } } },
      logisticsPartner: { select: { id: true, companyName: true, displayName: true, city: true, address: true, coverageZones: true, deliveryAreas: true, pickupAreas: true, basePrice: true, verificationStatus: true, verificationDocuments: true, payoutAccount: { select: { id: true } }, _count: { select: { pickupPoints: { where: { active: true } }, rateCards: { where: { ownerUserId: null, status: "active" } } } } } },
      store: { select: { id: true, name: true, status: true, onboardingState: true, brandSettings: true, _count: { select: { storeProducts: true, launchPayments: { where: { status: { in: ["paid", "settled", "deposit_paid"] } } } } } } },
    },
  });
  if (!user) return null;
  const wallet = { walletAccountNumber: user.wallet?.accountNumber, walletSubaccountStatus: user.wallet?.subaccountStatus };

  if (user.role === "supplier" && user.supplier) {
    const s = user.supplier;
    const settings = await safe(db.deliverySettings.findUnique({ where: { userId }, select: { pickupAddress: true, originAddress: true } }), null);
    const pickup = supplierPickupSet({ address: s.address, pickupAddress: settings?.pickupAddress, originAddress: settings?.originAddress });
    const docs = docsDone(s.verificationDocuments, "supplier", s.verificationStatus);
    const bank = bankIsSet({ ...wallet, payoutAccount: Boolean(s.payoutAccount) });
    return finish("supplier", first(user.name), s.displayName || s.businessName, s.verificationStatus, [
      { id: "profile", label: "Business details", done: supplierProfileSet(s), href: "/supplier/onboarding", hint: "Your business name, city, what you sell" },
      { id: "pickup", label: "Pickup address", done: pickup, href: "/supplier/delivery", hint: "Where riders collect orders from you" },
      { id: "documents", label: "Verification documents", done: docs.done, href: "/supplier/verification", hint: docs.done ? "Uploaded" : `Still needed: ${docs.missing.join(", ")}` },
      { id: "products", label: "First products", done: s._count.products > 0, href: "/supplier/products/new", hint: "Add products sellers can stock or dropship" },
      { id: "bank", label: "Bank for payments", done: bank, href: "/supplier/wallet", hint: "Where your share of each sale is paid" },
      { id: "verified", label: "Verified by Shopinbos", done: s.verificationStatus === "verified", href: "/supplier/verification", hint: s.verificationStatus === "rejected" ? "Not approved yet: check what to fix" : "The team reviews your documents" },
    ]);
  }

  if (user.role === "logistics_partner" && user.logisticsPartner) {
    const p = user.logisticsPartner;
    const docs = docsDone(p.verificationDocuments, "logistics_partner", p.verificationStatus);
    const bank = bankIsSet({ ...wallet, payoutAccount: Boolean(p.payoutAccount) });
    return finish("logistics_partner", first(user.name), p.displayName || p.companyName, p.verificationStatus, [
      { id: "profile", label: "Company details", done: partnerProfileSet(p), href: "/logistics/onboarding", hint: "Company name, city, the vehicles you use" },
      { id: "coverage", label: "Where you deliver", done: partnerCoverageSet(p), href: "/logistics/coverage", hint: "The states and areas you cover" },
      { id: "pickup", label: "Pickup points", done: p._count.pickupPoints > 0, href: "/logistics/pickup-points", hint: "Offices or hubs where parcels can be dropped or collected" },
      { id: "rates", label: "Your rates", done: partnerRatesSet({ basePrice: p.basePrice, rateCards: p._count.rateCards }), href: "/logistics/pricing", hint: "What you charge per delivery" },
      { id: "documents", label: "Verification documents", done: docs.done, href: "/logistics/verification", hint: docs.done ? "Uploaded" : `Still needed: ${docs.missing.join(", ")}` },
      { id: "bank", label: "Bank for payments", done: bank, href: "/logistics/wallet", hint: "Where delivery fees are paid" },
      { id: "verified", label: "Verified by Shopinbos", done: p.verificationStatus === "verified", href: "/logistics/verification", hint: p.verificationStatus === "rejected" ? "Not approved yet: check what to fix" : "The team reviews your documents" },
    ]);
  }

  if (user.role === "seller" && user.store) {
    const st = user.store;
    const [settings, activeZones, deliveryPartners] = await Promise.all([
      safe(db.deliverySettings.findUnique({ where: { userId }, select: { userId: true } }), null),
      safe(db.shippingZone.count({ where: { storeId: st.id, active: true } }), 0),
      safe(db.deliveryConnection.count({ where: { ownerUserId: userId, status: "active" } }), 0),
    ]);
    const live = storeIsLive({ onboardingState: st.onboardingState, status: st.status, brandSettings: st.brandSettings, paidLaunches: st._count.launchPayments });
    return finish("seller", first(user.name), st.name, null, [
      { id: "store", label: "Your store", done: Boolean(st.name), href: "/studio", hint: "Build it with Rex" },
      { id: "products", label: "Products", done: st._count.storeProducts > 0, href: "/products", hint: "Add what you sell, or pick from suppliers" },
      { id: "delivery", label: "Delivery", done: sellerDeliverySet({ deliverySettings: Boolean(settings), activeZones, deliveryPartners }), href: "/home/shipping", hint: "Where you deliver and what it costs" },
      { id: "bank", label: "Getting paid", done: bankIsSet({ ...wallet, brandSettings: st.brandSettings }), href: "/home/wallet", hint: "Your bank account for card payments" },
      { id: "live", label: "Store live", done: live, href: "/studio", hint: live ? "Published: shoppers can see it" : "Publish your store" },
    ]);
  }
  return null;
}

/** The status as lines Peggy reads (chat, voice and the admin inbox). */
export function setupText(status: SetupStatus) {
  const who = status.role === "supplier" ? "supplier" : status.role === "logistics_partner" ? "delivery partner" : "seller";
  return [
    `${status.business} (${who})${status.verification ? `, verification: ${status.verification}` : ""}. Setup: ${status.done} of ${status.steps.length} done.`,
    ...status.steps.map((s) => `- ${s.done ? "DONE" : "TO DO"}: ${s.label} (${s.hint}) → ${s.href}`),
  ].join("\n");
}
