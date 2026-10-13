import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { Card, CardHead, Pill, PillLink, StatTile } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { KeyValue, naira } from "@/components/logistics/kit";
import { messagesHref } from "@/lib/conversations/pure";
import { getT } from "@/lib/i18n/server";

// Public partner page sellers open from the logistics marketplace.

export const dynamic = "force-dynamic";

const PRICING_MODEL: Record<string, string> = {
  fixed: "Fixed price per delivery",
  weight_based: "Based on weight",
  distance_based: "Based on distance",
};

export default async function PublicLogisticsPartnerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const partner = await db.logisticsPartner.findUnique({
    where: { slug },
    include: {
      user: { select: { name: true } },
      payoutAccount: { select: { verificationStatus: true } },
    },
  });

  if (!partner || partner.status !== "active" || partner.verificationStatus !== "verified") {
    notFound();
  }

  const [bookingsCount, teamCount] = await Promise.all([
    db.deliveryBooking.count({ where: { logisticsPartnerId: partner.id, status: "delivered" } }),
    db.logisticsTeamMember.count({ where: { logisticsPartnerId: partner.id, status: "active" } }),
  ]);
  const place = [partner.city, partner.country].filter(Boolean).join(", ");
  const t = await getT("logistics", "common");

  return (
    <div className="app-scope min-h-dvh w-full bg-app-canvas font-app text-app-ink">
      <div className="w-full px-4 py-6 sm:px-6 xl:px-8 2xl:px-10">
        <Link href="/marketplace/logistics" className="mb-5 inline-flex min-h-[40px] items-center gap-1.5 text-[15px] font-bold text-app-ink no-underline hover:underline">
          <Icon name="arrowLeft" size={15} /> {t("partnerPage.back")}
        </Link>

        <Card className="mb-5 overflow-hidden">
          <div
            className="h-[140px] bg-app-ink bg-cover bg-center sm:h-[200px]"
            style={partner.bannerUrl ? { backgroundImage: `url(${partner.bannerUrl})` } : undefined}
            aria-hidden
          />
          <div className="flex flex-wrap items-end gap-4 px-5 pb-5">
            {/* Only the logo overlaps the cover, so the name never sits on the dark band. */}
            <span className="-mt-10 grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-[20px] border-[3px] border-white bg-app-canvas text-[28px] font-extrabold shadow-sm">
              {partner.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={partner.logoUrl} alt={t("upload.logoAlt", { name: partner.displayName })} className="h-full w-full object-cover" />
              ) : (
                partner.displayName.charAt(0).toUpperCase()
              )}
            </span>
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="m-0 break-words text-[26px] font-extrabold leading-[1.1] tracking-[-0.6px] sm:text-[30px]">{partner.displayName}</h1>
                <Pill tone="success">{t("company.verified")}</Pill>
              </div>
              <p className="m-0 mt-1 text-[15px] text-app-ink-soft">{[place, partner.estimatedSpeed || t("partnerPage.sameDayDelivery")].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <PillLink href={`/home/logistics?partner=${partner.slug}`} tone="accent" icon="truck" className="flex-1 sm:flex-none">{t("partnerPage.requestQuote")}</PillLink>
              <PillLink href={`/home/logistics?partner=${partner.slug}`} icon="cart" className="flex-1 sm:flex-none">{t("partnerPage.book")}</PillLink>
              <PillLink href={messagesHref("seller", { with: partner.id })} icon="chat" className="flex-1 sm:flex-none">{t("partnerPage.message")}</PillLink>
            </div>
          </div>
        </Card>

        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile tone="card" label={t("partnerPage.done")} value={bookingsCount.toLocaleString("en-NG")} />
          <StatTile tone="card" label={t("performance.rating")} value={partner.ratingCount ? `${partner.rating.toFixed(1)} ★` : t("partnerPage.new")} hint={partner.ratingCount ? t("reviews.count", { count: partner.ratingCount }) : undefined} />
          <StatTile tone="card" label={t("company.reliability")} value={partner.reliabilityScore ? `${partner.reliabilityScore}/100` : t("partnerPage.new")} />
          <StatTile tone="card" label={t("partnerPage.team")} value={teamCount} />
        </div>

        <div className="grid gap-5 xl:[grid-template-columns:minmax(0,1fr)_400px]">
          <div className="grid min-w-0 content-start gap-5">
            <Card className="p-5">
              <CardHead title={t("company.aboutLabel")} />
              <p className="m-0 mt-2 max-w-[760px] text-[15px] leading-[1.6] text-app-ink-soft">
                {partner.description || t("partnerPage.defaultDescription")}
              </p>
            </Card>
            <Card className="p-5">
              <CardHead title={t("partnerPage.whereDeliver")} />
              <div className="mt-3 flex flex-wrap gap-1.5">
                {partner.coverageZones.length ? partner.coverageZones.map((zone) => <Pill key={zone} tone="ink">{zone}</Pill>) : <span className="text-[15px] text-app-ink-soft">{t("partnerPage.askAreas")}</span>}
              </div>
            </Card>
            <div className="grid gap-5 sm:grid-cols-2">
              <Card className="p-5">
                <CardHead title={t("coverage.vehicles")} />
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {partner.vehicleTypes.length ? partner.vehicleTypes.map((type) => <Pill key={type}>{type}</Pill>) : <span className="text-[15px] text-app-ink-soft">{t("partnerPage.notListed")}</span>}
                </div>
              </Card>
              <Card className="p-5">
                <CardHead title={t("coverage.deliveryTypes")} />
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {partner.deliveryTypes.length ? partner.deliveryTypes.map((type) => <Pill key={type}>{type.replace(/_/g, " ")}</Pill>) : <span className="text-[15px] text-app-ink-soft">{t("partnerPage.notListed")}</span>}
                </div>
              </Card>
            </div>
          </div>

          <div className="grid min-w-0 content-start gap-5">
            <Card className="p-5">
              <CardHead title={t("pricing.title")} />
              <div className="mt-2 divide-y divide-app-line">
                <KeyValue label={t("partnerPage.howCharge")}>{PRICING_MODEL[partner.pricingModel] ? t.dynamic(`pricing.model.${partner.pricingModel}`, PRICING_MODEL[partner.pricingModel]) : partner.pricingModel}</KeyValue>
                <KeyValue label={t("pricing.startingPrice")}>{partner.basePrice > 0 ? naira(partner.basePrice) : t("partnerPage.askQuote")}</KeyValue>
                <KeyValue label={t("partnerPage.speed")}>{partner.estimatedSpeed ?? t("partnerPage.sameDay")}</KeyValue>
              </div>
            </Card>
            {partner.whatsappNumber && (
              <Card className="p-5">
                <CardHead title={t("partnerPage.contact")} />
                <a
                  href={`https://wa.me/${partner.whatsappNumber.replace(/[^0-9]/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-app-line px-5 text-[15px] font-extrabold text-app-ink no-underline hover:border-app-line-strong"
                >
                  <Icon name="whatsapp" size={16} /> {t("partnerPage.whatsapp")}
                </a>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
