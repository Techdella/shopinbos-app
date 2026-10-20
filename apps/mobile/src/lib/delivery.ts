import { router } from "expo-router";
import type { PartnerStats, RateRow } from "@shared/delivery-market";
import { api } from "./api";

// The logistics marketplace for sellers and suppliers ("owners"), the same routes for both roles
// (src/app/api/mobile/delivery/**). Pure helpers for these screens are in lib/delivery-pure.ts.
//   GET    /api/mobile/delivery                      the hub: settings, partners, private rates, exceptions
//   PUT    /api/mobile/delivery/settings             where I sell / ship from and the shop's own options
//   GET    /api/mobile/delivery/partners             "Find partners" (?service=&state=&q=&pickupPoints=1)
//   GET    /api/mobile/delivery/partners/[slug]      a partner's page
//   POST   /api/mobile/delivery/connections          Connect { partnerId }
//   PATCH  /api/mobile/delivery/connections/[id]     what customers see, pay on delivery
//   DELETE /api/mobile/delivery/connections/[id]     remove the partner
//   POST   /api/mobile/delivery/rate-cards/[id]      accept or decline a private rate { accept }
//   GET    /api/mobile/delivery/orders/[orderId]     how one order is being delivered (sellers)
//   GET    /api/mobile/delivery/jobs/[id]            partners who can take a job instead (sellers)
//   POST   /api/mobile/delivery/jobs/[id]            { action: "ready" | "reassign" | "cash_received" }

export type OwnerRole = "seller" | "supplier";

export interface DeliverySettings {
  checkoutMode: string;
  sellArea: string;
  sellStates: string[];
  originState: string | null;
  originArea: string | null;
  originAddress: string | null;
  selfPickup: boolean;
  pickupAddress: string | null;
  pickupHours: string | null;
  pickupInstructions: string | null;
  fallback: string;
  fallbackFee: number;
  defaultSizeBand: string;
  failedFeePayer: string;
  /** Suppliers: "I deliver myself", its fee and the states it drives to (empty: the state it ships from). */
  selfDelivery?: boolean;
  selfDeliveryFee?: number;
  selfDeliveryStates?: string[];
}

export interface PartnerLite {
  id: string;
  displayName: string;
  slug: string;
}

export interface Connection {
  id: string;
  services: string[];
  showPartnerName: boolean;
  label: string | null;
  ownerPod: boolean;
  partnerPod: boolean;
  partner: { id: string; slug: string; name: string; logoUrl: string | null; services: string[]; offersPayOnDelivery: boolean; live: boolean; userId: string };
  stats: PartnerStats | null;
}

export interface PrivateCard {
  id: string;
  status: string;
  rows: RateRow[];
  failedAttemptFee: number;
  returnFee: number;
  notes: string | null;
  partner: PartnerLite;
}

export interface DeliveryException {
  kind: string;
  job: { id: string; status: string; service: string | null; declineReason: string | null; failedReason: string | null; deliveryFee: number; partner: PartnerLite };
  order: { id: string; orderNumber: string; buyerName: string } | null;
}

export interface DeliveryHub {
  role: OwnerRole;
  settings: DeliverySettings;
  city: string | null;
  address: string | null;
  connections: Connection[];
  privateCards: PrivateCard[];
  exceptions: DeliveryException[];
}

export const fetchDeliveryHub = () => api<DeliveryHub>("/api/mobile/delivery");

export type SettingsPatch = Partial<Pick<DeliverySettings, "sellArea" | "sellStates" | "originState" | "originArea" | "originAddress" | "defaultSizeBand" | "checkoutMode" | "selfPickup" | "pickupAddress" | "pickupHours" | "pickupInstructions" | "fallback" | "failedFeePayer">> & { fallbackFee?: number | string; selfDelivery?: boolean; selfDeliveryFee?: number | string };

export const saveDeliverySettings = (patch: SettingsPatch) => api<{ settings: DeliverySettings }>("/api/mobile/delivery/settings", { method: "PUT", json: patch });

export interface FoundPartner {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  rating: number;
  ratingCount: number;
  services: string[];
  pickupAreas: string[];
  deliveryAreas: string[];
  offersPayOnDelivery: boolean;
  startingPrice: number | null;
  timeframe: string | null;
  stats: PartnerStats;
  pickupPointCount: number;
  connectionId: string | null;
}

export interface FoundPartners {
  origin: { state: string | null; area?: string | null } | null;
  sellArea: string;
  sellStates: string[];
  partners: FoundPartner[];
}

export function findDeliveryPartners(filters: { service?: string | null; state?: string | null; q?: string | null; pickupPoints?: boolean } = {}) {
  const params = new URLSearchParams();
  if (filters.service) params.set("service", filters.service);
  if (filters.state) params.set("state", filters.state);
  if (filters.q) params.set("q", filters.q);
  if (filters.pickupPoints) params.set("pickupPoints", "1");
  const query = params.toString();
  return api<FoundPartners>(`/api/mobile/delivery/partners${query ? `?${query}` : ""}`);
}

export interface RateCard {
  id: string;
  rows: RateRow[];
  failedAttemptFee: number;
  returnFee: number;
  notes: string | null;
}

export interface PartnerPage {
  partner: {
    id: string;
    slug: string;
    userId: string;
    name: string;
    description: string | null;
    logoUrl: string | null;
    city: string | null;
    rating: number;
    ratingCount: number;
    verified: boolean;
    services: string[];
    pickupAreas: string[];
    deliveryAreas: string[];
    offersPayOnDelivery: boolean;
    pickupPoints: Array<{ id: string; name: string; address: string; state: string | null; area: string | null; hours: string | null }>;
  };
  card: RateCard | null;
  privateCard: (RateCard & { status: string }) | null;
  stats: PartnerStats;
  connection: { id: string; services: string[]; showPartnerName: boolean; label: string | null; ownerPod: boolean; partnerPod: boolean } | null;
}

export const fetchPartnerPage = (slug: string) => api<PartnerPage>(`/api/mobile/delivery/partners/${encodeURIComponent(slug)}`);

export const connectPartner = (partnerId: string) => api<{ connectionId: string | null }>("/api/mobile/delivery/connections", { method: "POST", json: { partnerId } });

export const updateConnection = (id: string, patch: { services?: string[]; showPartnerName?: boolean; label?: string; ownerPod?: boolean; acceptPodDisclaimer?: boolean }) =>
  api<{ saved: boolean }>(`/api/mobile/delivery/connections/${encodeURIComponent(id)}`, { method: "PATCH", json: patch });

export const removeConnection = (id: string) => api<{ ended: boolean }>(`/api/mobile/delivery/connections/${encodeURIComponent(id)}`, { method: "DELETE" });

export const answerPrivateRate = (id: string, accept: boolean) => api<{ accepted: boolean }>(`/api/mobile/delivery/rate-cards/${encodeURIComponent(id)}`, { method: "POST", json: { accept } });

export interface TimelineStepData {
  key: string;
  label: string;
  done: boolean;
  at: string | null;
}

export interface DeliveryJob {
  id: string;
  status: string;
  readyAt: string | null;
  deliveryCode: string | null;
  declineReason: string | null;
  failedReason: string | null;
  rider: string | null;
  codAmount: number | null;
  codRemittedAt: string | null;
  codConfirmedAt: string | null;
  /** The code the rider gives at pickup (newer servers). */
  pickupCode?: string | null;
}

export interface Parcel {
  shipmentKey: string;
  service: string;
  sizeBand: string;
  fee: number;
  minDays: number;
  maxDays: number;
  partner: { id: string; slug: string; name: string; userId: string } | null;
  job: DeliveryJob | null;
  exception: string | null;
  canReassign: boolean;
  timeline: TimelineStepData[];
}

export interface OrderDelivery {
  plan: { kind: string; pod: boolean } | null;
  timeline?: TimelineStepData[] | null;
  parcels: Parcel[];
}

export const fetchOrderDelivery = (orderId: string) => api<OrderDelivery>(`/api/mobile/delivery/orders/${encodeURIComponent(orderId)}`);

export interface ReassignOption {
  connectionId: string;
  name: string;
  price: number;
  minDays: number;
  maxDays: number;
}

export const fetchReassignOptions = (jobId: string) => api<{ options: ReassignOption[] }>(`/api/mobile/delivery/jobs/${encodeURIComponent(jobId)}`);

/** "Chat with them": a seller's partner chat, or the supplier app's own chat screen. `id` is the partner's user id. */
export function openPartnerChat(role: string | null | undefined, partner: { userId: string; name: string }) {
  const params = { id: partner.userId, name: partner.name };
  if (role === "supplier") router.push({ pathname: "/supplier/chat/[id]", params });
  else router.push({ pathname: "/partners/[id]", params });
}

export const jobAction = (jobId: string, body: { action: "ready" } | { action: "cash_received" } | { action: "reassign"; connectionId: string }) =>
  api<{ done: boolean }>(`/api/mobile/delivery/jobs/${encodeURIComponent(jobId)}`, { method: "POST", json: body });
