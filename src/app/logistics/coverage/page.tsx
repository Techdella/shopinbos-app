import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { updateLogisticsCoverage } from "@/app/actions/logistics";
import { Card, CardHead, EmptyState, ListCard, ListRow, Pill, PillLink } from "@/components/app-kit";
import { LOGISTICS_FREE_ROUTE_LIMIT } from "@/lib/plan-limits";
import { ActionNotice, PartnerPage, SubmitButton, inputClass, labelClass, naira } from "@/components/logistics/kit";
import { coverageDepot, coverageZoneRows, editorZones } from "@/components/logistics/coverage";
import { CoverageEditor } from "./CoverageEditor";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("logistics"))("coverage.title") };
}

export default async function LogisticsCoveragePage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const { saved, error } = await searchParams;
  const t = await getT("logistics", "common");

  const zones = coverageZoneRows(partner);
  const depot = coverageDepot(partner) ?? partner.city ?? "";

  return (
    <PartnerPage
      frame={{ user, partner }}
      title={t("coverage.title")}
      sub={t("coverage.sub")}
      actions={<PillLink href="/logistics/pricing" icon="coin">{t("coverage.pricingModel")}</PillLink>}
    >
      <ActionNotice saved={saved} error={error} savedText={t("coverage.saved")} />

      <div className="grid gap-5 xl:[grid-template-columns:minmax(0,1fr)_440px]">
        <div className="grid min-w-0 content-start gap-5">
          {zones.length === 0 ? (
            <EmptyState icon="pin" title={t("coverage.emptyTitle")}>{t("coverage.emptyBody")}</EmptyState>
          ) : (
            <ListCard>
              {zones.map((zone) => (
                <ListRow key={zone.name}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-app-success" aria-hidden />
                  <div className="min-w-0 flex-1 basis-[160px]">
                    <div className="truncate text-[15px] font-extrabold">{zone.name}</div>
                    <div className="truncate text-[15px] text-app-ink-soft">{zone.service}{zone.demandSignal ? ` · ${zone.demandSignal}` : ""}</div>
                  </div>
                  <span className="ml-auto text-[15px] font-extrabold">{zone.basePrice > 0 ? t("coverage.from", { amount: naira(zone.basePrice) }) : t("coverage.onRequest")}</span>
                </ListRow>
              ))}
            </ListCard>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="p-5">
              <h2 className="m-0 text-[15px] font-extrabold">{t("coverage.depot")}</h2>
              <p className="m-0 mt-1 text-[15px] text-app-ink-soft">{depot || t("coverage.notSet")}</p>
            </Card>
            <Card className="p-5">
              <h2 className="m-0 text-[15px] font-extrabold">{t("coverage.vehicles")}</h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {partner.vehicleTypes.length ? partner.vehicleTypes.map((type) => <Pill key={type}>{type}</Pill>) : <span className="text-[15px] text-app-ink-soft">{t("coverage.noneYet")}</span>}
              </div>
            </Card>
            <Card className="p-5">
              <h2 className="m-0 text-[15px] font-extrabold">{t("coverage.deliveryTypes")}</h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {partner.deliveryTypes.length ? partner.deliveryTypes.map((type) => <Pill key={type}>{type.replace(/_/g, " ")}</Pill>) : <span className="text-[15px] text-app-ink-soft">{t("coverage.noneYet")}</span>}
              </div>
            </Card>
          </div>
        </div>

        <Card className="h-fit p-5">
          <CardHead title={t("coverage.edit")} sub={t("coverage.starterLimit", { limit: LOGISTICS_FREE_ROUTE_LIMIT })} />
          <form action={updateLogisticsCoverage} className="mt-4 grid gap-3">
            <CoverageEditor
              zones={editorZones(partner)}
              vehicleTypes={partner.vehicleTypes}
              deliveryTypes={partner.deliveryTypes}
              defaultCountry={partner.country || "Nigeria"}
              defaultPrice={partner.basePrice}
            />
            <div>
              <label htmlFor="depot" className={labelClass}>{t("coverage.depotLabel")}</label>
              <input id="depot" name="depot" defaultValue={depot} className={inputClass} />
            </div>
            <SubmitButton>{t("coverage.save")}</SubmitButton>
          </form>
        </Card>
      </div>
    </PartnerPage>
  );
}
