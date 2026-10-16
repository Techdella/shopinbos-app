import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { addressLines } from "@/lib/labels";
import { bookingNet, cashToCollect, jobId, packageInfo, packageSummary, type CodOrder } from "@/components/logistics/kit";
import { toE164 } from "@shared/phone";
import { pickupWindowText } from "@shared/supplier-pickup";
import { addressPoint, directionsUrl, riderGroup, riderWhereWords, type LatLng } from "@shared/delivery-geo";
import { ensurePickupCoords } from "@/lib/logistics/geocode";
import { bookingDropoffPoint } from "@/lib/logistics/booking-geo.server";

// Shared by the mobile delivery partner routes (/api/mobile/logistics/**): the job shape the app reads, and
// the buyer details a rider needs at the door. Same numbers as the web dispatch console (net fee, cash to collect).

export const JOB_SELECT = {
  id: true, status: true, orderId: true, pickupLocation: true, destination: true, packageDetails: true,
  deliveryFee: true, platformFee: true, netAmount: true, currency: true, codAmount: true, codCollected: true, codMethod: true,
  trackingCode: true, estimatedDelivery: true, pickedUpAt: true, deliveredAt: true, failedReason: true, proofUrl: true,
  notes: true, createdAt: true, riderId: true, pickupWindowStart: true, pickupWindowEnd: true,
  pickupLat: true, pickupLng: true, pickupGeoSource: true, pickupGeocodedAt: true,
  pickupPostcode: true, dropoffLat: true, dropoffLng: true, dropoffPostcode: true,
  rider: { select: { id: true, name: true } },
  seller: { select: { id: true, name: true, store: { select: { name: true } } } },
} satisfies Prisma.DeliveryBookingSelect;

type JobRow = Prisma.DeliveryBookingGetPayload<{ select: typeof JOB_SELECT }>;
type OrderRow = CodOrder & { buyerName: string; buyerPhone: string | null; deliveryAddress: unknown };

export async function partnerForUser(userId: string) {
  return db.logisticsPartner.findUnique({ where: { userId } });
}

/** Linked store orders for a page of jobs (buyer, address and whether there's cash to collect). */
export async function ordersFor(jobs: Array<{ orderId: string | null }>) {
  const ids = [...new Set(jobs.map((job) => job.orderId).filter((id): id is string => Boolean(id)))];
  if (!ids.length) return new Map<string, OrderRow>();
  const orders = await db.retailOrder.findMany({
    where: { id: { in: ids } },
    select: { id: true, orderNumber: true, total: true, status: true, paymentMethod: true, buyerName: true, buyerPhone: true, deliveryAddress: true },
  });
  return new Map(orders.map((order) => [order.id, order]));
}

/** One job as the app shows it. Buyer contact details only travel while the job is open. */
export function jobView(job: JobRow, order?: OrderRow, pickupGeo?: LatLng | null) {
  const open = ["confirmed", "picked_up", "in_transit"].includes(job.status);
  const lines = order ? addressLines(order.deliveryAddress) : [];
  const pkg = packageInfo(job.packageDetails);
  return {
    id: job.id,
    ref: jobId(job.id),
    status: job.status,
    from: job.pickupLocation,
    to: job.destination,
    item: packageSummary(job.packageDetails),
    fragile: Boolean(pkg.fragile),
    fee: bookingNet(job),
    deliveryFee: job.deliveryFee,
    currency: job.currency,
    collect: job.codAmount ?? cashToCollect(order),
    codCollected: job.codCollected,
    codMethod: job.codMethod,
    shop: job.seller.store?.name ?? job.seller.name,
    sellerUserId: job.seller.id,
    rider: job.rider ? { id: job.rider.id, name: job.rider.name } : null,
    trackingCode: job.trackingCode,
    estimatedDelivery: job.estimatedDelivery?.toISOString() ?? null,
    pickedUpAt: job.pickedUpAt?.toISOString() ?? null,
    deliveredAt: job.deliveredAt?.toISOString() ?? null,
    failedReason: job.failedReason,
    proofUrl: job.proofUrl,
    notes: job.notes,
    createdAt: job.createdAt.toISOString(),
    /** Supplier pickups: "Pick up 12–4pm today". */
    pickupWindow: pickupWindowText(job.pickupWindowStart, job.pickupWindowEnd),
    /** Pickup coordinates, for sorting riders by distance in the picker. */
    pickupGeo: pickupGeo ?? (job.pickupLat !== null && job.pickupLng !== null ? { lat: job.pickupLat, lng: job.pickupLng } : null),
    /** Google Maps directions to the pickup (its geocoded point when there is one). */
    pickupMapUrl: directionsUrl({ point: pickupGeo ?? (job.pickupLat !== null && job.pickupLng !== null ? { lat: job.pickupLat, lng: job.pickupLng } : null), address: job.pickupLocation }),
    buyer: open && order
      ? {
          name: order.buyerName,
          phone: order.buyerPhone ? toE164(order.buyerPhone) : null,
          address: lines.length ? lines.join(", ") : job.destination,
          // The buyer's exact pin from checkout, when they picked one.
          mapUrl: directionsUrl({ point: addressPoint(order.deliveryAddress) ?? bookingDropoffPoint(job), address: lines.length ? lines.join(", ") : job.destination }),
        }
      : null,
  };
}

export type MobileJob = ReturnType<typeof jobView>;

/** "Received by Ada" goes on the job's notes (there's no recipient column), once. */
export function notesWithRecipient(notes: string | null, recipient: string | null | undefined) {
  const name = recipient?.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!name) return notes;
  const line = `Received by ${name}`;
  const rest = (notes ?? "").split("\n").filter((row) => !/^Received by /.test(row)).join("\n").trim();
  return [rest, line].filter(Boolean).join("\n").slice(0, 2000);
}

const PROOF_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const MAX_PROOF_BYTES = 10 * 1024 * 1024;

/** Checks a proof-of-delivery photo from a multipart body. */
export function proofFile(form: FormData | null): { ok: true; file: File } | { ok: false; error: string } {
  const file = form?.get("file");
  if (!file || typeof file === "string") return { ok: false, error: "Add a photo of the delivered parcel." };
  if (!PROOF_TYPES.has(file.type)) return { ok: false, error: "Use a JPG, PNG or WebP photo." };
  if (file.size > MAX_PROOF_BYTES) return { ok: false, error: "That photo is too big (max 10 MB)." };
  return { ok: true, file };
}

/**
 * Pickup coordinates for jobs that still need a rider or are on the road, geocoding (and storing) up to three
 * missing ones per call. See lib/logistics/geocode.ts.
 */
export async function pickupGeoFor(jobs: Array<JobRow>, country?: string | null) {
  const open = jobs.filter((job) => ["pending", "confirmed", "picked_up", "in_transit"].includes(job.status));
  return ensurePickupCoords(open, country).catch(() => new Map<string, LatLng>());
}

/** Coordinates rounded to ~100 m: enough to sort by distance, no more precise than the picker needs. */
const coarse = (value: number | null) => (value === null ? null : Math.round(value * 1000) / 1000);

/**
 * Active riders for the "Assign a rider" sheet, best first: free riders who are out now (online, no open job), then
 * riders out but finishing a job, then offline riders. Each carries a coarse latest location so the app can put
 * the closest first for a given pickup (shared/delivery-geo rankRidersForPickup), and "last seen 2 min ago, Ikeja".
 */
export async function dispatchRiders(partnerId: string, now = new Date()) {
  const [riders, open] = await Promise.all([
    db.logisticsTeamMember.findMany({
      where: { logisticsPartnerId: partnerId, role: "rider", status: "active" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, online: true, lastSeenAt: true, lastLat: true, lastLng: true, lastLocationAt: true },
    }),
    db.deliveryBooking.groupBy({ by: ["riderId"], where: { logisticsPartnerId: partnerId, status: { in: ["confirmed", "picked_up", "in_transit"] }, riderId: { not: null } }, _count: { _all: true } }),
  ]);
  const openBy = new Map(open.map((row) => [row.riderId, row._count._all]));
  return riders
    .map((rider) => ({ ...rider, openJobs: openBy.get(rider.id) ?? 0 }))
    .sort((a, b) => riderGroup(a, now) - riderGroup(b, now) || a.openJobs - b.openJobs || a.name.localeCompare(b.name))
    .map((rider) => ({
      id: rider.id,
      name: rider.name,
      online: rider.online,
      lastSeenAt: rider.lastSeenAt?.toISOString() ?? null,
      openJobs: rider.openJobs,
      out: riderGroup(rider, now) < 2,
      lat: coarse(rider.lastLat),
      lng: coarse(rider.lastLng),
      locationAt: rider.lastLocationAt?.toISOString() ?? null,
      where: riderWhereWords({ lat: rider.lastLat, lng: rider.lastLng, locationAt: rider.lastLocationAt, lastSeenAt: rider.lastSeenAt }, now),
    }));
}
