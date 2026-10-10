import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon } from "@/components/ui";
import { respondToReview } from "@/app/actions/reviews";
import { ReviewsClient } from "./ReviewsClient";

export const dynamic = "force-dynamic";

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
  const avgRating = total > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / total : 0;
  const distribution = [0, 0, 0, 0, 0];
  reviews.forEach((r) => { if (r.rating >= 1 && r.rating <= 5) distribution[r.rating - 1]++; });
  const responded = reviews.filter((r) => r.response).length;

  return (
    <AppFrame
      role="logistics_partner"
      storeName={partner.displayName}
      storeSlug={`${partner.city ?? "Lagos"} · Fleet`}
      storeInitial={partner.displayName.charAt(0).toUpperCase()}
      userName={user.name}
      userInitials={user.name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2)}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead
          title="Reviews"
          sub={total > 0 ? `${total} review${total > 1 ? "s" : ""} · ${avgRating.toFixed(1)} avg · ${responded} responded` : "Ratings and feedback from sellers, suppliers, and customers"}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div className="stat">
            <div className="stat-lbl">Average rating</div>
            <div className="stat-val" style={{ fontFamily: "var(--font-accent)" }}>
              {total > 0 ? <>{avgRating.toFixed(1)} <span style={{ fontSize: 18, color: "var(--amber-500)" }}>★</span></> : "—"}
            </div>
            <div className="stat-delta delta-flat">{total} total reviews</div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Responded to</div>
            <div className="stat-val">{responded}<span style={{ fontSize: 14, fontWeight: 400, color: "var(--ink-400)" }}>/{total}</span></div>
            <div className="stat-delta delta-flat">{total > 0 ? Math.round(responded / total * 100) : 0}% response rate</div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Rating breakdown</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 6 }}>
              {[5, 4, 3, 2, 1].map((star) => (
                <div key={star} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5 }}>
                  <span style={{ width: 14 }}>{star}</span>
                  <div style={{ flex: 1, height: 6, background: "var(--ink-100)", borderRadius: 3 }}>
                    <div style={{ width: `${total > 0 ? distribution[star - 1] / total * 100 : 0}%`, height: 6, background: "var(--amber-500)", borderRadius: 3 }} />
                  </div>
                  <span style={{ width: 20, textAlign: "right", color: "var(--ink-500)" }}>{distribution[star - 1]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <ReviewsClient
          reviews={reviews.map((r) => ({
            id: r.id,
            rating: r.rating,
            comment: r.comment,
            response: r.response,
            respondedAt: r.respondedAt?.toISOString() ?? null,
            createdAt: r.createdAt.toISOString(),
            reviewer: { name: r.reviewer.name, role: r.reviewer.role },
            booking: r.booking ? { pickup: r.booking.pickupLocation, dest: r.booking.destination } : null,
          }))}
        />
      </div>
    </AppFrame>
  );
}
