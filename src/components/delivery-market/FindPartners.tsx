import Link from "next/link";
import { Card, CardHead, EmptyState, Pill, PillLink, Thumb } from "@/components/app-kit";
import { field, pillButton } from "@/components/seller-core";
import type { FindFiltersShape } from "./find-filters";
import type { findPartners } from "@/lib/delivery-market/manage.server";
import { connectPartnerAction } from "@/app/actions/delivery-market";
import { NG_STATES, RATE_SERVICES } from "@shared/delivery-market";
import { areasSummary, naira, Rating, serviceWord, VerifiedPill } from "./bits";

// "Find partners" for sellers and suppliers: filters (a GET form) and the ranked partner cards from findPartners.

type Found = Awaited<ReturnType<typeof findPartners>>;

export function FindPartners({
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
  return (
    <section id="find" className="grid scroll-mt-24 gap-4">
      <Card className="p-5">
        <CardHead
          title="Find partners"
          sub={originLabel ? `Partners that collect from ${originLabel} and deliver where you sell. Verified, busy and on-time partners come first.` : "Partners that deliver where you sell. Add where your parcels leave from to see who can collect from you."}
        />
        <form action={`${path}#find`} method="get" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block min-w-0">
            <span className={field.label}>Search</span>
            <input name="q" defaultValue={filters.q ?? ""} placeholder="Partner name" className={field.input} />
          </label>
          <label className="block min-w-0">
            <span className={field.label}>Service</span>
            <select name="service" defaultValue={filters.service ?? ""} className={field.select}>
              <option value="">Any service</option>
              {[...RATE_SERVICES, "interstate"].map((service) => <option key={service} value={service}>{serviceWord(service)}</option>)}
            </select>
          </label>
          <label className="block min-w-0">
            <span className={field.label}>Delivers to</span>
            <select name="state" defaultValue={filters.state ?? ""} className={field.select}>
              <option value="">Where I sell</option>
              {NG_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
            </select>
          </label>
          <label className="block min-w-0">
            <span className={field.label}>Starting price up to (₦)</span>
            <input name="maxPrice" inputMode="numeric" defaultValue={filters.maxPrice ?? ""} placeholder="5000" className={field.input} />
          </label>
          <label className="block min-w-0">
            <span className={field.label}>Rating</span>
            <select name="minRating" defaultValue={filters.minRating ? String(filters.minRating) : ""} className={field.select}>
              <option value="">Any rating</option>
              <option value="3">3 stars and up</option>
              <option value="4">4 stars and up</option>
              <option value="4.5">4.5 stars and up</option>
            </select>
          </label>
          <label className="flex min-h-12 items-center gap-2 self-end text-[14px] font-bold">
            <input type="checkbox" name="pickupPoints" value="1" defaultChecked={!!filters.pickupPoints} className={field.checkbox} />
            Has pickup points
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
            <button type="submit" className={pillButton.ink}>Show partners</button>
            <Link href={`${path}#find`} className={`${pillButton.white} no-underline`}>Clear</Link>
          </div>
        </form>
      </Card>

      {found.rows.length === 0 ? (
        <EmptyState icon="truck" title="No partners match yet">
          Try fewer filters, or check where you sell and where your parcels leave from.
        </EmptyState>
      ) : (
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
                      <div className="text-[12.5px] text-app-ink-soft">from</div>
                      <div className="text-[16px] font-extrabold">{naira(row.startingPrice)}</div>
                    </div>
                  )}
                </div>
                <div className="grid gap-1 text-[13.5px]">
                  <div><span className="text-app-ink-soft">Delivers to: </span>{areasSummary(partner.deliveryAreas)}</div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {row.timeframe && <span><span className="text-app-ink-soft">Timeframe: </span>{row.timeframe}</span>}
                    {row.pickupPointCount > 0 && <span>{row.pickupPointCount} pickup point{row.pickupPointCount === 1 ? "" : "s"}</span>}
                    {row.stats.completed > 0 && <span>{row.stats.completed.toLocaleString("en-NG")} deliveries on Shopinbos</span>}
                    {row.stats.onTimeRate !== null && <span>{row.stats.onTimeRate}% on time</span>}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {partner.services.map((service) => <Pill key={service} tone="muted">{serviceWord(service)}</Pill>)}
                    {partner.offersPayOnDelivery && <Pill tone="muted">Pay on delivery</Pill>}
                  </div>
                </div>
                <div className="mt-auto flex flex-wrap gap-2">
                  <PillLink href={`${detailBase}/${partner.slug}`} size="sm">View</PillLink>
                  {row.connectionId ? (
                    <Pill tone="success">Connected</Pill>
                  ) : (
                    <form action={connectPartnerAction}>
                      <input type="hidden" name="partnerId" value={partner.id} />
                      <input type="hidden" name="back" value={`${back}#my-partners`} />
                      <button type="submit" className={pillButton.ink}>Connect</button>
                    </form>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
