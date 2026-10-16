import type { PaymentMethodKey } from "@shared/onboarding";
import type { PayoutBankSummary } from "@shared/seller-payments";
import type { PaymentBadgeKey } from "@shared/payment-badges";
import { api } from "./api";
import type { Zone } from "./settings-pure";

// The seller's Payments and payouts, Delivery and Settings screens. Same backend as the web pages:
//   /api/app/payments              (web /home/payments and its server actions)
//   /api/app/payout-bank(/resolve) (web "Change bank")
//   /api/store/shipping-zones      (web /home/shipping)
//   /api/app/logistics/bookings    (web /home/logistics, "Your deliveries")
//   /api/app/settings/profile      (web /home/settings, Store tab)
//   /api/app/me/images             (web logo and photo uploader; see lib/identity.ts)

// ─── Payments ────────────────────────────────────────────────────────────────

export interface PaymentsOverview {
  hasStore: boolean;
  currency: string;
  methods: Record<PaymentMethodKey, boolean>;
  transferWindow: { hours: number | null; defaultHours: number; choices: number[] };
  bank: PayoutBankSummary | null;
  banks: string[];
  /** The payment logos on the store: shown now, whether the seller picked them, and the payment-method defaults. */
  paymentBadges: { selected: PaymentBadgeKey[]; chosen: boolean; defaults: PaymentBadgeKey[] };
  money: { moneyIn: number; online: number; offline: number; refunded: number; paidCount: number; waiting: { total: number; count: number } };
  latestPaid: { id: string; orderNumber: string; buyerName: string | null; total: number; paymentMethod: string | null; createdAt: string }[];
}

export const fetchPayments = () => api<PaymentsOverview>("/api/app/payments");

export const savePaymentSettings = (body: { methods?: Record<PaymentMethodKey, boolean>; transferWindowHours?: number | null; paymentBadges?: PaymentBadgeKey[] }) =>
  api<PaymentsOverview>("/api/app/payments", { method: "PATCH", json: body });

export type ResolvedAccount = { status: "resolved"; accountName: string } | { status: "not_found" } | { status: "unavailable" };

export const resolveAccount = (bankName: string, accountNumber: string) =>
  api<ResolvedAccount>("/api/app/payout-bank/resolve", { method: "POST", json: { bankName, accountNumber } });

export const savePayoutBank = (bankName: string, accountNumber: string, accountName: string) =>
  api<{ linked: boolean }>("/api/app/payout-bank", { method: "POST", json: { bankName, accountNumber, accountName } });

// ─── Delivery ────────────────────────────────────────────────────────────────

export const fetchZones = () => api<Zone[]>("/api/store/shipping-zones?limit=100");

export const createZone = (body: Record<string, unknown>) => api<Zone>("/api/store/shipping-zones", { method: "POST", json: body });

export const updateZone = (id: string, body: Record<string, unknown>) => api<Zone>(`/api/store/shipping-zones/${encodeURIComponent(id)}`, { method: "PATCH", json: body });

export const deleteZone = (id: string) => api<null>(`/api/store/shipping-zones/${encodeURIComponent(id)}`, { method: "DELETE" });

export interface DeliveryBooking {
  id: string;
  pickupLocation: string;
  destination: string;
  deliveryFee: number;
  currency: string;
  status: string;
  trackingCode: string | null;
  createdAt: string;
  logisticsPartner: { id: string; displayName: string };
}

export const fetchBookings = () => api<DeliveryBooking[]>("/api/app/logistics/bookings?limit=8");

// ─── Settings ────────────────────────────────────────────────────────────────

export interface SellerProfile {
  me: { name: string; email: string | null; phone: string };
  shop: { name: string; slug: string; description: string; city: string; state: string; phone: string; country: string; currency: string; logoUrl: string | null } | null;
}

export type ShopFields = "name" | "description" | "city" | "state" | "phone";
export type MeFields = "name" | "phone";

export const fetchProfile = () => api<SellerProfile>("/api/app/settings/profile");

export const saveProfile = (body: { shop?: Partial<Record<ShopFields, string>>; me?: Partial<Record<MeFields, string>> }) =>
  api<SellerProfile>("/api/app/settings/profile", { method: "PATCH", json: body });

// The logo and the person's photo upload through lib/identity.ts (/api/app/me/images).
