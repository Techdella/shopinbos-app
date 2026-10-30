import { isPayOnDelivery, payAtDoorPaid } from "@shared/pay-at-door";
import { doorAmountNaira } from "@/lib/commerce/pay-at-door.server";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { apiError, ok } from "@/lib/api/response";
import { addressLines } from "@/lib/labels";
import { ensurePickupCoords, geocodeAddress, PICKUP_GEO_SELECT } from "@/lib/logistics/geocode";
import { cashToPayIn, HANDOVER_PHOTO_NEEDED, PICKUP_PHOTO_NEEDED, riderAmount, WRONG_PICKUP_CODE } from "@/lib/logistics/job-rules";
import { askForHelp, checkDeliveryCode, RIDER_LANGUAGES, riderWeek, saveRiderLanguage, skipJob } from "@/lib/logistics/rider-app.server";
import { riderFromToken } from "@/lib/logistics/rider-session";
import { lagosStartOfToday, packageSummary } from "@/components/logistics/kit";
import { markDelivered, markFailed, markStage, resendPayLink, setRiderOnline, startRun } from "@/app/rider/[token]/actions";
import { toE164 } from "@shared/phone";
import { areaFromText, haversineMeters } from "@shared/delivery-geo";
import { pickupWindowText } from "@shared/supplier-pickup";
import { notesWithRecipient } from "../_shared";

export const dynamic = "force-dynamic";

// The Riders app inside the mobile app. Riders have no account: the private link their dispatcher shares is the
// credential, sent as the X-Rider-Token header. Same data and actions as the web Riders app (/rider/[token]).
//   GET  → rider (with bike plate and language), today's earnings, drops done, cash in hand, this week's earnings
//          and deliveries, and the runs (one per pickup) with their drops (each says whether it has a pickup code)
//   POST { action: "online", online } | { action: "start_run", jobIds, codes? } | { action: "delivered", jobId, code, recipientName?, codCollected?, codMethod? }
//        (no code from the customer: code "" once the proof photo is uploaded, with recipientName; see riderProofInstead)
//        | { action: "failed", jobId, reason } | { action: "stage", jobId, to }
//        | { action: "skip", jobId }            hand back a job not picked up yet (the partner is told)
//        | { action: "help", jobId, reason }    tell the partner what's wrong; the job keeps its status
//        | { action: "check_code", jobId, code } is the customer's code right? (before taking the cash)
//        | { action: "language", language }   en | pcm | yo | ha | ig
//        | { action: "pay_link", jobId }      pay on delivery: text the customer the payment link again
// start_run with codes: { [jobId]: "1234" } checks the pickup code the shop gave the rider; a wrong one answers
// 409 WRONG_PICKUP_CODE.

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
  const [active, doneToday, cashJobs, week] = await Promise.all([
    db.deliveryBooking.findMany({
      where: { ...where, status: { in: ["confirmed", "picked_up", "in_transit", "out_for_delivery"] } },
      orderBy: { createdAt: "asc" },
      take: 60,
      select: {
        id: true, status: true, sellerId: true, orderId: true, pickupLocation: true, destination: true, packageDetails: true,
        deliveryFee: true, platformFee: true, netAmount: true, codAmount: true, proofUrl: true, pickupPhotoUrl: true, pickupWindowStart: true, pickupWindowEnd: true,
        pickupCode: true, ...PICKUP_GEO_SELECT,
        seller: { select: { name: true, phone: true, store: { select: { name: true } } } },
      },
    }),
    db.deliveryBooking.findMany({ where: { ...where, status: "delivered", deliveredAt: { gte: lagosStartOfToday() } }, select: { deliveryFee: true, platformFee: true, netAmount: true, riderPay: true } }),
    db.deliveryBooking.findMany({ where: { ...where, codMethod: "cash", remittanceId: null, codCollected: { not: null } }, select: { codCollected: true, codMethod: true, remittanceId: true } }),
    riderWeek(rider),
  ]);

  const orderIds = active.map((job) => job.orderId).filter((id): id is string => Boolean(id));
  const orders = orderIds.length ? await db.retailOrder.findMany({ where: { id: { in: orderIds } }, select: { id: true, orderNumber: true, buyerName: true, buyerPhone: true, deliveryAddress: true, total: true, paymentMethod: true, status: true, paystackStatus: true, depositPaidAt: true, paymentDueAt: true, paymentSplit: true, store: { select: { slug: true, customDomain: true } } } }) : [];
  const orderById = new Map(orders.map((order) => [order.id, order]));

  // The rider's map: pickup and drop-off pins for the job in hand (the one being carried, else the next to pick up).
  // Only that job, and at most a couple of seconds' wait: lookups are cached (GeocodeCache, and the pickup on the
  // booking), so after the first load this is a database read. The rider's own spot comes from the phone.
  const mapJob = active.find((job) => job.status !== "confirmed") ?? active[0];
  const dropAddressOf = (job: (typeof active)[number]) => {
    const order = job.orderId ? orderById.get(job.orderId) : undefined;
    const lines = order ? addressLines(order.deliveryAddress) : [];
    return lines.length ? lines.join(", ") : job.destination;
  };
  const noCoords = new Map<string, { lat: number; lng: number }>();
  const [pickupCoords, dropCoords] = mapJob
    ? await Promise.all([
        withinMs(ensurePickupCoords([mapJob], null, 1), 2500, noCoords),
        // The centre of an area isn't a place to ride to: only a real match goes on the map.
        withinMs(geocodeAddress(dropAddressOf(mapJob)).then((found) => (found && found.source !== "area" ? found : null)), 2500, null),
      ])
    : [noCoords, null];

  // One run per pickup (same shop and address), like the web Riders app.
  const runs = new Map<string, { key: string; pickupName: string; pickupAddress: string; pickupWindow: string | null; pickupKm: number | null; pickupArea: string | null; pickupPhone: string | null; pickupLat: number | null; pickupLng: number | null; fees: number; drops: unknown[] }>();
  const here = rider.lastLat !== null && rider.lastLng !== null ? { lat: rider.lastLat, lng: rider.lastLng } : null;
  for (const job of active) {
    const key = `${job.sellerId}|${job.pickupLocation.trim().toLowerCase()}`;
    // Supplier pickups carry a time: "Pick up 12–4pm today" (the run shows the first one).
    const pickupWindow = pickupWindowText(job.pickupWindowStart, job.pickupWindowEnd);
    // "1.2 km from you": straight line from the rider's last known spot, when both are known.
    const pickupKm = here && job.pickupLat !== null && job.pickupLng !== null ? Math.round(haversineMeters(here, { lat: job.pickupLat, lng: job.pickupLng }) / 100) / 10 : null;
    const run = runs.get(key) ?? { key, pickupName: job.seller.store?.name ?? job.seller.name, pickupAddress: job.pickupLocation, pickupWindow, pickupKm,
      // "Yaba → Lekki": the known area of the pickup and of the drop, when the address names one.
      pickupArea: areaFromText(job.pickupLocation)?.name ?? null,
      pickupPhone: job.seller.phone ? toE164(job.seller.phone) : null,
      pickupLat: null, pickupLng: null,
      fees: 0, drops: [] };
    const pickupAt = pickupCoords.get(job.id) ?? (job.pickupLat !== null && job.pickupLng !== null ? { lat: job.pickupLat, lng: job.pickupLng } : null);
    if (run.pickupLat === null && pickupAt) {
      run.pickupLat = pickupAt.lat;
      run.pickupLng = pickupAt.lng;
    }
    if (!run.pickupWindow && pickupWindow) run.pickupWindow = pickupWindow;
    const order = job.orderId ? orderById.get(job.orderId) : undefined;
    run.fees += riderAmount(rider, job);
    run.drops.push({
      id: job.id,
      status: job.status,
      address: dropAddressOf(job),
      area: job.destination,
      areaShort: areaFromText(job.destination)?.name ?? null,
      buyerName: order?.buyerName ?? null,
      buyerPhone: order?.buyerPhone ? toE164(order.buyerPhone) : null,
      collect: job.codAmount && job.codAmount > 0 ? job.codAmount : 0,
      // Pay on delivery (shared/pay-at-door.ts): the customer pays in the app at the door and gets the code; the rider
      // shows `url` as a QR code. No cash.
      payInApp: order && isPayOnDelivery(order) && !(job.codAmount && job.codAmount > 0)
        ? { amount: doorAmountNaira(order), paid: payAtDoorPaid(order), url: buildStorefrontUrl(order.store, `/order/${order.id}#pay`) }
        : null,
      // What this one drop pays the rider once their pay is set, else its delivery fee (the run's fees add these up).
      fee: riderAmount(rider, job),
      item: packageSummary(job.packageDetails),
      hasProof: Boolean(job.proofUrl),
      // The sealed-parcel photo at pickup: needed for a shop's or supplier's parcel (a job that carries an order).
      needsPickupPhoto: Boolean(job.orderId),
      hasPickupPhoto: Boolean(job.pickupPhotoUrl),
      // The shop has a pickup code to give the rider (never the code itself).
      hasPickupCode: Boolean(job.pickupCode),
      // "Ask for order SB-2041" at pickup.
      orderNumber: order?.orderNumber ?? null,
      // The drop-off pin, for the job in hand only.
      dropLat: job.id === mapJob?.id ? (dropCoords?.lat ?? null) : null,
      dropLng: job.id === mapJob?.id ? (dropCoords?.lng ?? null) : null,
    });
    runs.set(key, run);
  }

  return ok({
    rider: { id: rider.id, name: rider.name, partnerName: rider.partnerName, partnerPhone: rider.partnerPhone, online: rider.online, plate: rider.plate, language: rider.language },
    earnedToday: doneToday.reduce((sum, job) => sum + riderAmount(rider, job), 0),
    // The partner set this rider's pay: the amounts are the rider's earnings, not delivery fees.
    paySet: Boolean(rider.payType),
    dropsDone: doneToday.length,
    cashInHand: cashToPayIn(cashJobs),
    week,
    runs: [...runs.values()],
  });
}

/** The work's answer, or `fallback` if it takes longer than `ms` or fails (a slow lookup carries on and fills its cache). */
function withinMs<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([work.catch(() => fallback), late]).finally(() => clearTimeout(timer));
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("online"), online: z.boolean() }),
  z.object({ action: z.literal("start_run"), jobIds: z.array(z.string().max(64)).min(1).max(50), codes: z.record(z.string().max(64), z.string().max(12)).optional() }),
  z.object({
    action: z.literal("delivered"),
    jobId: z.string().max(64),
    code: z.string().max(12),
    recipientName: z.string().max(80).nullish(),
    codCollected: z.number().min(0).nullish(),
    codMethod: z.enum(["cash", "transfer"]).nullish(),
  }),
  z.object({ action: z.literal("failed"), jobId: z.string().max(64), reason: z.string().min(1).max(300) }),
  // Logistics marketplace: on the way to the customer, or left at the pickup point.
  z.object({ action: z.literal("stage"), jobId: z.string().max(64), to: z.enum(["out_for_delivery", "at_pickup_point"]) }),
  // Riders app on the phone.
  z.object({ action: z.literal("skip"), jobId: z.string().max(64) }),
  z.object({ action: z.literal("help"), jobId: z.string().max(64), reason: z.string().trim().min(1).max(200) }),
  z.object({ action: z.literal("check_code"), jobId: z.string().max(64), code: z.string().max(12) }),
  z.object({ action: z.literal("language"), language: z.enum(RIDER_LANGUAGES) }),
  z.object({ action: z.literal("pay_link"), jobId: z.string().max(64) }),
  // The rider types their own bike or vehicle plate (the company can still change it).
  z.object({ action: z.literal("plate"), plate: z.string().max(30) }),
]);

export async function POST(req: NextRequest) {
  const token = tokenOf(req);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the details and try again.");
  const input = parsed.data;

  if (input.action === "skip" || input.action === "help" || input.action === "check_code" || input.action === "language" || input.action === "plate") {
    const session = await riderFromToken(token);
    if (!session.ok) return apiError(session.reason === "limited" ? "RATE_LIMITED" : "UNAUTHORIZED", session.reason === "limited" ? "Too many tries. Wait a minute and try again." : LINK_ERROR, session.reason === "limited" ? 429 : 401);
    if (input.action === "language") {
      await saveRiderLanguage(session.rider, input.language);
      return ok({ done: true });
    }
    if (input.action === "plate") {
      // The same rule as the company's form (api/mobile/logistics/riders): capitals, single spaces, 20 at most.
      const plate = input.plate.trim().replace(/\s+/g, " ").toUpperCase().slice(0, 20) || null;
      await db.logisticsTeamMember.update({ where: { id: session.rider.id }, data: { plate } });
      return ok({ done: true });
    }
    const step =
      input.action === "skip" ? await skipJob(session.rider, input.jobId)
      : input.action === "help" ? await askForHelp(session.rider, input.jobId, input.reason)
      : await checkDeliveryCode(session.rider, input.jobId, input.code);
    if (!step.ok) return apiError(step.code, step.error, step.code === "NOT_FOUND" ? 404 : step.code === "RATE_LIMITED" ? 429 : 409);
    return ok({ done: true });
  }

  // The web Riders app's actions re-check the token and only touch jobs assigned to this rider.
  const result =
    input.action === "online" ? await setRiderOnline(token, input.online)
    // The phone app photographs the sealed parcel at pickup and at handover (shared/fault-matrix.ts): required here.
    : input.action === "start_run" ? await startRun(token, input.jobIds, input.codes ?? null, { requirePhotos: true })
    : input.action === "failed" ? await markFailed(token, { jobId: input.jobId, reason: input.reason })
    : input.action === "stage" ? await markStage(token, { jobId: input.jobId, to: input.to })
    : input.action === "pay_link" ? await resendPayLink(token, input.jobId)
    : await markDelivered(token, { jobId: input.jobId, code: input.code, recipientName: input.recipientName ?? null, codCollected: input.codCollected ?? null, codMethod: input.codMethod ?? null }, { requirePhoto: true });
  if (!result.ok) {
    if (result.error === WRONG_PICKUP_CODE) return apiError("WRONG_PICKUP_CODE", result.error, 409);
    if (result.error === PICKUP_PHOTO_NEEDED || result.error === HANDOVER_PHOTO_NEEDED) return apiError("PHOTO_NEEDED", result.error, 409);
    return apiError(result.error === LINK_ERROR ? "UNAUTHORIZED" : "CONFLICT", result.error, result.error === LINK_ERROR ? 401 : 409);
  }

  if (input.action === "delivered" && input.recipientName?.trim()) {
    const session = await riderFromToken(token);
    if (session.ok) {
      const job = await db.deliveryBooking.findFirst({ where: { id: input.jobId, riderId: session.rider.id }, select: { id: true, notes: true } });
      if (job) await db.deliveryBooking.update({ where: { id: job.id }, data: { notes: notesWithRecipient(job.notes, input.recipientName) } }).catch(() => null);
    }
  }
  return ok({ done: true });
}
