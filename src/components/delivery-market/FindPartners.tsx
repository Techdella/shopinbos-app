import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { Card, CardHead, EmptyState, Pill, PillLink, Thumb } from "@/components/app-kit";
import { field, pillButton } from "@/components/seller-core";
import type { FindFiltersShape } from "./find-filters";
import type { findPartners } from "@/lib/delivery-market/manage.server";
import { connectPartnerAction } from "@/app/actions/delivery-market";
import { NG_STATES, RATE_SERVICES } from "@shared/delivery-market";
import { areasSummary, naira, Rating, VerifiedPill } from "./bits";
import { serviceLabel, timeframeText } from "./words";
import { Term } from "@/components/learn/Term";

// "Find partners" for sellers and suppliers: filters (a GET form) and the ranked partner cards from findPartners.

type Found = Awaited<ReturnType<typeof findPartners>>;

export async function FindPartners({
  found,
  filters,
  path,
  detailBase,
  back,
  originLabel,
}: {
  found: Found;
  filters: FindFiltersShape;
  /** The page the filter form submits to. */
  path: string;
  detailBase: string;
  back: string;
  /** "Lagos · Ikeja", or null when the business hasn't said where it ships from. */
  originLabel: string | null;
}) {
  const t = await getT("delivery");
  const tc = await getT("contracts");
  return (
    <section id="find" className="grid scroll-mt-24 gap-4">
      <Card className="p-5">
        <CardHead
          title={t("find.title")}
          sub={originLabel ? t("find.subFrom", { origin: originLabel }) : t("find.sub")}
        />
        <form action={`${path}#find`} method="get" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block min-w-0">
            <span className={field.label}>{t("find.search")}</span>
            <input name="q" defaultValue={filters.q ?? ""} placeholder={t("find.searchPlaceholder")} className={field.input} />
          </label>
          <label className="block min-w-0">
            <span className={field.label}>{t("rates.service")}</span>
            <select name="service" defaultValue={filters.service ?? ""} className={field.select}>
              <option value="">{t("find.anyService")}</option>
              {[...RATE_SERVICES, "interstate"].map((service) => <option key={service} value={service}>{serviceLabel(t, service)}</option>)}
            </select>
          </label>
          <label className="block min-w-0">
            <span className={field.label}>{t("find.deliversTo")}</span>
            <select name="state" defaultValue={filters.state ?? ""} className={field.select}>
              <option value="">{t("find.whereISell")}</option>
              {NG_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
            </select>
          </label>
          <label className="block min-w-0">
            <span className={field.label}>{t("find.maxPrice")}</span>
            <input name="maxPrice" inputMode="numeric" defaultValue={filters.maxPrice ?? ""} placeholder="5000" className={field.input} />
          </label>
          <label className="block min-w-0">
            <span className={field.label}>{t("find.rating")}</span>
            <select name="minRating" defaultValue={filters.minRating ? String(filters.minRating) : ""} className={field.select}>
              <option value="">{t("find.anyRating")}</option>
              <option value="3">{t("find.starsUp", { stars: "3" })}</option>
              <option value="4">{t("find.starsUp", { stars: "4" })}</option>
              <option value="4.5">{t("find.starsUp", { stars: "4.5" })}</option>
            </select>
          </label>
          <label className="flex min-h-12 items-center gap-2 self-end text-[14px] font-bold">
            <input type="checkbox" name="pickupPoints" value="1" defaultChecked={!!filters.pickupPoints} className={field.checkbox} />
            <Term k="pickup-points">{t("find.hasPickupPoints")}</Term>
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
            <button type="submit" className={pillButton.ink}>{t("find.show")}</button>
            <Link href={`${path}#find`} className={`${pillButton.white} no-underline`}>{t("find.clear")}</Link>
          </div>
        </form>
      </Card>

      {found.rows.length === 0 ? (
        <EmptyState icon="truck" title={t("find.emptyTitle")}>
          {t("find.emptyBody")}
        </EmptyState>
      ) : (
        <>
          <p className="m-0 mb-3 text-[13px] text-app-ink-soft">{tc("connect.note")}</p>
          <div className="grid gap-3 md:grid-cols-2">
            {found.rows.map((row) => {
              const partner = row.partner;
              return (
                <Card key={partner.id} as="article" className="flex flex-col gap-3 p-5">
                  <div className="flex items-start gap-3">
                    <Thumb src={partner.logoUrl} label={partner.displayName} size={44} />
                    <div className="min-w-0 flex-1">
                      <Link href={`${detailBase}/${partner.slug}`} className="text-[15.5px] font-extrabold text-app-ink no-underline hover:underline">{partner.displayName}</Link>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px]">
                        <VerifiedPill status={partner.verificationStatus} />
                        <Rating rating={partner.rating} count={partner.ratingCount} />
                      </div>
                    </div>
                    {row.startingPrice !== null && (
                      <div className="shrink-0 text-right">
                        <div className="text-[12.5px] text-app-ink-soft">{t("find.from")}</div>
                        <div className="text-[16px] font-extrabold">{naira(row.startingPrice)}</div>
                      </div>
                    )}
                  </div>
                  <div className="grid gap-1 text-[13.5px]">
                    <div><span className="text-app-ink-soft">{t("find.deliversToLabel")} </span>{areasSummary(partner.deliveryAreas, 4, t)}</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {row.timeframe && <span><span className="text-app-ink-soft">{t("find.timeframeLabel")} </span>{timeframeText(t, row.timeframe)}</span>}
                      {row.pickupPointCount > 0 && <span>{t("find.pickupPoints", { count: row.pickupPointCount })}</span>}
                      {row.stats.completed > 0 && <span>{t("find.deliveriesOnShopinbos", { count: row.stats.completed })}</span>}
                      {row.stats.onTimeRate !== null && <span>{t("find.onTimePercent", { rate: `${row.stats.onTimeRate}` })}</span>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {partner.services.map((service) => <Pill key={service} tone="muted">{serviceLabel(t, service)}</Pill>)}
                      {partner.offersPayOnDelivery && <Pill tone="muted">{t("pod.title")}</Pill>}
                    </div>
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2">
                    <PillLink href={`${detailBase}/${partner.slug}`} size="sm">{t("find.view")}</PillLink>
                    {row.connectionId ? (
                      <Pill tone="success">{t("connected")}</Pill>
                    ) : (
                      <form action={connectPartnerAction}>
                        <input type="hidden" name="partnerId" value={partner.id} />
                        <input type="hidden" name="back" value={`${back}#my-partners`} />
                        <button type="submit" className={pillButton.ink}>{t("connect")}</button>
                      </form>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
