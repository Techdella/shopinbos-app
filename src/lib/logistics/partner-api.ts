import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { JOB_STATUSES } from "./job-rules";
import { isHttpsUrl, partnerJob } from "./partner-api-core";

// Reads and request bodies for /api/v1/partner/*. Route handlers stay thin; the rules live in jobs.ts, quotes.ts
// and remittances.ts so the portal, the Riders app and the API agree.

const JOB_SELECT = {
  id: true, status: true, pickupLocation: true, destination: true, packageDetails: true, deliveryFee: true, currency: true,
  codAmount: true, codCollected: true, codMethod: true, trackingCode: true, estimatedDelivery: true, pickedUpAt: true,
  deliveredAt: true, failedReason: true, proofUrl: true, createdAt: true, orderId: true,
  rider: { select: { id: true, name: true, phone: true } },
} as const;

async function buyersFor(orderIds: string[]) {
  if (!orderIds.length) return new Map<string, { name: string; phone: string | null }>();
  const orders = await db.retailOrder.findMany({ where: { id: { in: orderIds } }, select: { id: true, buyerName: true, buyerPhone: true } });
  return new Map(orders.map((order) => [order.id, { name: order.buyerName, phone: order.buyerPhone }]));
}

export async function listPartnerJobs(partnerId: string, opts: { status?: (typeof JOB_STATUSES)[number]; skip: number; take: number }) {
  const where = { logisticsPartnerId: partnerId, ...(opts.status ? { status: opts.status } : {}) };
  const [total, jobs] = await Promise.all([
    db.deliveryBooking.count({ where }),
    db.deliveryBooking.findMany({ where, orderBy: { createdAt: "desc" }, skip: opts.skip, take: opts.take, select: JOB_SELECT }),
  ]);
  const buyers = await buyersFor(jobs.map((job) => job.orderId).filter((id): id is string => Boolean(id)));
  return { total, jobs: jobs.map((job) => partnerJob(job, job.orderId ? buyers.get(job.orderId) : null)) };
}

export async function getPartnerJob(partnerId: string, id: string) {
  const job = await db.deliveryBooking.findFirst({ where: { id, logisticsPartnerId: partnerId }, select: JOB_SELECT });
  if (!job) return null;
  const buyers = await buyersFor(job.orderId ? [job.orderId] : []);
  return partnerJob(job, job.orderId ? buyers.get(job.orderId) : null);
}

export const JobListQuery = z.object({ status: z.enum(JOB_STATUSES).optional() });

export const AcceptBody = z.object({ riderId: z.string().min(1).max(64).optional() }).strict();

export const StatusBody = z
  .object({
    status: z.enum(["picked_up", "in_transit", "delivered", "failed"]),
    code: z.string().regex(/^\d{4}$/, "code must be the buyer's 4-digit code").optional(),
    reason: z.string().trim().min(1).max(300).optional(),
    cod: z.object({ amount: z.number().nonnegative().max(100_000_000), method: z.enum(["cash", "transfer"]) }).optional(),
    trackingCode: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

export const ProofBody = z.object({ photoUrl: z.string().max(1000).refine(isHttpsUrl, "photoUrl must be an https URL") }).strict();

export const QuoteBody = z
  .object({
    quoteId: z.string().min(1).max(64),
    decline: z.boolean().optional(),
    quotedPrice: z.number().positive().optional(),
    message: z.string().max(1000).optional(),
    expiresAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict()
  .refine((body) => body.decline || body.quotedPrice !== undefined, { message: "Send quotedPrice, or decline: true", path: ["quotedPrice"] });

export const RemittanceBody = z
  .object({ amount: z.number().positive().max(100_000_000), reference: z.string().trim().min(1).max(120), note: z.string().max(500).optional() })
  .strict();

export function firstIssue(error: z.ZodError) {
  const issue = error.issues[0];
  if (!issue) return "Invalid request body.";
  return issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message;
}

export async function readJson(req: Request) {
  return req.json().catch(() => undefined);
}
