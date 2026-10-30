import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { Card, CardHead, EmptyState, ListCard, ListRow, StatGrid, StatTile } from "@/components/app-kit";
import { pilotNumbersOnForOwner, storePilotNumbers } from "@/lib/pilot-numbers.server";
import { getLocale, getT } from "@/lib/i18n/server";
import { formatMoney, formatNumber } from "@shared/i18n";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("pilotNumbers");
  return { title: t("metaTitle") };
}

// Pilot numbers (shared/pilot-numbers.ts): the shop's numbers in the Shopinbos pilot. Only for shops a pilot feature
// is on for (post_to_plug, resell, notify_followers or plug_follow_card, on any business app). Same numbers on the
// phone (GET /api/app/pilot-numbers) and, for every pilot shop, in Admin › Pilot numbers.
export default async function PilotNumbersPage() {
  const user = await requireRole(["seller"], "/login");
  if (!(await pilotNumbersOnForOwner(user.id))) notFound();
  const t = await getT("pilotNumbers");
  const locale = await getLocale();
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, currency: true } });
  const numbers = store ? await storePilotNumbers(store.id) : null;
  const money = (amount: number) => formatMoney(amount, locale, { currency: store?.currency ?? "NGN" });
  const count = (value: number) => formatNumber(value, locale);

  return (
    <SellerPage user={user} store={storeSummary(store)} title={t("title")} sub={t("sub")}>
      {numbers ? (
        <div className="grid gap-5">
          <Card className="p-5">
            <CardHead title={t("visits.title")} />
            <StatGrid>
              <StatTile tone="plain" label={t("visits.days7")} value={count(numbers.visits.total7)} hint={t("visits.split", { link: count(numbers.visits.link7), qr: count(numbers.visits.qr7) })} />
              <StatTile tone="plain" label={t("visits.days30")} value={count(numbers.visits.total30)} hint={t("visits.split", { link: count(numbers.visits.link30), qr: count(numbers.visits.qr30) })} />
              <StatTile tone="plain" label={t("plug.title")} value={numbers.plugLive ? count(numbers.plugJoins) : "–"} hint={numbers.plugLive ? undefined : t("plug.soon")} />
            </StatGrid>
          </Card>

          <StatGrid>
            <StatTile tone="card" label={t("followers.title")} value={count(numbers.followers.total)} hint={t("followers.fromLinks", { count: count(numbers.followers.fromLink + numbers.followers.fromQr) })} />
            <StatTile tone="card" label={t("buyers.title")} value={count(numbers.buyers.repeat)} hint={t("buyers.of", { repeat: count(numbers.buyers.repeat), buyers: count(numbers.buyers.buyers) })} />
            <StatTile tone="card" label={t("resell.title")} value={t("resell.sales", { count: numbers.resell.sales })} hint={`${t("resell.value", { amount: money(numbers.resell.value) })} · ${t("resell.commission", { amount: money(numbers.resell.commission) })}`} />
          </StatGrid>

          <Card className="p-5">
            <CardHead title={t("videos.title")} sub={t("videos.totalViews", { count: numbers.videoViews })} />
            {numbers.videos.length ? (
              <ListCard>
                {numbers.videos.map((video) => (
                  <ListRow key={video.id}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-extrabold">{video.productName || video.caption || "—"}</div>
                      <div className="text-[13.5px] text-app-ink-soft">{t("videos.orders", { count: video.ordersSince })}</div>
                    </div>
                    <div className="text-right text-[14px] font-extrabold">{t("videos.views", { count: video.views })}</div>
                  </ListRow>
                ))}
              </ListCard>
            ) : (
              <p className="m-0 text-[14px] text-app-ink-soft">{t("videos.empty")}</p>
            )}
            <p className="mb-0 mt-3 text-[12.5px] text-app-ink-soft">{t("videos.note")}</p>
          </Card>
        </div>
      ) : (
        <EmptyState icon="chart" title={t("off")} />
      )}
    </SellerPage>
  );
}
