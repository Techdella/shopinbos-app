import { Pill } from "@/components/app-kit";
import { declinePartnerJob, markCashPaidToShop } from "@/app/actions/delivery-market-partner";
import { DECLINE_REASONS, SIZE_BAND_LABELS, isSizeBand } from "@shared/delivery-market";
import { SubmitButton, inputClass, jobId, lagosDate, lagosTime, naira, type Translate } from "./kit";

// Logistics marketplace pieces for the partner's job lists (Today and Jobs): what kind of job it is, the deadlines,
// whether the fee is paid, declining with a reason, and pay-on-delivery cash the partner settles with the shop.

export interface MarketJob {
  id: string;
  status: string;
  deliveryFee: number;
  service?: string | null;
  sizeBand?: string | null;
  shipmentKey?: string | null;
  readyAt?: Date | null;
  acceptBy?: Date | null;
  estimatedDelivery?: Date | null;
  feePaidAt?: Date | null;
  declineReason?: string | null;
  packageDetails?: unknown;
  codRemittedAt?: Date | null;
  codConfirmedAt?: Date | null;
}

/** Pay on delivery agreed between the shop and the partner (src/lib/delivery-market/jobs.server.ts). */
export function payOnDeliveryOf(packageDetails: unknown): { amount: number } | null {
  const pkg = packageDetails && typeof packageDetails === "object" ? (packageDetails as Record<string, unknown>) : null;
  const pod = pkg?.payOnDelivery && typeof pkg.payOnDelivery === "object" ? (pkg.payOnDelivery as Record<string, unknown>) : null;
  if (!pod) return null;
  const amount = Number(pod.amount);
  return { amount: Number.isFinite(amount) ? amount : 0 };
}

const when = (date: Date, now: Date, t?: Translate) => `${lagosTime(date, t)}, ${lagosDate(date, undefined, now, t)}`;

/** Badges for a marketplace job: the service (and pickup point), size, ready for pickup, deadlines, fee paid. */
export function MarketJobFacts({ job, pointName, now = new Date(), t }: { job: MarketJob; pointName?: string | null; now?: Date; t?: Translate }) {
  const marketplace = !!job.shipmentKey || !!job.service;
  const pod = payOnDeliveryOf(job.packageDetails);
  const lateToAccept = job.status === "pending" && job.acceptBy && job.acceptBy.getTime() < now.getTime();
  const facts = [
    job.service === "pickup_point" ? <Pill key="service" tone="info">{pointName ? `To pickup point: ${pointName}` : "To a pickup point"}</Pill> : job.service ? <Pill key="service">{job.service === "same_day" ? "Same-day doorstep" : "Doorstep delivery"}</Pill> : null,
    isSizeBand(job.sizeBand) ? <Pill key="size">{SIZE_BAND_LABELS[job.sizeBand]}</Pill> : null,
    job.readyAt && ["pending", "confirmed"].includes(job.status) ? <Pill key="ready" tone="success" dot>Ready for pickup</Pill> : null,
    job.status === "pending" && job.acceptBy ? <Pill key="accept" tone={lateToAccept ? "danger" : "warning"}>{lateToAccept ? "Accept time passed: accept now or decline" : `Accept by ${when(job.acceptBy, now, t)}`}</Pill> : null,
    job.estimatedDelivery && !["delivered", "cancelled", "declined", "returned"].includes(job.status) ? <Pill key="due">Deliver by {when(job.estimatedDelivery, now, t)}</Pill> : null,
    marketplace ? <Pill key="fee" tone={job.feePaidAt ? "success" : "muted"}>{job.feePaidAt ? `Fee ${naira(job.deliveryFee)} paid` : `Fee ${naira(job.deliveryFee)} not paid yet`}</Pill> : null,
    pod ? <Pill key="pod" tone="warning">Pay on delivery: collect {naira(pod.amount)}</Pill> : null,
  ].filter(Boolean);
  if (!facts.length && !(job.status === "declined" && job.declineReason)) return null;
  return (
    <div className="grid gap-1.5">
      {facts.length > 0 && <div className="flex flex-wrap gap-1.5">{facts}</div>}
      {job.status === "declined" && job.declineReason && <p className="m-0 text-[15px] text-app-ink-soft">You declined: {job.declineReason}</p>}
    </div>
  );
}

/** "Decline" for a new job: pick why (and add a note), so the shop can send it to another partner. */
export function DeclineJobForm({ bookingId, returnTo, className }: { bookingId: string; returnTo: string; className?: string }) {
  return (
    <details className={`group ${className ?? ""}`}>
      <summary
        className="inline-flex min-h-[40px] cursor-pointer list-none items-center justify-center rounded-full border border-app-line bg-white px-4 text-[15px] font-extrabold text-app-ink transition hover:border-app-line-strong [&::-webkit-details-marker]:hidden"
        aria-label={`Decline job ${jobId(bookingId)}`}
      >
        Decline
      </summary>
      <form action={declinePartnerJob} className="mt-3 grid gap-2 rounded-[16px] border border-app-line bg-white p-3 sm:min-w-[320px]">
        <input type="hidden" name="bookingId" value={bookingId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <label htmlFor={`decline-${bookingId}`} className="text-[15px] font-bold">Why can&apos;t you take it?</label>
        <select id={`decline-${bookingId}`} name="reason" defaultValue={DECLINE_REASONS[0]} className={inputClass}>
          {DECLINE_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
        </select>
        <label htmlFor={`decline-note-${bookingId}`} className="sr-only">More detail (optional)</label>
        <input id={`decline-note-${bookingId}`} name="detail" maxLength={240} placeholder="More detail (needed for Other)" className={inputClass} />
        <p className="m-0 text-[14px] text-app-ink-soft">The shop sees your reason and can send the job to another partner.</p>
        <SubmitButton tone="white" size="sm" className="justify-self-start">Decline job</SubmitButton>
      </form>
    </details>
  );
}

/** Delivered pay-on-delivery jobs: say the cash is paid to the shop, then wait for the shop to confirm. */
export function CashToShop({ job, returnTo }: { job: MarketJob; returnTo: string }) {
  const pod = payOnDeliveryOf(job.packageDetails);
  if (!pod || job.status !== "delivered") return null;
  if (job.codConfirmedAt) return <p className="m-0 text-[15px] font-bold text-app-success">The shop confirmed they got the {naira(pod.amount)} cash.</p>;
  if (job.codRemittedAt) return <p className="m-0 text-[15px] text-app-ink-soft">You marked {naira(pod.amount)} paid to the shop. Waiting for them to confirm.</p>;
  return (
    <form action={markCashPaidToShop} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="bookingId" value={job.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <span className="text-[15px] text-app-ink-soft">Pay the shop the {naira(pod.amount)} the rider collected, then:</span>
      <SubmitButton size="sm">Mark cash paid to shop</SubmitButton>
    </form>
  );
}
