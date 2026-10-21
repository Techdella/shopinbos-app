import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, Card, EmptyState, Pill, PillLink } from "@/components/app-kit";
import { FIELD_SELECT, SUBMIT_INK } from "@/components/seller-settings/fields";
import { db } from "@/lib/db/client";
import { getT } from "@/lib/i18n/server";
import { sellerPlan } from "@/lib/plans/gates.server";
import { listDeliveryExceptions } from "@/lib/logistics/exceptions.server";
import { PARTNER_PLAN_FIRST } from "@/lib/plans/placement";
import { reassignDeliveryAction } from "@/app/actions/delivery-exceptions";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("shipping"))("ex.title") };
}

const TONE = { failed: "danger", late: "warning", not_accepted: "warning" } as const;

export default async function DeliveryExceptionsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await requireRole(["seller"], "/login");
  const { saved, error } = await searchParams;
  const t = await getT("shipping", "common");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace) return null;
  const { limits } = await sellerPlan(user.id);

  const page = (children: React.ReactNode) => (
    <SellerPage user={user} store={storeSummary(workspace.store)} title={t("ex.title")} sub={t("ex.sub")} actions={<PillLink href="/home/logistics" icon="truck">{t("ex.back")}</PillLink>}>
      <div className="grid gap-4">{children}</div>
    </SellerPage>
  );

  if (!limits.exceptionsInbox) {
    return page(
      <AssistantNote who="peggy" action={<PillLink href="/home/settings?tab=Billing" tone="ink" size="sm">{t("ex.seePlans")}</PillLink>}>
        {t("ex.locked")}
      </AssistantNote>,
    );
  }

  const [exceptions, partners] = await Promise.all([
    listDeliveryExceptions(user.id),
    db.logisticsPartner.findMany({ where: { status: "active", verificationStatus: "verified" }, orderBy: [PARTNER_PLAN_FIRST, { reliabilityScore: "desc" }], take: 60, select: { id: true, displayName: true } }),
  ]);

  return page(
    <>
      {saved ? <p role="status" className="m-0 rounded-[16px] bg-app-mint px-4 py-3 text-[14px] font-bold">{t("ex.moved")}</p> : null}
      {error ? <p role="alert" className="m-0 rounded-[16px] bg-app-peach px-4 py-3 text-[14px] font-bold">{error}</p> : null}
      {exceptions.length === 0 ? (
        <EmptyState icon="check" title={t("ex.noneTitle")}>{t("ex.none")}</EmptyState>
      ) : (
        exceptions.map(({ booking, reason, reassignable }) => (
          <Card key={booking.id} className="grid gap-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={TONE[reason]}>{t(`ex.reason.${reason}`)}</Pill>
              <span className="min-w-0 truncate text-[15px] font-extrabold">{booking.destination}</span>
            </div>
            <div className="text-[13.5px] text-app-ink-soft">
              {booking.logisticsPartner.displayName}
              {booking.failedReason ? ` · ${booking.failedReason}` : ""}
              {booking.trackingCode ? ` · ${booking.trackingCode}` : ""}
            </div>
            {reassignable ? (
              <form action={reassignDeliveryAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="bookingId" value={booking.id} />
                <select name="partnerId" aria-label={t("ex.choose")} required defaultValue="" className={`${FIELD_SELECT} h-[44px] min-w-0 flex-1 basis-[200px]`}>
                  <option value="" disabled>{t("ex.choose")}</option>
                  {partners.filter((partner) => partner.id !== booking.logisticsPartnerId).map((partner) => <option key={partner.id} value={partner.id}>{partner.displayName}</option>)}
                </select>
                <button type="submit" className={SUBMIT_INK}>{t("ex.reassign")}</button>
              </form>
            ) : booking.logisticsPartner.whatsappNumber ? (
              <a href={`https://wa.me/${booking.logisticsPartner.whatsappNumber.replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener noreferrer" className="justify-self-start text-[14px] font-bold text-app-ink underline underline-offset-2">
                {t("ex.contact")}
              </a>
            ) : (
              <p className="m-0 text-[13px] text-app-ink-soft">{t("ex.onTheWay")}</p>
            )}
          </Card>
        ))
      )}
    </>,
  );
}
