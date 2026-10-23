import type { Metadata } from "next";
import Link from "next/link";
import { AppPage, AssistantNote, Card, EmptyState, Pill, PillLink } from "@/components/app-kit";
import { field, pillButton, sellerFrame } from "@/components/seller-core";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { messagesHref } from "@/lib/conversations/pure";
import { exceptionsFor, reassignOptions } from "@/lib/delivery-market/jobs.server";
import { canReassign, type ExceptionKind } from "@shared/delivery-market";
import { markJobReadyAction, reassignJobAction } from "@/app/actions/delivery-market";
import { FlashNotice, naira } from "@/components/delivery-market/bits";
import { declineReasonText, exceptionLabel, jobStatusLabel, timeframeLabel } from "@/components/delivery-market/words";
import { DeliveryTip } from "@/components/delivery-market/DeliveryTip";
import { getT } from "@/lib/i18n/server";
import { exceptionsInboxPlanName, exceptionsInboxProblem } from "@/lib/plans/gates.server";
import { intlLocale } from "@shared/i18n";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("delivery"))("exceptions.title") };
}

const KIND_TONE: Record<ExceptionKind, "danger" | "warning" | "info"> = {
  declined: "danger",
  not_accepted: "warning",
  late_pickup: "warning",
  failed_attempt: "danger",
  address_problem: "danger",
  returning: "info",
};

const HELP: Record<ExceptionKind, string> = {
  declined: "The partner said no. Send it to another of your partners.",
  not_accepted: "The partner hasn't said yes in time. You can wait, or send it to another partner.",
  late_pickup: "The partner hasn't come to collect it in time. You can send it to another partner.",
  failed_attempt: "The rider couldn't deliver it. Talk to your customer and the partner about trying again.",
  address_problem: "The rider couldn't find the address. Check it with your customer, then tell the partner.",
  returning: "The parcel is coming back to you.",
};

// Deliveries that need the shop now (spec §5.7): declined, not accepted in time, late pickups, failed attempts and returns.
export default async function DeliveryExceptionsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const flash = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace) return null;
  // The inbox and "send to another partner" come with the plan (shared/plans.ts exceptionsInbox).
  const locked = Boolean(await exceptionsInboxProblem(user.id));
  const items = locked ? [] : await exceptionsFor(user.id);
  const options = new Map(
    await Promise.all(items.filter((item) => canReassign(item.kind)).map(async (item) => [item.job.id, await reassignOptions(user.id, item.job.id)] as const)),
  );
  const t = await getT("delivery");
  const date = (value: Date) => value.toLocaleString(intlLocale(t.locale), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  return (
    <AppPage
      frame={sellerFrame(user, workspace.store)}
      title={t("exceptions.title")}
      sub={t("exceptions.sub")}
      actions={<PillLink href="/home/logistics" icon="arrowLeft">{t("logistics")}</PillLink>}
    >
      <FlashNotice saved={flash.saved} error={flash.error} />
      <DeliveryTip>
        <div className="mb-5"><AssistantNote who="peggy">{t("exceptions.tip")}</AssistantNote></div>
      </DeliveryTip>
      {locked ? (
        <EmptyState icon="truck" title={t("exceptions.lockedTitle")} action={<PillLink href="/home/settings?tab=Billing" tone="accent">{t("exceptions.seePlans")}</PillLink>}>
          {t("exceptions.lockedBody", { plan: exceptionsInboxPlanName() })}
        </EmptyState>
      ) : items.length === 0 ? (
        <EmptyState icon="checkCircle" title={t("exceptions.emptyTitle")}>{t("exceptions.emptyBody")}</EmptyState>
      ) : (
        <div className="grid gap-4">
          {items.map(({ job, kind, order }) => {
            const choices = options.get(job.id) ?? [];
            const kindKey = kind as ExceptionKind;
            const canReady = ["pending", "confirmed"].includes(job.status) && !job.readyAt;
            return (
              <Card key={job.id} as="article" className="grid gap-3 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[15.5px] font-extrabold">
                      {order ? <Link href={`/home/orders/${order.id}`} className="text-app-ink no-underline hover:underline">{t("exceptions.order", { number: order.orderNumber })}</Link> : job.destination}
                    </div>
                    <div className="text-[13px] text-app-ink-soft">
                      {order ? `${order.buyerName} · ` : ""}{job.logisticsPartner.displayName} · {naira(job.deliveryFee)} · {jobStatusLabel(t, job.status)} · {date(job.updatedAt)}
                    </div>
                  </div>
                  <Pill tone={KIND_TONE[kindKey]} dot>{exceptionLabel(t, kindKey)}</Pill>
                </div>
                <p className="m-0 text-[14px]">{t.dynamic(`exceptions.help.${kindKey}`, HELP[kindKey])}</p>
                {job.declineReason && <p className="m-0 text-[13.5px]"><span className="text-app-ink-soft">{t("exceptions.partnerSaid")} </span><span className="font-bold">{declineReasonText(t, job.declineReason)}</span></p>}
                {job.failedReason && <p className="m-0 text-[13.5px]"><span className="text-app-ink-soft">{t("exceptions.whatHappened")} </span><span className="font-bold">{job.failedReason}</span></p>}

                {canReassign(kind) && (
                  <div className="grid gap-2 rounded-[14px] bg-app-canvas p-3.5">
                    <div className="text-[14px] font-extrabold">{t("exceptions.sendToAnother")}</div>
                    {choices.length === 0 ? (
                      <p className="m-0 text-[13.5px] text-app-ink-soft">
                        {t("exceptions.noOtherPartner")} <Link href="/home/logistics/partners#find" className="font-bold text-app-accent-ink no-underline hover:underline">{t("exceptions.findPartner")}</Link>
                      </p>
                    ) : (
                      <form action={reassignJobAction} className="grid gap-2">
                        <input type="hidden" name="bookingId" value={job.id} />
                        <input type="hidden" name="back" value="/home/logistics/exceptions" />
                        {choices.map((choice, index) => (
                          <label key={choice.connectionId} className="flex flex-wrap items-center gap-2 text-[14px]">
                            <input type="radio" name="connectionId" value={choice.connectionId} defaultChecked={index === 0} className={field.checkbox} />
                            <span className="font-bold">{choice.name}</span>
                            <span>{naira(choice.price)}</span>
                            <span className="text-app-ink-soft">· {timeframeLabel(t, choice.minDays, choice.maxDays)}</span>
                          </label>
                        ))}
                        <p className="m-0 text-[12.5px] leading-[1.5] text-app-ink-soft">
                          {t("exceptions.feeNote")}
                        </p>
                        <div><button type="submit" className={pillButton.ink}>{t("exceptions.sendToThis")}</button></div>
                      </form>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {canReady && (
                    <form action={markJobReadyAction}>
                      <input type="hidden" name="bookingId" value={job.id} />
                      <input type="hidden" name="back" value="/home/logistics/exceptions" />
                      <button type="submit" className={pillButton.white}>{t("markReady")}</button>
                    </form>
                  )}
                  {job.readyAt && ["pending", "confirmed"].includes(job.status) && <Pill tone="info">{t("exceptions.readySince", { date: date(job.readyAt) })}</Pill>}
                  <PillLink href={messagesHref("seller", { with: job.logisticsPartner.id, context: { kind: "booking", id: job.id } })} size="sm" icon="chat">{t("exceptions.messagePartner")}</PillLink>
                  {order && <PillLink href={`/home/orders/${order.id}`} size="sm">{t("exceptions.viewOrder")}</PillLink>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </AppPage>
  );
}
