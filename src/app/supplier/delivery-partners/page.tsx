import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { AppPage, AssistantNote, Card, CardHead, Pill, PillLink } from "@/components/app-kit";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { FIELD_SELECT, SUBMIT_INK, SUBMIT_WHITE } from "@/components/seller-settings/fields";
import { db } from "@/lib/db/client";
import { getT } from "@/lib/i18n/server";
import { supplierPlanLimits } from "@/lib/plan-limits";
import { PARTNER_PLAN_FIRST } from "@/lib/plans/placement";
import { privateRatesByPartner } from "@/lib/plans/rate-cards.server";
import { partnerCovers } from "@shared/supplier-pickup";
import { connectPartnerAction, disconnectPartnerAction, preferPartnerAction } from "@/app/actions/supplier-partners";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("supplier"))("dp.title") };
}

const naira = (amount: number) => `₦${Math.round(amount).toLocaleString("en-NG")}`;

// The delivery partners this supplier works with: their pickups go to the preferred one first, then the others.
export default async function SupplierDeliveryPartnersPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);
  const { saved, error } = await searchParams;
  const t = await getT("supplier", "common");
  const [dbUser, connections, partners, rates] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } }),
    db.supplierLogisticsConnection.findMany({ where: { supplierId: supplier.id }, orderBy: [{ preferred: "desc" }, { createdAt: "asc" }] }).catch(() => []),
    db.logisticsPartner.findMany({
      where: { status: "active", verificationStatus: "verified" },
      orderBy: [PARTNER_PLAN_FIRST, { reliabilityScore: "desc" }],
      take: 300,
      select: { id: true, displayName: true, city: true, coverageZones: true, basePrice: true, status: true, verificationStatus: true },
    }),
    privateRatesByPartner(user.id),
  ]);
  const limit = supplierPlanLimits(dbUser ?? {}).logisticsPartners;
  const byId = new Map(partners.map((partner) => [partner.id, partner]));
  const connectedIds = new Set(connections.map((row) => row.logisticsPartnerId));
  const area = { city: supplier.city };
  const choices = partners
    .filter((partner) => !connectedIds.has(partner.id))
    .sort((a, b) => Number(partnerCovers({ ...b, verificationStatus: String(b.verificationStatus) }, area)) - Number(partnerCovers({ ...a, verificationStatus: String(a.verificationStatus) }, area)));
  const full = limit !== null && connections.length >= limit;
  const price = (partnerId: string, base: number) => {
    const rate = rates.get(partnerId);
    return rate ? t("dp.yourRate", { price: naira(rate.price) }) : base > 0 ? t("dp.from", { price: naira(base) }) : t("dp.onRequest");
  };

  return (
    <AppPage frame={supplierFrame(user, supplier)} title={t("dp.title")} sub={t("dp.sub", { used: connections.length, limit: limit === null ? "∞" : String(limit) })}>
      <div className="grid gap-5">
        {saved ? <p role="status" className="m-0 rounded-[16px] bg-app-mint px-4 py-3 text-[14px] font-bold">{t("dp.saved")}</p> : null}
        {error ? <p role="alert" className="m-0 rounded-[16px] bg-app-peach px-4 py-3 text-[14px] font-bold">{error}</p> : null}

        <Card className="p-5">
          <CardHead title={t("dp.yours")} sub={t("dp.yoursSub")} />
          {connections.length === 0 ? (
            <p className="mb-0 mt-3 text-[14px] text-app-ink-soft">{t("dp.none")}</p>
          ) : (
            <ul className="m-0 mt-4 grid list-none gap-2 p-0">
              {connections.map((row) => {
                const partner = byId.get(row.logisticsPartnerId);
                return (
                  <li key={row.logisticsPartnerId} className="flex flex-wrap items-center gap-3 rounded-[16px] bg-app-canvas px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[14.5px] font-extrabold">{partner?.displayName ?? t("dp.unavailable")}</span>
                        {row.preferred ? <Pill tone="ink">{t("dp.preferred")}</Pill> : null}
                      </div>
                      <div className="truncate text-[13px] text-app-ink-soft">{partner ? `${partner.city} · ${price(partner.id, partner.basePrice)}` : t("dp.unavailableSub")}</div>
                    </div>
                    {!row.preferred && partner ? (
                      <form action={preferPartnerAction}>
                        <input type="hidden" name="partnerId" value={row.logisticsPartnerId} />
                        <button type="submit" className={SUBMIT_WHITE}>{t("dp.makePreferred")}</button>
                      </form>
                    ) : null}
                    <form action={disconnectPartnerAction}>
                      <input type="hidden" name="partnerId" value={row.logisticsPartnerId} />
                      <button type="submit" className={SUBMIT_WHITE}>{t("dp.remove")}</button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {full ? (
          <AssistantNote who="rex" action={<PillLink href="/supplier/profile?tab=Billing%20%26%20Plan" tone="ink" size="sm">{t("products.seePlans")}</PillLink>}>
            {t("dp.full", { limit: limit ?? 0 })}
          </AssistantNote>
        ) : (
          <Card className="p-5">
            <CardHead title={t("dp.add")} sub={t("dp.addSub")} />
            <form action={connectPartnerAction} className="mt-4 flex flex-wrap gap-3">
              <select name="partnerId" required defaultValue="" aria-label={t("dp.choose")} className={`${FIELD_SELECT} h-[44px] min-w-0 flex-1 basis-[240px]`}>
                <option value="" disabled>{t("dp.choose")}</option>
                {choices.map((partner) => (
                  <option key={partner.id} value={partner.id}>{partner.displayName} · {partner.city} · {price(partner.id, partner.basePrice)}</option>
                ))}
              </select>
              <button type="submit" className={SUBMIT_INK}>{t("dp.connect")}</button>
            </form>
          </Card>
        )}
      </div>
    </AppPage>
  );
}
