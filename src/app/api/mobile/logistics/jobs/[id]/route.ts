import { NextRequest } from "next/server";
import { z } from "zod";
import { withLogistics } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { apiError, ok } from "@/lib/api/response";
import { isOnboardingComplete } from "@/lib/role-queries";
import { assignRider, transitionJob } from "@/lib/logistics/jobs";
import { canWorkExistingJobs } from "@/lib/logistics/job-rules";
import { JOB_SELECT, dispatchRiders, jobView, notesWithRecipient, ordersFor, partnerForUser, pickupGeoFor } from "../../_shared";

export const dynamic = "force-dynamic";

// One delivery job in the partner app. GET → the job and the active riders. POST moves it, with the same rules
// as the web dispatch console (src/app/actions/logistics.ts → transitionJob / assignRider):
//   { action: "accept", riderId? }       new request → accepted (gets the buyer's delivery code), optionally assigned
//   { action: "decline", reason? }       new request → declined, with why (the shop can send it to another partner)
//   { action: "assign", riderId | null } give the job to a rider, or take it off them
//   { action: "status", to, code?, recipientName?, codCollected?, codMethod?, failedReason? }

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept"), riderId: z.string().max(64).nullish() }),
  z.object({ action: z.literal("decline"), reason: z.string().trim().max(300).nullish() }),
  z.object({ action: z.literal("assign"), riderId: z.string().max(64).nullable() }),
  z.object({
    action: z.literal("status"),
    to: z.enum(["confirmed", "picked_up", "in_transit", "out_for_delivery", "at_pickup_point", "delivered", "failed", "returning", "returned"]),
    code: z.string().max(12).nullish(),
    recipientName: z.string().max(80).nullish(),
    codCollected: z.number().min(0).nullish(),
    codMethod: z.enum(["cash", "transfer"]).nullish(),
    failedReason: z.string().max(300).nullish(),
  }),
]);

async function loadJob(partnerId: string, id: string, country?: string | null) {
  const job = await db.deliveryBooking.findFirst({ where: { id, logisticsPartnerId: partnerId }, select: JOB_SELECT });
  if (!job) return null;
  const [orders, pickupGeo] = await Promise.all([ordersFor([job]), pickupGeoFor([job], country)]);
  return jobView(job, job.orderId ? orders.get(job.orderId) : undefined, pickupGeo.get(job.id));
}

export const GET = withLogistics(async (_req: NextRequest, { user, params }) => {
  const partner = await partnerForUser(user.id);
  if (!partner) return apiError("NOT_FOUND", "Delivery partner profile not found", 404);
  const [job, riders] = await Promise.all([
    loadJob(partner.id, String(params.id), partner.country),
    dispatchRiders(partner.id),
  ]);
  if (!job) return apiError("NOT_FOUND", "We couldn't find that job. It may have been cancelled.", 404);
  return ok({ job, riders });
});

export const POST = withLogistics(async (req: NextRequest, { user, params }) => {
  const partner = await partnerForUser(user.id);
  if (!partner) return apiError("NOT_FOUND", "Delivery partner profile not found", 404);
  // Suspended partners still finish the jobs they have (they just get no new ones).
  if (!isOnboardingComplete(partner) || !canWorkExistingJobs(partner)) {
    return apiError("VERIFICATION_REQUIRED", "Finish setting up and get verified before you take jobs.", 403);
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the details and try again.");
  const input = parsed.data;
  const bookingId = String(params.id);
  const base = { bookingId, partnerId: partner.id, actor: "partner" as const };

  if (input.action === "accept") {
    const accepted = await transitionJob({ ...base, to: "confirmed" });
    if (!accepted.ok) return apiError("CONFLICT", accepted.error, 409);
    if (input.riderId) {
      const assigned = await assignRider({ bookingId, partnerId: partner.id, riderId: input.riderId });
      if (!assigned.ok) return apiError("CONFLICT", `Accepted, but ${assigned.error.charAt(0).toLowerCase()}${assigned.error.slice(1)}`, 409);
    }
  } else if (input.action === "decline") {
    // Older app versions send no reason; the shop still sees that the partner said no.
    const declined = await transitionJob({ ...base, to: "declined", declineReason: input.reason?.trim() || "Declined in the partner app" });
    if (!declined.ok) return apiError("CONFLICT", declined.error, 409);
  } else if (input.action === "assign") {
    const assigned = await assignRider({ bookingId, partnerId: partner.id, riderId: input.riderId });
    if (!assigned.ok) return apiError("CONFLICT", assigned.error, 409);
  } else {
    const current = await db.deliveryBooking.findFirst({ where: { id: bookingId, logisticsPartnerId: partner.id }, select: { deliveryCode: true, proofUrl: true, notes: true } });
    if (!current) return apiError("NOT_FOUND", "Job not found", 404);
    const code = input.code?.trim() || null;
    const recipient = input.recipientName?.trim() || null;
    if (input.to === "delivered") {
      // The dispatcher may close a job without the buyer's code (as on the web), but needs some proof.
      if (code && current.deliveryCode && code !== current.deliveryCode) return apiError("BAD_REQUEST", "That delivery code doesn't match. Ask the buyer for the 4-digit code.");
      if (!code && !recipient && !current.proofUrl) return apiError("BAD_REQUEST", "Add the buyer's code, who received it, or a photo of the parcel.");
    }
    const moved = await transitionJob({
      ...base,
      to: input.to,
      code,
      failedReason: input.failedReason ?? null,
      codCollected: input.codCollected ?? null,
      codMethod: input.codMethod ?? null,
    });
    if (!moved.ok) return apiError("CONFLICT", moved.error, 409);
    if (input.to === "delivered" && recipient) {
      await db.deliveryBooking.update({ where: { id: bookingId }, data: { notes: notesWithRecipient(current.notes, recipient) } }).catch(() => null);
    }
  }

  const job = await loadJob(partner.id, bookingId);
  return ok({ job });
});
