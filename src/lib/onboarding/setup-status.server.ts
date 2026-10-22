import "server-only";

import { db } from "@/lib/db/client";
import { docTypesForRole, normalizeVerificationDocs } from "@shared/verification-docs";

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

function docsDone(raw: unknown, role: "supplier" | "logistics_partner") {
  const docs = normalizeVerificationDocs(raw);
  const required = docTypesForRole(role).filter((d) => d.required);
  const missing = required.filter((need) => !docs.some((d) => d.type === need.type && d.status !== "rejected" && d.status !== "draft"));
  return { done: missing.length === 0, missing: missing.map((d) => d.label) };
}

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
      supplier: { select: { id: true, businessName: true, displayName: true, city: true, address: true, description: true, categories: true, verificationStatus: true, verificationDocuments: true, _count: { select: { products: true } } } },
      logisticsPartner: { select: { id: true, companyName: true, displayName: true, city: true, coverageZones: true, basePrice: true, vehicleTypes: true, verificationStatus: true, verificationDocuments: true, _count: { select: { pickupPoints: { where: { active: true } } } } } },
      store: { select: { name: true, _count: { select: { storeProducts: true, launchPayments: { where: { status: { in: ["paid", "settled", "deposit_paid"] } } } } } } },
    },
  });
  if (!user) return null;
  const bank = Boolean(user.wallet?.accountNumber);

  if (user.role === "supplier" && user.supplier) {
    const s = user.supplier;
    const pickup = s.address?.trim() || (await db.deliverySettings.findUnique({ where: { userId }, select: { pickupAddress: true, originAddress: true } }).catch(() => null))?.pickupAddress;
    const docs = docsDone(s.verificationDocuments, "supplier");
    return finish("supplier", first(user.name), s.displayName || s.businessName, s.verificationStatus, [
      { id: "profile", label: "Business details", done: Boolean(s.businessName && s.city && (s.description || s.categories.length)), href: "/supplier/onboarding", hint: "Your business name, city, what you sell" },
      { id: "pickup", label: "Pickup address", done: Boolean(pickup), href: "/supplier/delivery", hint: "Where riders collect orders from you" },
      { id: "documents", label: "Verification documents", done: docs.done, href: "/supplier/verification", hint: docs.done ? "Uploaded" : `Still needed: ${docs.missing.join(", ")}` },
      { id: "products", label: "First products", done: s._count.products > 0, href: "/supplier/products/new", hint: "Add products sellers can stock or dropship" },
      { id: "bank", label: "Bank for payments", done: bank, href: "/supplier/wallet", hint: "Where your share of each sale is paid" },
      { id: "verified", label: "Verified by Shopinbos", done: s.verificationStatus === "verified", href: "/supplier/verification", hint: s.verificationStatus === "rejected" ? "Not approved yet: check what to fix" : "The team reviews your documents" },
    ]);
  }

  if (user.role === "logistics_partner" && user.logisticsPartner) {
    const p = user.logisticsPartner;
    const docs = docsDone(p.verificationDocuments, "logistics_partner");
    return finish("logistics_partner", first(user.name), p.displayName || p.companyName, p.verificationStatus, [
      { id: "profile", label: "Company details", done: Boolean(p.companyName && p.city && p.vehicleTypes.length), href: "/logistics/onboarding", hint: "Company name, city, the vehicles you use" },
      { id: "coverage", label: "Where you deliver", done: p.coverageZones.length > 0, href: "/logistics/coverage", hint: "The states and areas you cover" },
      { id: "pickup", label: "Pickup points", done: p._count.pickupPoints > 0, href: "/logistics/pickup-points", hint: "Offices or hubs where parcels can be dropped or collected" },
      { id: "rates", label: "Your rates", done: p.basePrice > 0, href: "/logistics/pricing", hint: "What you charge per delivery" },
      { id: "documents", label: "Verification documents", done: docs.done, href: "/logistics/verification", hint: docs.done ? "Uploaded" : `Still needed: ${docs.missing.join(", ")}` },
      { id: "bank", label: "Bank for payments", done: bank, href: "/logistics/wallet", hint: "Where delivery fees are paid" },
      { id: "verified", label: "Verified by Shopinbos", done: p.verificationStatus === "verified", href: "/logistics/verification", hint: p.verificationStatus === "rejected" ? "Not approved yet: check what to fix" : "The team reviews your documents" },
    ]);
  }

  if (user.role === "seller" && user.store) {
    const st = user.store;
    const delivery = await db.deliverySettings.findUnique({ where: { userId }, select: { userId: true } }).catch(() => null);
    return finish("seller", first(user.name), st.name, null, [
      { id: "store", label: "Your store", done: Boolean(st.name), href: "/studio", hint: "Build it with Rex" },
      { id: "products", label: "Products", done: st._count.storeProducts > 0, href: "/products", hint: "Add what you sell, or pick from suppliers" },
      { id: "delivery", label: "Delivery", done: Boolean(delivery), href: "/home/shipping", hint: "Where you deliver and what it costs" },
      { id: "bank", label: "Getting paid", done: bank, href: "/home/wallet", hint: "Your bank account for card payments" },
      { id: "live", label: "Store live", done: st._count.launchPayments > 0, href: "/studio", hint: "Publish your store" },
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
