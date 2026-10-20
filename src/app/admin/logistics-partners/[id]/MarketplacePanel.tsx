import type { ReactNode } from "react";
import { Card, CardHead, Pill, StatTile } from "@/components/app-kit";
import { formatDate, formatMoney } from "@/components/admin/AdminKit";
import { MIN_JOBS_FOR_RATES, SERVICE_LABELS, SIZE_BAND_LABELS, cardTimeframe, startingPrice, timeframeWords, type PartnerService, type PartnerStats, type RateRow } from "@shared/delivery-market";

// The logistics marketplace side of a partner, for the team: business details, services and coverage, the public
// rate card, pickup points, the businesses that added them, and their in-app delivery stats.

const RATE_SERVICE_WORDS: Record<string, string> = { doorstep: "Doorstep", pickup_point: "Pickup point", same_day: "Same day" };

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12.5px] font-bold text-app-ink-soft">{label}</dt>
      <dd className="m-0 mt-0.5 break-words text-[14px]">{children || <span className="text-app-ink-faint">Not given</span>}</dd>
    </div>
  );
}

function Areas({ areas }: { areas: readonly string[] }) {
  if (!areas.length) return <span className="text-app-ink-faint">None yet</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {areas.map((area) => (
        <Pill key={area}>{area}</Pill>
      ))}
    </span>
  );
}

const percent = (value: number | null) => (value === null ? "Too few jobs" : `${value}%`);

export function MarketplacePanel({
  partner,
  rateCard,
  retiredCount,
  pickupPoints,
  connections,
  privateCards,
  stats,
}: {
  partner: {
    companyName: string;
    address: string | null;
    cacNumber: string | null;
    contactName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    services: string[];
    pickupAreas: string[];
    deliveryAreas: string[];
    offersPayOnDelivery: boolean;
  };
  rateCard: { rows: RateRow[]; failedAttemptFee: number; returnFee: number; notes: string | null; createdAt: Date } | null;
  retiredCount: number;
  pickupPoints: Array<{ id: string; name: string; address: string; state: string; area: string | null; hours: string | null; phone: string | null }>;
  connections: Array<{ id: string; businessName: string; role: string; since: Date; services: string[]; pod: boolean; privateCards: number }>;
  privateCards: { proposed: number; accepted: number };
  stats: PartnerStats;
}) {
  const from = rateCard ? startingPrice(rateCard.rows) : null;
  const timeframe = rateCard ? cardTimeframe(rateCard.rows) : null;
  return (
    <section id="marketplace" aria-labelledby="marketplace-title" className="mt-6 scroll-mt-6">
      <h2 id="marketplace-title" className="m-0 text-[20px] font-extrabold">Logistics marketplace</h2>
      <p className="mb-3 mt-1 max-w-[760px] text-[14.5px] text-app-ink-soft">
        What sellers and suppliers see when they find and add this partner, and how their in-app jobs have gone. Stats count marketplace and booked jobs from the last 12 months; rates show after {MIN_JOBS_FOR_RATES} finished jobs.
      </p>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        <StatTile tone="card" label="Completed in app" value={stats.completed} />
        <StatTile tone="card" label="On time" value={<span className={stats.onTimeRate === null ? "text-[18px]" : undefined}>{percent(stats.onTimeRate)}</span>} />
        <StatTile tone="card" label="Failed" value={<span className={stats.failedRate === null ? "text-[18px]" : undefined}>{percent(stats.failedRate)}</span>} />
        <StatTile tone="card" label="Connected businesses" value={connections.length} />
        <StatTile tone="card" label="Private rate cards" value={privateCards.accepted + privateCards.proposed} hint={`${privateCards.accepted} accepted · ${privateCards.proposed} waiting`} />
        <StatTile tone="card" label="Pickup points" value={pickupPoints.length} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="p-4 sm:p-5">
          <CardHead title="Business details" sub="From the partner's Business details page." />
          <dl className="m-0 mt-3 grid gap-3 sm:grid-cols-2">
            <Detail label="Company name">{partner.companyName}</Detail>
            <Detail label="CAC number">{partner.cacNumber}</Detail>
            <Detail label="Contact person">{partner.contactName}</Detail>
            <Detail label="Contact phone">{partner.contactPhone}</Detail>
            <Detail label="Contact email">{partner.contactEmail}</Detail>
            <Detail label="Office address">{partner.address}</Detail>
          </dl>
        </Card>

        <Card className="p-4 sm:p-5">
          <CardHead title="Services and coverage" />
          <dl className="m-0 mt-3 grid gap-3">
            <Detail label="Services">
              {partner.services.length ? (
                <span className="flex flex-wrap gap-1.5">
                  {partner.services.map((service) => (
                    <Pill key={service} tone="info">{SERVICE_LABELS[service as PartnerService] ?? service}</Pill>
                  ))}
                </span>
              ) : null}
            </Detail>
            <Detail label="Picks up from"><Areas areas={partner.pickupAreas} /></Detail>
            <Detail label="Delivers to"><Areas areas={partner.deliveryAreas} /></Detail>
            <Detail label="Pay on delivery">{partner.offersPayOnDelivery ? "Offered (for shops that also switch it on)" : "Not offered"}</Detail>
          </dl>
        </Card>
      </div>

      <Card className="mt-5 p-4 sm:p-5">
        <CardHead
          title="Public rate card"
          sub={
            rateCard
              ? `Published ${formatDate(rateCard.createdAt)} · from ${formatMoney(from ?? 0)}${timeframe ? ` · ${timeframe}` : ""} · ${retiredCount} earlier version${retiredCount === 1 ? "" : "s"} retired`
              : `No public rates yet, so this partner doesn't show at checkout or in Find partners.${retiredCount ? ` ${retiredCount} retired version${retiredCount === 1 ? "" : "s"}.` : ""}`
          }
        />
        {rateCard && (
          <>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-[13.5px]">
                <thead>
                  <tr className="border-b border-app-line text-[12px] text-app-ink-soft">
                    <th scope="col" className="py-2 pr-3 font-bold">From</th>
                    <th scope="col" className="py-2 pr-3 font-bold">To</th>
                    <th scope="col" className="py-2 pr-3 font-bold">Service</th>
                    <th scope="col" className="py-2 pr-3 font-bold">Size</th>
                    <th scope="col" className="py-2 pr-3 text-right font-bold">Price</th>
                    <th scope="col" className="py-2 font-bold">Timeframe</th>
                  </tr>
                </thead>
                <tbody>
                  {rateCard.rows.map((row) => (
                    <tr key={row.id} className="border-b border-app-line last:border-b-0">
                      <td className="py-2 pr-3">{row.from}</td>
                      <td className="py-2 pr-3">{row.to}</td>
                      <td className="py-2 pr-3">{RATE_SERVICE_WORDS[row.service] ?? row.service}</td>
                      <td className="py-2 pr-3">{SIZE_BAND_LABELS[row.sizeBand]}</td>
                      <td className="py-2 pr-3 text-right font-bold">{formatMoney(row.price)}</td>
                      <td className="py-2">{timeframeWords(row.minDays, row.maxDays)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="m-0 mt-3 grid gap-3 sm:grid-cols-3">
              <Detail label="Failed attempt fee">{formatMoney(rateCard.failedAttemptFee)}</Detail>
              <Detail label="Return fee">{formatMoney(rateCard.returnFee)}</Detail>
              <Detail label="Notes">{rateCard.notes}</Detail>
            </dl>
          </>
        )}
      </Card>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card className="p-4 sm:p-5">
          <CardHead title="Pickup points" sub={pickupPoints.length ? `${pickupPoints.length} active` : "None"} />
          {pickupPoints.length > 0 && (
            <ul className="m-0 mt-3 grid list-none gap-2.5 p-0">
              {pickupPoints.map((point) => (
                <li key={point.id} className="rounded-[14px] bg-app-canvas px-3 py-2.5 text-[13.5px]">
                  <div className="font-extrabold">{point.name}</div>
                  <div className="text-app-ink-soft">{[point.address, point.area, point.state].filter(Boolean).join(", ")}</div>
                  {(point.hours || point.phone) && <div className="text-app-ink-soft">{[point.hours, point.phone].filter(Boolean).join(" · ")}</div>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4 sm:p-5">
          <CardHead title="Connected businesses" sub={connections.length ? `${connections.length} business${connections.length === 1 ? "" : "es"} added this partner` : "No business has added this partner yet"} />
          {connections.length > 0 && (
            <ul className="m-0 mt-3 grid list-none gap-2 p-0">
              {connections.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] bg-app-canvas px-3 py-2.5 text-[13.5px]">
                  <span className="min-w-0">
                    <span className="block truncate font-extrabold">{row.businessName}</span>
                    <span className="block text-app-ink-soft">
                      {row.role === "supplier" ? "Supplier" : "Seller"} · since {formatDate(row.since)} · {row.services.map((service) => RATE_SERVICE_WORDS[service] ?? service).join(", ")}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {row.pod && <Pill tone="warning">Pay on delivery</Pill>}
                    {row.privateCards > 0 && <Pill tone="info">Private rates</Pill>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </section>
  );
}
