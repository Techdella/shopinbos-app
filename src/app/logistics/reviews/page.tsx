import type { Metadata } from "next";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { Card, EmptyState, StatGrid, StatTile } from "@/components/app-kit";
import { PartnerPage } from "@/components/logistics/kit";
import { ReviewsClient } from "./ReviewsClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reviews" };

export default async function LogisticsReviewsPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);

  const reviews = await db.logisticsReview.findMany({
    where: { logisticsPartnerId: partner.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      reviewer: { select: { id: true, name: true, role: true, avatarUrl: true } },
      booking: { select: { id: true, pickupLocation: true, destination: true } },
    },
  });

  const total = reviews.length;
  const avgRating = total > 0 ? reviews.reduce((sum, review) => sum + review.rating, 0) / total : 0;
  const distribution = [0, 0, 0, 0, 0];
  reviews.forEach((review) => { if (review.rating >= 1 && review.rating <= 5) distribution[review.rating - 1]++; });
  const responded = reviews.filter((review) => review.response).length;

  return (
    <PartnerPage frame={{ user, partner }} title="Reviews" sub="What sellers say after you deliver for them. Replies are public.">
      <StatGrid className="mb-5 md:grid-cols-3">
        <StatTile tone="card" label="Average rating" value={total ? `${avgRating.toFixed(1)} ★` : "—"} hint={`${total} ${total === 1 ? "review" : "reviews"}`} />
        <StatTile tone="card" label="You replied to" value={`${responded} of ${total}`} hint={`${total ? Math.round((responded / total) * 100) : 0}% replied`} />
        <Card className="col-span-2 px-4 py-3.5 md:col-span-1" as="div">
          <div className="text-[13px] text-app-ink-soft">Breakdown</div>
          <ul className="m-0 mt-2 grid list-none gap-1 p-0">
            {[5, 4, 3, 2, 1].map((star) => (
              <li key={star} className="flex items-center gap-2 text-[12.5px]">
                <span className="w-10 shrink-0">{star} star</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-app-track">
                  <span className="block h-full rounded-full bg-app-ink" style={{ width: `${total ? (distribution[star - 1] / total) * 100 : 0}%` }} />
                </span>
                <span className="w-6 shrink-0 text-right text-app-ink-soft">{distribution[star - 1]}</span>
              </li>
            ))}
          </ul>
        </Card>
      </StatGrid>

      {total === 0 ? (
        <EmptyState icon="star" title="No reviews yet">Sellers can review you once a delivery is done. Their reviews show up here.</EmptyState>
      ) : (
        <ReviewsClient
          reviews={reviews.map((review) => ({
            id: review.id,
            rating: review.rating,
            comment: review.comment,
            response: review.response,
            respondedAt: review.respondedAt?.toISOString() ?? null,
            createdAt: review.createdAt.toISOString(),
            reviewer: { name: review.reviewer.name, role: review.reviewer.role },
            booking: review.booking ? { pickup: review.booking.pickupLocation, dest: review.booking.destination } : null,
          }))}
        />
      )}
    </PartnerPage>
  );
}
