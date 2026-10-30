import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { apiError, ok } from "@/lib/api/response";
import { riderFromToken } from "@/lib/logistics/rider-session";
import { riderRating, riderReviewUrl } from "@/lib/logistics/rider-messages.server";

export const dynamic = "force-dynamic";

// Riders app reviews, X-Rider-Token header:
//   GET               → { rating: { average, count } | null }  the rider's own rating (Me)
//   GET ?job=<id>     → { url, phone }  the customer's review link for a job this rider delivered, to send them

const LINK_ERROR = "This link no longer works. Ask your dispatcher for a new one.";

export async function GET(req: NextRequest) {
  const session = await riderFromToken(req.headers.get("x-rider-token")?.trim() ?? "");
  if (!session.ok) {
    return session.reason === "limited" ? apiError("RATE_LIMITED", "Too many tries. Wait a minute and try again.", 429) : apiError("UNAUTHORIZED", LINK_ERROR, 401);
  }
  const jobId = req.nextUrl.searchParams.get("job")?.slice(0, 40);
  if (!jobId) return ok({ rating: await riderRating(session.rider.id) });

  const job = await db.deliveryBooking.findFirst({
    where: { id: jobId, riderId: session.rider.id, status: "delivered" },
    select: { id: true, orderId: true },
  });
  if (!job) return apiError("NOT_FOUND", "You can send the review link once this job is delivered.", 404);
  const url = riderReviewUrl(job.id);
  if (!url) return apiError("UNAVAILABLE", "Review links aren't ready yet. Try again later.", 503);
  const order = job.orderId ? await db.retailOrder.findUnique({ where: { id: job.orderId }, select: { buyerPhone: true } }) : null;
  return ok({ url, phone: order?.buyerPhone ?? null });
}
