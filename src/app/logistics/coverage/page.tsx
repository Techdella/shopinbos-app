import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { updateLogisticsCoverage } from "@/app/actions/logistics";
import { Card, CardHead, EmptyState, ListCard, ListRow, Pill, PillLink } from "@/components/app-kit";
import { LOGISTICS_FREE_ROUTE_LIMIT } from "@/lib/plan-limits";
import { ActionNotice, PartnerPage, SubmitButton, inputClass, labelClass, naira, textareaClass } from "@/components/logistics/kit";
import { coverageDepot, coverageZoneRows } from "@/components/logistics/coverage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Coverage and rates" };

export default async function LogisticsCoveragePage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const { saved, error } = await searchParams;

  const zones = coverageZoneRows(partner);
  const depot = coverageDepot(partner) ?? partner.city ?? "";

  return (
    <PartnerPage
      frame={{ user, partner }}
      title="Coverage and rates"
      sub="Where you deliver, what you deliver with, and your starting price for each area. Sellers see this when they look for a delivery partner."
      actions={<PillLink href="/logistics/pricing" icon="coin">Pricing model</PillLink>}
    >
      <ActionNotice saved={saved} error={error} savedText="Coverage saved. Sellers in these areas can find you now." />

      <div className="grid gap-5 xl:[grid-template-columns:minmax(0,1fr)_440px]">
        <div className="grid min-w-0 content-start gap-5">
          {zones.length === 0 ? (
            <EmptyState icon="pin" title="No areas yet">Add the areas you deliver to so sellers there can find you.</EmptyState>
          ) : (
            <ListCard>
              {zones.map((zone) => (
                <ListRow key={zone.name}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-app-success" aria-hidden />
                  <div className="min-w-0 flex-1 basis-[160px]">
                    <div className="truncate text-[15px] font-extrabold">{zone.name}</div>
                    <div className="truncate text-[15px] text-app-ink-soft">{zone.service}{zone.demandSignal ? ` · ${zone.demandSignal}` : ""}</div>
                  </div>
                  <span className="ml-auto text-[15px] font-extrabold">{zone.basePrice > 0 ? `From ${naira(zone.basePrice)}` : "Price on request"}</span>
                </ListRow>
              ))}
            </ListCard>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="p-5">
              <h2 className="m-0 text-[15px] font-extrabold">Depot</h2>
              <p className="m-0 mt-1 text-[15px] text-app-ink-soft">{depot || "Not set"}</p>
            </Card>
            <Card className="p-5">
              <h2 className="m-0 text-[15px] font-extrabold">Vehicles</h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {partner.vehicleTypes.length ? partner.vehicleTypes.map((type) => <Pill key={type}>{type}</Pill>) : <span className="text-[15px] text-app-ink-soft">None yet</span>}
              </div>
            </Card>
            <Card className="p-5">
              <h2 className="m-0 text-[15px] font-extrabold">Delivery types</h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {partner.deliveryTypes.length ? partner.deliveryTypes.map((type) => <Pill key={type}>{type.replace(/_/g, " ")}</Pill>) : <span className="text-[15px] text-app-ink-soft">None yet</span>}
              </div>
            </Card>
          </div>
        </div>

        <Card className="h-fit p-5">
          <CardHead title="Edit coverage" sub={`Starter covers up to ${LOGISTICS_FREE_ROUTE_LIMIT} areas.`} />
          <form action={updateLogisticsCoverage} className="mt-4 grid gap-3">
            <div>
              <label htmlFor="coverageZones" className={labelClass}>Areas you deliver to</label>
              <textarea id="coverageZones" name="coverageZones" rows={4} defaultValue={partner.coverageZones.join("\n")} placeholder={"Yaba\nIkeja\nLekki"} className={textareaClass} />
              <p className="mb-0 mt-1 text-[15px] text-app-ink-soft">One area per line.</p>
            </div>
            <div>
              <label htmlFor="vehicleTypes" className={labelClass}>Vehicles</label>
              <input id="vehicleTypes" name="vehicleTypes" defaultValue={partner.vehicleTypes.join(", ")} placeholder="Bike, Van" className={inputClass} />
            </div>
            <details className="group">
              <summary className="cursor-pointer list-none text-[15px] font-bold text-app-ink-soft [&::-webkit-details-marker]:hidden">
                More options (optional) <span aria-hidden className="inline-block transition group-open:rotate-90">›</span>
              </summary>
              <div className="mt-3 grid gap-3">
                <div>
                  <label htmlFor="coverageRows" className={labelClass}>Rates per area</label>
                  <textarea
                    id="coverageRows"
                    name="coverageRows"
                    rows={4}
                    defaultValue={zones.map((zone) => [zone.name, zone.service, zone.basePrice, zone.demandSignal].filter((part) => part !== undefined && part !== "").join("|")).join("\n")}
                    placeholder="Yaba|Same-day|2500"
                    className={textareaClass}
                  />
                  <p className="mb-0 mt-1 text-[15px] text-app-ink-soft">One per line: area | service | starting price, like Yaba|Same-day|2500. Leave empty to use your base price everywhere.</p>
                </div>
                <div>
                  <label htmlFor="deliveryTypes" className={labelClass}>Delivery types</label>
                  <input id="deliveryTypes" name="deliveryTypes" defaultValue={partner.deliveryTypes.join(", ")} placeholder="Same-day, Next-day" className={inputClass} />
                </div>
                <div>
                  <label htmlFor="depot" className={labelClass}>Depot (where your riders start from)</label>
                  <input id="depot" name="depot" defaultValue={depot} className={inputClass} />
                </div>
              </div>
            </details>
            <SubmitButton>Save coverage</SubmitButton>
          </form>
        </Card>
      </div>
    </PartnerPage>
  );
}
