import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { addPickupPoint, removePickupPoint } from "@/app/actions/logistics-plan";
import { Card, CardHead, PillLink } from "@/components/app-kit";
import { ActionNotice, PartnerPage, SubmitButton, inputClass, labelClass } from "@/components/logistics/kit";
import { db } from "@/lib/db/client";
import { logisticsLimits, planKeyFor } from "@shared/plans";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("logistics"))("pickup.title") };
}

// Where sellers and their customers can drop off or collect parcels; shown on the partner's public page.
export default async function PickupPointsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const { saved, error } = await searchParams;
  const t = await getT("logistics", "common");
  const [points, dbUser] = await Promise.all([
    db.logisticsPickupPoint.findMany({ where: { logisticsPartnerId: partner.id, active: true }, orderBy: { createdAt: "asc" } }),
    db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } }),
  ]);
  const limit = logisticsLimits(planKeyFor("logistics_partner", dbUser?.aiCredits)).pickupPoints;
  const full = limit !== null && points.length >= limit;

  return (
    <PartnerPage frame={{ user, partner }} title={t("pickup.title")} sub={t("pickup.sub", { used: points.length, limit: limit === null ? "∞" : String(limit) })}>
      <ActionNotice saved={saved} error={error} savedText={t("pickup.saved")} />
      <div className="grid gap-5 xl:[grid-template-columns:minmax(0,1fr)_420px]">
        <div className="grid min-w-0 content-start gap-3">
          {points.length === 0 ? (
            <Card className="px-5 py-8 text-center text-[15px] text-app-ink-soft">{t("pickup.none")}</Card>
          ) : (
            points.map((point) => (
              <Card key={point.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-extrabold">{point.name}</div>
                  <div className="text-[13.5px] text-app-ink-soft">{point.address}, {point.city}, {point.state}</div>
                  {point.hours || point.phone ? <div className="text-[13px] text-app-ink-soft">{[point.hours, point.phone].filter(Boolean).join(" · ")}</div> : null}
                </div>
                <form action={removePickupPoint}>
                  <input type="hidden" name="id" value={point.id} />
                  <SubmitButton tone="white" size="sm">{t("pickup.remove")}</SubmitButton>
                </form>
              </Card>
            ))
          )}
        </div>
        <Card className="h-fit p-5">
          <CardHead title={t("pickup.add")} />
          {full ? (
            <div className="mt-3 grid gap-3">
              <p className="m-0 text-[14px] text-app-ink-soft">{t("pickup.full")}</p>
              <PillLink href="/logistics/billing" tone="ink" size="sm">{t("rates.seePlans")}</PillLink>
            </div>
          ) : (
            <form action={addPickupPoint} className="mt-4 grid gap-3">
              {(["name", "address", "city", "state", "phone", "hours"] as const).map((field) => (
                <div key={field}>
                  <label htmlFor={`pp-${field}`} className={labelClass}>{t(`pickup.f.${field}`)}</label>
                  <input id={`pp-${field}`} name={field} required={field !== "phone" && field !== "hours"} maxLength={field === "address" ? 200 : 80} className={inputClass} />
                </div>
              ))}
              <SubmitButton>{t("pickup.save")}</SubmitButton>
            </form>
          )}
        </Card>
      </div>
    </PartnerPage>
  );
}
