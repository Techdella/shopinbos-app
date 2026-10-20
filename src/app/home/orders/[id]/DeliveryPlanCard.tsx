import Link from "next/link";
import { Card, CardHead, Pill } from "@/components/app-kit";
import { pillButton } from "@/components/seller-core";
import { db } from "@/lib/db/client";
import {
  EXCEPTION_WORDS,
  deliveryTimeline,
  jobException,
  partnerShipments,
  timeframeWords,
  type DeliveryPlan,
} from "@shared/delivery-market";
import { confirmCashAction, markJobReadyAction } from "@/app/actions/delivery-market";
import { naira, serviceWord } from "@/components/delivery-market/bits";

// The order's delivery through the logistics marketplace (RetailOrder.logisticsDetails.delivery): a timeline per
// parcel, the partner, service and fee, "Mark ready for pickup", exceptions, and pay-on-delivery cash.

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : null);

function Timeline({ steps }: { steps: ReturnType<typeof deliveryTimeline> }) {
  return (
    <ol className="m-0 grid list-none gap-2 p-0">
      {steps.map((step) => (
        <li key={step.key} className="flex items-center gap-2.5 text-[14px]">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${step.done ? "bg-app-success" : "border border-app-line-strong bg-white"}`} />
          <span className={step.done ? "font-bold" : "text-app-ink-soft"}>{step.label}</span>
          {step.at && <span className="text-[12.5px] text-app-ink-soft">{when(step.at)}</span>}
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
    <p role={flash.error ? "alert" : "status"} className={`m-0 mt-3 rounded-[14px] px-3.5 py-2.5 text-[13.5px] font-bold ${flash.error ? "bg-app-danger-tint text-app-danger" : "bg-app-success-tint text-app-success"}`}>{flash.error ?? flash.saved}</p>
  ) : null;

  if (!parts.length) {
    // Pick up from the seller, or the seller's own flat-fee delivery: no partner job.
    const self = plan.kind === "self_pickup";
    return (
      <Card className="p-5">
        <CardHead title={self ? "Pick up from you" : "Your own delivery"} sub={self ? "The customer collects this order from you." : "No delivery partner covered this address, so you deliver it at your flat fee."} />
        {flashBox}
        <div className="mt-4"><Timeline steps={deliveryTimeline(order, null, plan.kind)} /></div>
        <p className="mb-0 mt-3 text-[13px] text-app-ink-soft">
          {self ? "When the customer collects it, mark the order delivered under Status." : "When it's delivered, mark the order delivered under Status."}
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <CardHead title="Delivery" sub={parts.length > 1 ? `${parts.length} parcels, each with its own delivery partner.` : "Booked with your delivery partner."} />
      {flashBox}
      <div className="mt-4 grid gap-5">
        {parts.map((part) => {
          const job = jobs.find((entry) => entry.id === part.bookingId) ?? null;
          const partnerName = job?.logisticsPartner.displayName ?? partners.find((partner) => partner.id === part.partnerId)?.displayName ?? "Delivery partner";
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
                    {parts.length > 1 ? `${part.shipmentKey === "own" ? "Your parcel" : "From your supplier"} · ` : ""}
                    {serviceWord(job?.service ?? part.service)} · {naira(fee)} · {timeframeWords(part.minDays, part.maxDays)}
                  </div>
                </div>
                {job ? (job.feePaidAt ? <Pill tone="success">Fee paid</Pill> : <Pill tone="warning">Fee not paid yet</Pill>) : <Pill tone="muted">Not sent yet</Pill>}
              </div>
              {!job && <p className="m-0 text-[13px] text-app-ink-soft">It goes to the partner once the order is paid{plan.pod ? " (or placed, for pay on delivery)" : ""}.</p>}
              <Timeline steps={steps} />
              {job && !job.feePaidAt && mine && (
                <p className="m-0 text-[13px] text-app-ink-soft">
                  Pay this fee from <Link href="/home/logistics" className="font-bold text-app-accent-ink no-underline hover:underline">Logistics</Link>.
                </p>
              )}
              {exception && (
                <div className="flex flex-wrap items-center gap-2 rounded-[14px] bg-app-danger-tint px-3.5 py-2.5 text-[13.5px]">
                  <span className="font-bold text-app-danger">{EXCEPTION_WORDS[exception]}</span>
                  {job?.declineReason && <span>· {job.declineReason}</span>}
                  {job?.failedReason && <span>· {job.failedReason}</span>}
                  <Link href="/home/logistics/exceptions" className="ml-auto font-bold text-app-accent-ink no-underline hover:underline">Sort it out</Link>
                </div>
              )}
              {job && mine && ["pending", "confirmed"].includes(job.status) && !job.readyAt && (
                <form action={markJobReadyAction}>
                  <input type="hidden" name="bookingId" value={job.id} />
                  <input type="hidden" name="back" value={back} />
                  <button type="submit" className={pillButton.ink}>Mark ready for pickup</button>
                </form>
              )}
              {job?.readyAt && ["pending", "confirmed"].includes(job.status) && <div className="text-[13px] text-app-ink-soft">Ready for pickup since {when(job.readyAt.toISOString())}.</div>}
              {job && pod && job.status === "delivered" && (
                <div className="grid gap-2 rounded-[14px] bg-app-canvas px-3.5 py-3 text-[13.5px]">
                  <div className="font-bold">Pay on delivery</div>
                  <div>{job.codRemittedAt ? `Partner says they paid you the cash on ${when(job.codRemittedAt.toISOString())}.` : "The partner hasn't said they've paid you the cash yet."}</div>
                  {job.codConfirmedAt ? (
                    <Pill tone="success">You confirmed you got the cash</Pill>
                  ) : mine ? (
                    <form action={confirmCashAction}>
                      <input type="hidden" name="bookingId" value={job.id} />
                      <input type="hidden" name="back" value={back} />
                      <button type="submit" className={pillButton.ink}>Confirm I got the cash</button>
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
