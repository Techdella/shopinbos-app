import { Pill } from "@/components/app-kit";
import { declinePartnerJob, markCashPaidToShop } from "@/app/actions/delivery-market-partner";
import { DECLINE_REASONS, isSizeBand } from "@shared/delivery-market";
import { declineReasonOption, declineReasonText, sizeLabel } from "@/components/delivery-market/words";
import { getT } from "@/lib/i18n/server";
import { SubmitButton, inputClass, jobId, lagosDate, lagosTime, naira, type Translate } from "./kit";

// Logistics marketplace pieces for the partner's job lists (Today and Jobs): what kind of job it is, the deadlines,
// whether the fee is paid, declining with a reason, and pay-on-delivery cash the partner settles with the shop.
// Words: "market.*" in the logistics catalog; sizes and decline reasons from the "delivery" catalog.

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
export async function MarketJobFacts({ job, pointName, now = new Date(), t: dates }: { job: MarketJob; pointName?: string | null; now?: Date; t?: Translate }) {
  const t = await getT("logistics", "delivery");
  const marketplace = !!job.shipmentKey || !!job.service;
  const pod = payOnDeliveryOf(job.packageDetails);
  const lateToAccept = job.status === "pending" && job.acceptBy && job.acceptBy.getTime() < now.getTime();
  const facts = [
    job.service === "pickup_point" ? <Pill key="service" tone="info">{pointName ? t("market.job.toPoint", { name: pointName }) : t("market.job.toAPoint")}</Pill> : job.service ? <Pill key="service">{job.service === "same_day" ? t("market.job.sameDay") : t("market.job.doorstep")}</Pill> : null,
    isSizeBand(job.sizeBand) ? <Pill key="size">{sizeLabel(t, job.sizeBand)}</Pill> : null,
    job.readyAt && ["pending", "confirmed"].includes(job.status) ? <Pill key="ready" tone="success" dot>{t("market.job.ready")}</Pill> : null,
    job.status === "pending" && job.acceptBy ? <Pill key="accept" tone={lateToAccept ? "danger" : "warning"}>{lateToAccept ? t("market.job.acceptPassed") : t("market.job.acceptBy", { time: when(job.acceptBy, now, dates ?? t) })}</Pill> : null,
    job.estimatedDelivery && !["delivered", "cancelled", "declined", "returned"].includes(job.status) ? <Pill key="due">{t("market.job.deliverBy", { time: when(job.estimatedDelivery, now, dates ?? t) })}</Pill> : null,
    marketplace ? <Pill key="fee" tone={job.feePaidAt ? "success" : "muted"}>{job.feePaidAt ? t("market.job.feePaid", { amount: naira(job.deliveryFee) }) : t("market.job.feeNotPaid", { amount: naira(job.deliveryFee) })}</Pill> : null,
    pod ? <Pill key="pod" tone="warning">{t("market.job.podCollect", { amount: naira(pod.amount) })}</Pill> : null,
  ].filter(Boolean);
  if (!facts.length && !(job.status === "declined" && job.declineReason)) return null;
  return (
    <div className="grid gap-1.5">
      {facts.length > 0 && <div className="flex flex-wrap gap-1.5">{facts}</div>}
      {job.status === "declined" && job.declineReason && <p className="m-0 text-[15px] text-app-ink-soft">{t("market.job.youDeclined", { reason: declineReasonText(t, job.declineReason) })}</p>}
    </div>
  );
}

/** "Decline" for a new job: pick why (and add a note), so the shop can send it to another partner. */
export async function DeclineJobForm({ bookingId, returnTo, className }: { bookingId: string; returnTo: string; className?: string }) {
  const t = await getT("logistics", "delivery");
  return (
    <details className={`group ${className ?? ""}`}>
      <summary
        className="inline-flex min-h-[40px] cursor-pointer list-none items-center justify-center rounded-full border border-app-line bg-white px-4 text-[15px] font-extrabold text-app-ink transition hover:border-app-line-strong [&::-webkit-details-marker]:hidden"
        aria-label={t("market.decline.aria", { id: jobId(bookingId) })}
      >
        {t("market.decline.button")}
      </summary>
      <form action={declinePartnerJob} className="mt-3 grid gap-2 rounded-[16px] border border-app-line bg-white p-3 sm:min-w-[320px]">
        <input type="hidden" name="bookingId" value={bookingId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <label htmlFor={`decline-${bookingId}`} className="text-[15px] font-bold">{t("market.decline.why")}</label>
        <select id={`decline-${bookingId}`} name="reason" defaultValue={DECLINE_REASONS[0]} className={inputClass}>
          {DECLINE_REASONS.map((reason) => <option key={reason} value={reason}>{declineReasonOption(t, reason)}</option>)}
        </select>
        <label htmlFor={`decline-note-${bookingId}`} className="sr-only">{t("market.decline.detailLabel")}</label>
        <input id={`decline-note-${bookingId}`} name="detail" maxLength={240} placeholder={t("market.decline.detailPlaceholder")} className={inputClass} />
        <p className="m-0 text-[14px] text-app-ink-soft">{t("market.decline.note")}</p>
        <SubmitButton tone="white" size="sm" className="justify-self-start">{t("market.decline.submit")}</SubmitButton>
      </form>
    </details>
  );
}

/** Delivered pay-on-delivery jobs: say the cash is paid to the shop, then wait for the shop to confirm. */
export async function CashToShop({ job, returnTo }: { job: MarketJob; returnTo: string }) {
  const pod = payOnDeliveryOf(job.packageDetails);
  if (!pod || job.status !== "delivered") return null;
  const t = await getT("logistics");
  if (job.codConfirmedAt) return <p className="m-0 text-[15px] font-bold text-app-success">{t("market.cash.confirmed", { amount: naira(pod.amount) })}</p>;
  if (job.codRemittedAt) return <p className="m-0 text-[15px] text-app-ink-soft">{t("market.cash.marked", { amount: naira(pod.amount) })}</p>;
  return (
    <form action={markCashPaidToShop} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="bookingId" value={job.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <span className="text-[15px] text-app-ink-soft">{t("market.cash.payShop", { amount: naira(pod.amount) })}</span>
      <SubmitButton size="sm">{t("market.cash.mark")}</SubmitButton>
    </form>
  );
}
