import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { apiError, ok } from "@/lib/api/response";
import { addressLines } from "@/lib/labels";
import { cashToPayIn } from "@/lib/logistics/job-rules";
import { riderFromToken } from "@/lib/logistics/rider-session";
import { bookingNet, lagosStartOfToday, packageSummary } from "@/components/logistics/kit";
import { markDelivered, markFailed, setRiderOnline, startRun } from "@/app/rider/[token]/actions";
import { toE164 } from "@shared/phone";
import { addressPoint, directionsUrl } from "@shared/delivery-geo";
import { bookingDropoffPoint } from "@/lib/logistics/booking-geo.server";
import { pickupWindowText } from "@shared/supplier-pickup";
import { notesWithRecipient } from "../_shared";

export const dynamic = "force-dynamic";

// The Riders app inside the mobile app. Riders have no account: the private link their dispatcher shares is the
// credential, sent as the X-Rider-Token header. Same data and actions as the web Riders app (/rider/[token]).
//   GET  → rider, today's earnings, drops done, cash in hand and the runs (one per pickup) with their drops
//   POST { action: "online", online } | { action: "start_run", jobIds } | { action: "delivered", jobId, code, recipientName?, codCollected?, codMethod? }
//        | { action: "failed", jobId, reason }

const LINK_ERROR = "This link no longer works. Ask your dispatcher for a new one.";

function tokenOf(req: NextRequest) {
  return req.headers.get("x-rider-token")?.trim() ?? "";
}

export async function GET(req: NextRequest) {
  const token = tokenOf(req);
  const session = await riderFromToken(token);
  if (!session.ok) return apiError(session.reason === "limited" ? "RATE_LIMITED" : "UNAUTHORIZED", session.reason === "limited" ? "Too many tries. Wait a minute and try again." : LINK_ERROR, session.reason === "limited" ? 429 : 401);

  const rider = session.rider;
  const where = { riderId: rider.id, logisticsPartnerId: rider.partnerId };
  const [active, doneToday, cashJobs] = await Promise.all([
    db.deliveryBooking.findMany({
      where: { ...where, status: { in: ["confirmed", "picked_up", "in_transit"] } },
      orderBy: { createdAt: "asc" },
      take: 60,
      select: {
        id: true, status: true, sellerId: true, orderId: true, pickupLocation: true, destination: true, packageDetails: true,
        deliveryFee: true, platformFee: true, netAmount: true, codAmount: true, proofUrl: true, pickupWindowStart: true, pickupWindowEnd: true,
        pickupLat: true, pickupLng: true, dropoffLat: true, dropoffLng: true,
        seller: { select: { name: true, store: { select: { name: true } } } },
      },
    }),
    db.deliveryBooking.findMany({ where: { ...where, status: "delivered", deliveredAt: { gte: lagosStartOfToday() } }, select: { deliveryFee: true, platformFee: true, netAmount: true } }),
    db.deliveryBooking.findMany({ where: { ...where, codMethod: "cash", remittanceId: null, codCollected: { not: null } }, select: { codCollected: true, codMethod: true, remittanceId: true } }),
  ]);

  const orderIds = active.map((job) => job.orderId).filter((id): id is string => Boolean(id));
  const orders = orderIds.length ? await db.retailOrder.findMany({ where: { id: { in: orderIds } }, select: { id: true, buyerName: true, buyerPhone: true, deliveryAddress: true } }) : [];
  const orderById = new Map(orders.map((order) => [order.id, order]));

  // One run per pickup (same shop and address), like the web Riders app.
  const runs = new Map<string, { key: string; pickupName: string; pickupAddress: string; pickupWindow: string | null; pickupMapUrl: string | null; fees: number; drops: unknown[] }>();
  for (const job of active) {
    const key = `${job.sellerId}|${job.pickupLocation.trim().toLowerCase()}`;
    // Supplier pickups carry a time: "Pick up 12–4pm today" (the run shows the first one).
    const pickupWindow = pickupWindowText(job.pickupWindowStart, job.pickupWindowEnd);
    const run = runs.get(key) ?? { key, pickupName: job.seller.store?.name ?? job.seller.name, pickupAddress: job.pickupLocation, pickupWindow, pickupMapUrl: directionsUrl({ point: job.pickupLat !== null && job.pickupLng !== null ? { lat: job.pickupLat, lng: job.pickupLng } : null, address: job.pickupLocation }), fees: 0, drops: [] };
    if (!run.pickupWindow && pickupWindow) run.pickupWindow = pickupWindow;
    const order = job.orderId ? orderById.get(job.orderId) : undefined;
    const lines = order ? addressLines(order.deliveryAddress) : [];
    run.fees += bookingNet(job);
    run.drops.push({
      id: job.id,
      status: job.status,
      address: lines.length ? lines.join(", ") : job.destination,
      area: job.destination,
      // Google Maps directions: the buyer's exact pin when they picked one at checkout, else the address text.
      mapUrl: directionsUrl({ point: (order ? addressPoint(order.deliveryAddress) : null) ?? bookingDropoffPoint(job), address: lines.length ? lines.join(", ") : job.destination }),
      buyerName: order?.buyerName ?? null,
      buyerPhone: order?.buyerPhone ? toE164(order.buyerPhone) : null,
      collect: job.codAmount && job.codAmount > 0 ? job.codAmount : 0,
      item: packageSummary(job.packageDetails),
      hasProof: Boolean(job.proofUrl),
    });
    runs.set(key, run);
  }

  return ok({
    rider: { name: rider.name, partnerName: rider.partnerName, partnerPhone: rider.partnerPhone, online: rider.online },
    earnedToday: doneToday.reduce((sum, job) => sum + bookingNet(job), 0),
    dropsDone: doneToday.length,
    cashInHand: cashToPayIn(cashJobs),
    runs: [...runs.values()],
  });
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("online"), online: z.boolean() }),
  z.object({ action: z.literal("start_run"), jobIds: z.array(z.string().max(64)).min(1).max(50) }),
  z.object({
    action: z.literal("delivered"),
    jobId: z.string().max(64),
    code: z.string().max(12),
    recipientName: z.string().max(80).nullish(),
    codCollected: z.number().min(0).nullish(),
    codMethod: z.enum(["cash", "transfer"]).nullish(),
  }),
  z.object({ action: z.literal("failed"), jobId: z.string().max(64), reason: z.string().min(1).max(300) }),
]);

export async function POST(req: NextRequest) {
  const token = tokenOf(req);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the details and try again.");
  const input = parsed.data;

  // The web Riders app's actions re-check the token and only touch jobs assigned to this rider.
  const result =
    input.action === "online" ? await setRiderOnline(token, input.online)
    : input.action === "start_run" ? await startRun(token, input.jobIds)
    : input.action === "failed" ? await markFailed(token, { jobId: input.jobId, reason: input.reason })
    : await markDelivered(token, { jobId: input.jobId, code: input.code, codCollected: input.codCollected ?? null, codMethod: input.codMethod ?? null });
  if (!result.ok) return apiError(result.error === LINK_ERROR ? "UNAUTHORIZED" : "CONFLICT", result.error, result.error === LINK_ERROR ? 401 : 409);

  if (input.action === "delivered" && input.recipientName?.trim()) {
    const session = await riderFromToken(token);
    if (session.ok) {
      const job = await db.deliveryBooking.findFirst({ where: { id: input.jobId, riderId: session.rider.id }, select: { id: true, notes: true } });
      if (job) await db.deliveryBooking.update({ where: { id: job.id }, data: { notes: notesWithRecipient(job.notes, input.recipientName) } }).catch(() => null);
    }
  }
  return ok({ done: true });
}
