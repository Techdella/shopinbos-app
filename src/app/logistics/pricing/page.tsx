import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { updateLogisticsPricing } from "@/app/actions/logistics";
import { Card, CardHead, ListCard, ListRow, PillLink, TextLink } from "@/components/app-kit";
import { ActionNotice, KeyValue, PartnerPage, SubmitButton, inputClass, labelClass, naira } from "@/components/logistics/kit";
import { coverageZoneRows } from "@/components/logistics/coverage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pricing" };

const MODELS = [
  { value: "fixed", label: "Fixed price per delivery" },
  { value: "weight_based", label: "Based on weight" },
  { value: "distance_based", label: "Based on distance" },
];

export default async function LogisticsPricingPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const { saved, error } = await searchParams;
  const zones = coverageZoneRows(partner);
  const model = MODELS.find((item) => item.value === partner.pricingModel)?.label ?? partner.pricingModel;

  return (
    <PartnerPage
      frame={{ user, partner }}
      title="Pricing"
      sub="How you charge and your starting price. Sellers see this before they ask you for a quote."
      actions={<PillLink href="/logistics/coverage" icon="pin">Rates per area</PillLink>}
    >
      <ActionNotice saved={saved} error={error} savedText="Pricing saved." />

      <div className="grid gap-5 xl:[grid-template-columns:minmax(0,1fr)_420px]">
        <div className="grid min-w-0 content-start gap-5">
          <Card className="p-5">
            <CardHead title="What sellers see" />
            <div className="mt-2 divide-y divide-app-line">
              <KeyValue label="How you charge">{model}</KeyValue>
              <KeyValue label="Starting price">{partner.basePrice > 0 ? naira(partner.basePrice) : "Price on request"}</KeyValue>
              <KeyValue label="Delivery speed">{partner.estimatedSpeed || "Not set"}</KeyValue>
            </div>
          </Card>

          <section aria-labelledby="area-rates">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 id="area-rates" className="m-0 text-[18px] font-extrabold">Rates per area</h2>
              <TextLink href="/logistics/coverage">Edit areas</TextLink>
            </div>
            {zones.length === 0 ? (
              <Card className="px-5 py-8 text-center text-[14.5px] text-app-ink-soft">No areas yet. Add them in Coverage and rates.</Card>
            ) : (
              <ListCard>
                {zones.map((zone) => (
                  <ListRow key={zone.name}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-extrabold">{zone.name}</div>
                      <div className="truncate text-[13px] text-app-ink-soft">{zone.service}</div>
                    </div>
                    <span className="text-[15px] font-extrabold">{zone.basePrice > 0 ? naira(zone.basePrice) : "—"}</span>
                  </ListRow>
                ))}
              </ListCard>
            )}
          </section>
        </div>

        <Card className="h-fit p-5">
          <CardHead title="Edit pricing" />
          <form action={updateLogisticsPricing} className="mt-4 grid gap-3">
            <div>
              <label htmlFor="pricingModel" className={labelClass}>How you charge</label>
              <select id="pricingModel" name="pricingModel" defaultValue={partner.pricingModel} className={inputClass}>
                {MODELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="basePrice" className={labelClass}>Starting price (₦)</label>
              <input id="basePrice" name="basePrice" type="number" min="0" step="1" inputMode="numeric" defaultValue={String(partner.basePrice)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="estimatedSpeed" className={labelClass}>Delivery speed</label>
              <input id="estimatedSpeed" name="estimatedSpeed" maxLength={80} defaultValue={partner.estimatedSpeed ?? ""} placeholder="Same-day in your areas" className={inputClass} />
            </div>
            <SubmitButton>Save pricing</SubmitButton>
          </form>
        </Card>
      </div>
    </PartnerPage>
  );
}
