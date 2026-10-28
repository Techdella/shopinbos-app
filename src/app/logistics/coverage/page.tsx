import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { updateLogisticsCoverage } from "@/app/actions/logistics";
import { savePartnerMarketCoverage } from "@/app/actions/delivery-market-partner";
import { Notice } from "@/components/app-ui";
import { NG_REGIONS, PARTNER_SERVICES } from "@shared/delivery-market";
import { podDisclaimerPartner, serviceLabel } from "@/components/delivery-market/words";
import { Card, CardHead, EmptyState, ListCard, ListRow, Pill, PillLink } from "@/components/app-kit";
import { logisticsPlanLimits } from "@/lib/plan-limits";
import { db } from "@/lib/db/client";
import { ActionNotice, PartnerPage, SubmitButton, inputClass, labelClass, naira, textareaClass } from "@/components/logistics/kit";
import { coverageDepot, coverageZoneRows } from "@/components/logistics/coverage";
import { AreaTokenAdder } from "@/components/logistics/AreaTokenAdder";
import { getT } from "@/lib/i18n/server";
import { PageTip } from "@/components/learn/PageTip";
import { partnerLevelView } from "@/lib/logistics/partner-levels.server";
import { InterstateNote, PodLocked } from "@/components/logistics/PartnerLevel";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("logistics"))("coverage.title") };
}

export default async function LogisticsCoveragePage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; unknown?: string }> }) {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const coverageLimit = logisticsPlanLimits((await db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } })) ?? {}).coverageStates;
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const { saved, error, unknown } = await searchParams;
  const t = await getT("logistics", "delivery", "common");
  const tipT = await getT("tips");

  const zones = coverageZoneRows(partner);
  const depot = coverageDepot(partner) ?? partner.city ?? "";
  // Pay on delivery opens at Cash trusted (shared/dropship-rules.ts): below it the switch shows locked with the goals.
  const level = await partnerLevelView(partner.id);

  return (
    <PartnerPage
      frame={{ user, partner }}
      title={t("coverage.title")}
      sub={t("coverage.sub")}
      actions={<PillLink href="/logistics/pricing" icon="coin">{t("coverage.pricingModel")}</PillLink>}
    >
      <PageTip who="rex" className="mb-5">{tipT("logistics.coverage")}</PageTip>
      <ActionNotice saved={saved} error={error} savedText={saved === "market" ? t("market.cov.saved") : t("coverage.saved")} />
      {unknown && (
        <div className="mb-4">
          <Notice tone="info">{t("market.cov.unknown", { places: unknown })}</Notice>
        </div>
      )}

      <Card className="mb-5 p-5">
        <div id="where-you-work" className="scroll-mt-24" />
        <CardHead
          title={t("market.cov.title")}
          sub={t("market.cov.sub")}
          action={<PillLink href="/logistics/rates" size="sm" icon="coin">{t("market.rates.title")}</PillLink>}
        />
        <form action={savePartnerMarketCoverage} className="mt-4 grid gap-4 lg:grid-cols-2">
          <fieldset className="m-0 min-w-0 border-0 p-0 lg:col-span-2">
            <legend className={labelClass}>{t("market.cov.services")}</legend>
            <div className="flex flex-wrap gap-2">
              {PARTNER_SERVICES.map((service) => (
                <label key={service} className="flex min-h-[44px] items-center gap-2 rounded-full border border-app-line bg-white px-4 text-[15px] font-bold">
                  <input type="checkbox" name="services" value={service} defaultChecked={partner.services.includes(service)} className="h-5 w-5 accent-[#16141F]" />
                  {serviceLabel(t, service)}
                </label>
              ))}
            </div>
            <p className="mb-0 mt-1.5 text-[15px] text-app-ink-soft">{t("market.cov.servicesHint")}</p>
            {/* Interstate jobs come from Trusted (Tier 2, shared/partner-reach.ts); below it the switch stays on. */}
            {level?.interstateGated ? <div className="mt-2"><InterstateNote t={t} /></div> : null}
          </fieldset>
          <div className="min-w-0">
            <label htmlFor="pickupAreas" className={labelClass}>{t("market.cov.collectFrom")}</label>
            <textarea id="pickupAreas" name="pickupAreas" rows={4} defaultValue={partner.pickupAreas.join("\n")} placeholder={"Lagos\nOgun: Ota"} className={textareaClass} />
          </div>
          <div className="min-w-0">
            <label htmlFor="deliveryAreas" className={labelClass}>{t("market.cov.deliverTo")}</label>
            <textarea id="deliveryAreas" name="deliveryAreas" rows={4} defaultValue={partner.deliveryAreas.join("\n")} placeholder={"Lagos\nSouth-West\nFCT"} className={textareaClass} />
          </div>
          <p className="m-0 text-[15px] text-app-ink-soft lg:col-span-2">
            {t("market.cov.onePerLine", { regions: Object.keys(NG_REGIONS).join(", ") })}
          </p>
          <AreaTokenAdder
            selectClass={inputClass}
            targets={[{ id: "pickupAreas", label: t("market.cov.addCollect") }, { id: "deliveryAreas", label: t("market.cov.addDeliver") }]}
          />
          <div className="grid gap-1.5 lg:col-span-2">
            {level && !level.podOpen ? (
              <PodLocked view={level} />
            ) : (
              <>
                <label className="flex min-h-[44px] items-center gap-2 text-[15px] font-bold">
                  <input type="checkbox" name="offersPayOnDelivery" defaultChecked={partner.offersPayOnDelivery} className="h-5 w-5 accent-[#16141F]" />
                  {t("market.cov.podLabel")}
                </label>
                <p className="m-0 text-[14px] text-app-ink-soft">{podDisclaimerPartner(t)} {t("market.cov.podChoose")}</p>
              </>
            )}
          </div>
          <div className="lg:col-span-2">
            <SubmitButton>{t("market.cov.save")}</SubmitButton>
          </div>
        </form>
      </Card>

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
          <CardHead title={t("coverage.edit")} sub={coverageLimit === null ? t("coverage.noLimit") : t("coverage.stateLimit", { limit: coverageLimit })} />
          <form action={updateLogisticsCoverage} className="mt-4 grid gap-3">
            <div>
              <label htmlFor="coverageZones" className={labelClass}>{t("coverage.areas")}</label>
              <textarea id="coverageZones" name="coverageZones" rows={4} defaultValue={partner.coverageZones.join("\n")} placeholder={"Yaba\nIkeja\nLekki"} className={textareaClass} />
              <p className="mb-0 mt-1 text-[15px] text-app-ink-soft">{t("coverage.oneArea")}</p>
            </div>
            <div>
              <label htmlFor="vehicleTypes" className={labelClass}>{t("coverage.vehicles")}</label>
              <input id="vehicleTypes" name="vehicleTypes" defaultValue={partner.vehicleTypes.join(", ")} placeholder={t("coverage.vehiclesPlaceholder")} className={inputClass} />
            </div>
            <details className="group">
              <summary className="cursor-pointer list-none text-[15px] font-bold text-app-ink-soft [&::-webkit-details-marker]:hidden">
                {t("jobs.moreOptions")} <span aria-hidden className="inline-block transition group-open:rotate-90">›</span>
              </summary>
              <div className="mt-3 grid gap-3">
                <div>
                  <label htmlFor="coverageRows" className={labelClass}>{t("coverage.ratesPerArea")}</label>
                  <textarea
                    id="coverageRows"
                    name="coverageRows"
                    rows={4}
                    defaultValue={zones.map((zone) => [zone.name, zone.service, zone.basePrice, zone.demandSignal].filter((part) => part !== undefined && part !== "").join("|")).join("\n")}
                    placeholder="Yaba|Same-day|2500"
                    className={textareaClass}
                  />
                  <p className="mb-0 mt-1 text-[15px] text-app-ink-soft">{t("coverage.ratesHint")}</p>
                </div>
                <div>
                  <label htmlFor="deliveryTypes" className={labelClass}>{t("coverage.deliveryTypes")}</label>
                  <input id="deliveryTypes" name="deliveryTypes" defaultValue={partner.deliveryTypes.join(", ")} placeholder={t("coverage.deliveryTypesPlaceholder")} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="depot" className={labelClass}>{t("coverage.depotLabel")}</label>
                  <input id="depot" name="depot" defaultValue={depot} className={inputClass} />
                </div>
              </div>
            </details>
            <SubmitButton>{t("coverage.save")}</SubmitButton>
          </form>
        </Card>
      </div>
    </PartnerPage>
  );
}
