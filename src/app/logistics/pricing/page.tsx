import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { updateLogisticsPricing } from "@/app/actions/logistics";
import { Card, CardHead, ListCard, ListRow, PillLink, TextLink } from "@/components/app-kit";
import { ActionNotice, KeyValue, PartnerPage, SubmitButton, inputClass, labelClass, naira } from "@/components/logistics/kit";
import { coverageZoneRows } from "@/components/logistics/coverage";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("logistics"))("pricing.title") };
}

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
  const t = await getT("logistics", "common");
  const modelLabel = (value: string) => {
    const found = MODELS.find((item) => item.value === value);
    return found ? t.dynamic(`pricing.model.${found.value}`, found.label) : value;
  };
  const model = modelLabel(partner.pricingModel);

  return (
    <PartnerPage
      frame={{ user, partner }}
      title={t("pricing.title")}
      sub={t("pricing.sub")}
      actions={<PillLink href="/logistics/coverage" icon="pin">{t("coverage.ratesPerArea")}</PillLink>}
    >
      <ActionNotice saved={saved} error={error} savedText={t("pricing.saved")} />

      <div className="grid gap-5 xl:[grid-template-columns:minmax(0,1fr)_420px]">
        <div className="grid min-w-0 content-start gap-5">
          <Card className="p-5">
            <CardHead title={t("pricing.whatSellersSee")} />
            <div className="mt-2 divide-y divide-app-line">
              <KeyValue label={t("pricing.howCharge")}>{model}</KeyValue>
              <KeyValue label={t("pricing.startingPrice")}>{partner.basePrice > 0 ? naira(partner.basePrice) : t("coverage.onRequest")}</KeyValue>
              <KeyValue label={t("pricing.speed")}>{partner.estimatedSpeed || t("coverage.notSet")}</KeyValue>
            </div>
          </Card>

          <section aria-labelledby="area-rates">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 id="area-rates" className="m-0 text-[18px] font-extrabold">{t("coverage.ratesPerArea")}</h2>
              <TextLink href="/logistics/coverage">{t("pricing.editAreas")}</TextLink>
            </div>
            {zones.length === 0 ? (
              <Card className="px-5 py-8 text-center text-[15px] text-app-ink-soft">{t("pricing.noAreas")}</Card>
            ) : (
              <ListCard>
                {zones.map((zone) => (
                  <ListRow key={zone.name}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-extrabold">{zone.name}</div>
                      <div className="truncate text-[15px] text-app-ink-soft">{zone.service}</div>
                    </div>
                    <span className="text-[15px] font-extrabold">{zone.basePrice > 0 ? naira(zone.basePrice) : "—"}</span>
                  </ListRow>
                ))}
              </ListCard>
            )}
          </section>
        </div>

        <Card className="h-fit p-5">
          <CardHead title={t("pricing.edit")} />
          <form action={updateLogisticsPricing} className="mt-4 grid gap-3">
            <div>
              <label htmlFor="pricingModel" className={labelClass}>{t("pricing.howCharge")}</label>
              <select id="pricingModel" name="pricingModel" defaultValue={partner.pricingModel} className={inputClass}>
                {MODELS.map((item) => <option key={item.value} value={item.value}>{modelLabel(item.value)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="basePrice" className={labelClass}>{t("pricing.startingPriceNaira")}</label>
              <input id="basePrice" name="basePrice" type="number" min="0" step="1" inputMode="numeric" defaultValue={String(partner.basePrice)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="estimatedSpeed" className={labelClass}>{t("pricing.speed")}</label>
              <input id="estimatedSpeed" name="estimatedSpeed" maxLength={80} defaultValue={partner.estimatedSpeed ?? ""} placeholder={t("pricing.speedPlaceholder")} className={inputClass} />
            </div>
            <SubmitButton>{t("pricing.save")}</SubmitButton>
          </form>
        </Card>
      </div>
    </PartnerPage>
  );
}
