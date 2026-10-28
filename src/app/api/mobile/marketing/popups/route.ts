import { ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { marketingRoute } from "@/lib/marketing/api";
import { blankPopup, mobilePopup } from "@/lib/marketing/mobile-popups";

export const dynamic = "force-dynamic";

// Pop-ups for the phone app (boards M-Popups and M-PopupEdit; the web's /home/marketing/forms reads the same rows on
// the server): every pop-up with whether it's on and what it did in the last 30 days (seen, signed up), each ready to
// send back to PATCH /api/app/marketing/forms/:id, and a starting point for a new one (POST /api/app/marketing/forms).
// Turning one on or off is PATCH /api/app/marketing/forms/:id { active }.
export const GET = marketingRoute(async ({ store }) => {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [rows, stats] = await Promise.all([
    db.storeForm.findMany({ where: { storeId: store.id, isPopup: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.marketingFormStat.groupBy({ by: ["formId"], where: { storeId: store.id, day: { gte: since } }, _sum: { views: true, submissions: true } }).catch(() => []),
  ]);
  const byForm = new Map(stats.map((stat) => [stat.formId, { views: stat._sum.views ?? 0, signups: stat._sum.submissions ?? 0 }]));
  const popups = rows.map((row) => mobilePopup(row, byForm.get(row.id)));
  return ok({
    popups,
    blank: blankPopup(store.name),
    totals: { views: popups.reduce((sum, popup) => sum + popup.views, 0), signups: popups.reduce((sum, popup) => sum + popup.signups, 0) },
  });
});
