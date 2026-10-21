import Link from "next/link";
import { Card, CardHead, Pill } from "@/components/app-kit";
import { pillButton } from "@/components/seller-core";
import { db } from "@/lib/db/client";
import { deliveryTimeline, jobException, partnerShipments, type DeliveryPlan } from "@shared/delivery-market";
import { confirmCashAction, markJobReadyAction } from "@/app/actions/delivery-market";
import { naira } from "@/components/delivery-market/bits";
import { declineReasonText, exceptionLabel, savedText, serviceLabel, timeframeLabel, timelineLabel, type DeliveryWords } from "@/components/delivery-market/words";
import { getT } from "@/lib/i18n/server";
import { intlLocale } from "@shared/i18n";

// The order's delivery through the logistics marketplace (RetailOrder.logisticsDetails.delivery): a timeline per
// parcel, the partner, service and fee, "Mark ready for pickup", exceptions, and pay-on-delivery cash.

const when = (iso: string | null, t: DeliveryWords) => (iso ? new Date(iso).toLocaleString(intlLocale(t.locale), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : null);

function Timeline({ steps, t }: { steps: ReturnType<typeof deliveryTimeline>; t: DeliveryWords }) {
  return (
    <ol className="m-0 grid list-none gap-2 p-0">
      {steps.map((step) => (
        <li key={step.key} className="flex items-center gap-2.5 text-[14px]">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${step.done ? "bg-app-success" : "border border-app-line-strong bg-white"}`} />
          <span className={step.done ? "font-bold" : "text-app-ink-soft"}>{timelineLabel(t, step)}</span>
          {step.at && <span className="text-[12.5px] text-app-ink-soft">{when(step.at, t)}</span>}
        </li>
      ))}
    </ol>
  );
}

export async function DeliveryPlanCard({
  order,
  plan,
  sellerId,
  flash,
}: {
  order: { id: string; createdAt: Date; deliveredAt: Date | null };
  plan: DeliveryPlan;
  sellerId: string;
  flash?: { saved?: string; error?: string };
}) {
  const t = await getT("delivery");
  const parts = partnerShipments(plan);
  const back = `/home/orders/${order.id}`;

  const [jobs, partners] = await Promise.all([
    db.deliveryBooking.findMany({
      where: { id: { in: parts.flatMap((part) => (part.bookingId ? [part.bookingId] : [])) } },
      include: { logisticsPartner: { select: { displayName: true } } },
    }),
    db.logisticsPartner.findMany({ where: { id: { in: parts.flatMap((part) => (part.partnerId ? [part.partnerId] : [])) } }, select: { id: true, displayName: true } }),
  ]);

  const flashBox = flash?.saved || flash?.error ? (
    <p role={flash.error ? "alert" : "status"} className={`m-0 mt-3 rounded-[14px] px-3.5 py-2.5 text-[13.5px] font-bold ${flash.error ? "bg-app-danger-tint text-app-danger" : "bg-app-success-tint text-app-success"}`}>{flash.error ?? savedText(t, flash.saved ?? "")}</p>
  ) : null;

  if (!parts.length) {
    // Pick up from the seller, or the seller's own flat-fee delivery: no partner job.
    const self = plan.kind === "self_pickup";
    return (
      <Card className="p-5">
        <CardHead title={self ? t("plan.selfTitle") : t("plan.ownTitle")} sub={self ? t("plan.selfSub") : t("plan.ownSub")} />
        {flashBox}
        <div className="mt-4"><Timeline steps={deliveryTimeline(order, null, plan.kind)} t={t} /></div>
        <p className="mb-0 mt-3 text-[13px] text-app-ink-soft">
          {self ? t("plan.selfDone") : t("plan.ownDone")}
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <CardHead title={t("plan.title")} sub={parts.length > 1 ? t("plan.parcels", { count: parts.length }) : t("plan.booked")} />
      {flashBox}
      <div className="mt-4 grid gap-5">
        {parts.map((part) => {
          const job = jobs.find((entry) => entry.id === part.bookingId) ?? null;
          const partnerName = job?.logisticsPartner.displayName ?? partners.find((partner) => partner.id === part.partnerId)?.displayName ?? t("plan.partner");
          const steps = deliveryTimeline(order, job, plan.kind);
          const exception = job ? jobException(job) : null;
          const mine = job?.sellerId === sellerId;
          const pod = job?.packageDetails && typeof job.packageDetails === "object" && "payOnDelivery" in (job.packageDetails as Record<string, unknown>);
          const fee = job?.deliveryFee ?? part.price;
          return (
            <div key={part.shipmentKey} className="grid gap-3 border-t border-app-line pt-4 first:border-t-0 first:pt-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[15px] font-extrabold">{partnerName}</div>
                  <div className="text-[13px] text-app-ink-soft">
                    {parts.length > 1 ? `${part.shipmentKey === "own" ? t("plan.yourParcel") : t("plan.fromSupplier")} · ` : ""}
                    {serviceLabel(t, job?.service ?? part.service)} · {naira(fee)} · {timeframeLabel(t, part.minDays, part.maxDays)}
                  </div>
                </div>
                {job ? (job.feePaidAt ? <Pill tone="success">{t("plan.feePaid")}</Pill> : <Pill tone="warning">{t("plan.feeNotPaid")}</Pill>) : <Pill tone="muted">{t("plan.notSent")}</Pill>}
              </div>
              {!job && <p className="m-0 text-[13px] text-app-ink-soft">{plan.pod ? t("plan.goesWhenPaidPod") : t("plan.goesWhenPaid")}</p>}
              <Timeline steps={steps} t={t} />
              {job && !job.feePaidAt && mine && (
                <p className="m-0 text-[13px] text-app-ink-soft">
                  {t("plan.payFrom")} <Link href="/home/logistics" className="font-bold text-app-accent-ink no-underline hover:underline">{t("logistics")}</Link>.
                </p>
              )}
              {exception && (
                <div className="flex flex-wrap items-center gap-2 rounded-[14px] bg-app-danger-tint px-3.5 py-2.5 text-[13.5px]">
                  <span className="font-bold text-app-danger">{exceptionLabel(t, exception)}</span>
                  {job?.declineReason && <span>· {declineReasonText(t, job.declineReason)}</span>}
                  {job?.failedReason && <span>· {job.failedReason}</span>}
                  <Link href="/home/logistics/exceptions" className="ml-auto font-bold text-app-accent-ink no-underline hover:underline">{t("plan.sortItOut")}</Link>
                </div>
              )}
              {job && mine && ["pending", "confirmed"].includes(job.status) && !job.readyAt && (
                <form action={markJobReadyAction}>
                  <input type="hidden" name="bookingId" value={job.id} />
                  <input type="hidden" name="back" value={back} />
                  <button type="submit" className={pillButton.ink}>{t("markReady")}</button>
                </form>
              )}
              {job?.readyAt && ["pending", "confirmed"].includes(job.status) && <div className="text-[13px] text-app-ink-soft">{t("plan.readySince", { date: when(job.readyAt.toISOString(), t) ?? "" })}</div>}
              {job && pod && job.status === "delivered" && (
                <div className="grid gap-2 rounded-[14px] bg-app-canvas px-3.5 py-3 text-[13.5px]">
                  <div className="font-bold">{t("pod.title")}</div>
                  <div>{job.codRemittedAt ? t("plan.cashPaidOn", { date: when(job.codRemittedAt.toISOString(), t) ?? "" }) : t("plan.cashNotYet")}</div>
                  {job.codConfirmedAt ? (
                    <Pill tone="success">{t("plan.cashConfirmed")}</Pill>
                  ) : mine ? (
                    <form action={confirmCashAction}>
                      <input type="hidden" name="bookingId" value={job.id} />
                      <input type="hidden" name="back" value={back} />
                      <button type="submit" className={pillButton.ink}>{t("plan.confirmCash")}</button>
                    </form>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
