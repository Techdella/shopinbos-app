import type { Metadata } from "next";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { Card, CardHead, ListCard, ListRow, Pill, StatGrid, StatTile } from "@/components/app-kit";
import { cashToPayIn } from "@/lib/logistics/job-rules";
import { owedAfterCredit, payInDue, payInStatusWords } from "@/lib/logistics/payin-rules";
import { cashOwedBySeller } from "@/lib/logistics/seller-payins.server";
import { PaySellerList } from "@/components/logistics/PaySellerList";
import { PayInOverdueCard } from "@/components/logistics/PayInOverdueCard";
import { overdueCardWords, payInConfig } from "@/lib/logistics/payin-deadline";
import { payInOverdueView } from "@/lib/logistics/payin-standing.server";
import {
  ACTIVE_STATUSES,
  ActionNotice,
  PartnerPage,
  Route,
  StatusPill,
  SubmitButton,
  cashToCollect,
  inputClass,
  jobId,
  labelClass,
  lagosDate,
  lagosStartOfToday,
  lagosTime,
  naira,
} from "@/components/logistics/kit";
import { getT } from "@/lib/i18n/server";

// Cash on delivery: what riders collect at the door, what the partner still has to pass on to each seller (by 6pm),
// and the payments made. The cash belongs to the seller, so it's paid to each seller directly, never to Shopinbos:
// through Paystack, split to the seller's own bank, or handed over and confirmed by the seller
// (lib/logistics/seller-payins.server.ts). Transfers go straight from the buyer to the seller, so they're never owed.

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("logistics"))("cash.title") };
}

const DAY = 24 * 60 * 60 * 1000;

function Section({ id, title, sub, children }: { id: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="min-w-0">
      <h2 id={id} className="m-0 text-[18px] font-extrabold">{title}</h2>
      {sub && <p className="m-0 mb-3 mt-0.5 text-[15px] text-app-ink-soft">{sub}</p>}
      <div className={sub ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <Card className="px-5 py-8 text-center text-[15px] text-app-ink-soft">{children}</Card>;
}

export default async function LogisticsCashPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const { saved, error } = await searchParams;
  const t = await getT("logistics", "common");
  const now = new Date();

  const startOfToday = lagosStartOfToday();
  const monthAgo = new Date(startOfToday.getTime() - 29 * DAY);
  const jobSelect = {
    id: true, orderId: true, pickupLocation: true, destination: true, status: true, codAmount: true, codCollected: true,
    codMethod: true, codCollectedAt: true, remittanceId: true, deliveredAt: true, createdAt: true,
    seller: { select: { name: true } }, rider: { select: { name: true } },
  } as const;

  const [openJobs, heldCash, transfers, collectedRecent, remittances, sellersOwed, overdue] = await Promise.all([
    db.deliveryBooking.findMany({
      where: { logisticsPartnerId: partner.id, status: { in: ["pending", ...ACTIVE_STATUSES] }, OR: [{ codAmount: { gt: 0 } }, { codAmount: null, orderId: { not: null } }] },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: jobSelect,
    }),
    db.deliveryBooking.findMany({
      where: { logisticsPartnerId: partner.id, codMethod: "cash", remittanceId: null, codCollected: { gt: 0 } },
      orderBy: [{ codCollectedAt: "asc" }, { createdAt: "asc" }],
      take: 300,
      select: jobSelect,
    }),
    db.deliveryBooking.findMany({
      where: { logisticsPartnerId: partner.id, codMethod: "transfer", codCollected: { gt: 0 } },
      orderBy: { codCollectedAt: "desc" },
      take: 30,
      select: jobSelect,
    }),
    db.deliveryBooking.findMany({
      where: { logisticsPartnerId: partner.id, codCollected: { gt: 0 }, codCollectedAt: { gte: monthAgo } },
      select: { codCollected: true, codMethod: true, codCollectedAt: true },
    }),
    db.codRemittance.findMany({
      where: { logisticsPartnerId: partner.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, amount: true, method: true, reference: true, note: true, createdAt: true, outcome: true, covered: true, creditAfter: true, _count: { select: { bookings: true } } },
    }),
    cashOwedBySeller(partner.id),
    payInOverdueView(partner.id),
  ]);

  // Older jobs were booked before codAmount existed: fall back to the linked order's unpaid total.
  const legacyOrderIds = openJobs.filter((job) => job.codAmount === null && job.orderId).map((job) => job.orderId!);
  const orders = legacyOrderIds.length
    ? await db.retailOrder.findMany({ where: { id: { in: legacyOrderIds } }, select: { id: true, orderNumber: true, total: true, status: true, paymentMethod: true } })
    : [];
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const toCollect = openJobs
    .map((job) => ({ ...job, cash: job.codAmount ?? (job.orderId ? cashToCollect(orderById.get(job.orderId)) : 0) }))
    .filter((job) => job.cash > 0);

  const held = cashToPayIn(heldCash);
  const credit = partner.payInCredit;
  const owed = owedAfterCredit(held, credit);
  const oldest = heldCash[0];
  const due = payInDue(oldest ? oldest.codCollectedAt ?? oldest.createdAt : null, new Date(), payInConfig().cutoffHour);
  const late = due.late && owed > 0;
  const byRider = new Map<string, { name: string; amount: number; jobs: number }>();
  for (const job of heldCash) {
    const key = job.rider?.name ?? t("cash.notAssigned");
    const entry = byRider.get(key) ?? { name: key, amount: 0, jobs: 0 };
    entry.amount += job.codCollected ?? 0;
    entry.jobs += 1;
    byRider.set(key, entry);
  }
  const sum = (rows: Array<{ codCollected: number | null }>) => rows.reduce((total, row) => total + (row.codCollected ?? 0), 0);
  const collectedToday = collectedRecent.filter((row) => row.codCollectedAt && row.codCollectedAt >= startOfToday);
  const paidInMonth = remittances.filter((row) => row.createdAt >= monthAgo).reduce((total, row) => total + row.amount, 0);

  return (
    <PartnerPage
      frame={{ user, partner }}
      title={t("cash.title")}
      sub={t("cash.sub")}
    >
      <ActionNotice saved={saved} error={error} savedText={t("cash.saved")} />

      <StatGrid className="mb-5">
        <StatTile tone="card" label={t("cash.toPayIn")} value={naira(owed)} hint={owed > 0 ? `${late ? t("cash.lateNow") : t("today.payInWhen", { when: due.words })} · ${t("cash.jobs", { count: heldCash.length })}` : credit > 0 ? t("cash.extraKept", { amount: naira(credit) }) : t("cash.nothingOwed")} />
        <StatTile tone="card" label={t("cash.toCollectOpen")} value={naira(toCollect.reduce((total, job) => total + job.cash, 0))} hint={t("cash.jobs", { count: toCollect.length })} />
        <StatTile tone="card" label={t("cash.collectedToday")} value={naira(sum(collectedToday))} hint={t("cash.byTransfer", { count: collectedToday.filter((row) => row.codMethod === "transfer").length })} />
        <StatTile tone="card" label={t("cash.paidIn30")} value={naira(paidInMonth)} hint={t("cash.collectedInCash", { amount: naira(sum(collectedRecent.filter((row) => row.codMethod === "cash"))) })} />
      </StatGrid>

      {/* What to pay in and how comes first on a phone; on a wide screen it sits on the right. */}
      <div className="grid gap-5 xl:[grid-template-columns:minmax(0,1fr)_420px]">
        <div className="grid min-w-0 content-start gap-5">
          <>
            <Section id="held" title={t("cash.heldTitle")} sub={t("cash.heldSub")}>
              {heldCash.length === 0 ? (
                <Empty>{t("cash.heldEmpty")}</Empty>
              ) : (
                <>
                  {byRider.size > 1 && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {[...byRider.values()].map((entry) => (
                        <Pill key={entry.name} tone="warning">{entry.name}: {naira(entry.amount)}</Pill>
                      ))}
                    </div>
                  )}
                  <ListCard>
                    {heldCash.map((job) => (
                      <ListRow key={job.id}>
                        <div className="min-w-0 flex-1 basis-[200px]">
                          <Route from={job.pickupLocation} to={job.destination} className="block truncate text-[15px]" toLabel={t("kit.to")} />
                          <div className="truncate text-[15px] text-app-ink-soft">
                            {jobId(job.id)} · {job.rider?.name ?? t("dispatch.noRider")} · {lagosDate(job.codCollectedAt ?? job.deliveredAt ?? job.createdAt, undefined, now, t)}
                          </div>
                        </div>
                        <div className="ml-auto text-[15px] font-extrabold">{naira(job.codCollected ?? 0)}</div>
                      </ListRow>
                    ))}
                  </ListCard>
                </>
              )}
            </Section>

            <Section id="to-collect" title={t("cash.toCollectTitle")} sub={t("cash.toCollectSub")}>
              {toCollect.length === 0 ? (
                <Empty>{t("cash.toCollectEmpty")}</Empty>
              ) : (
                <ListCard>
                  {toCollect.map((job) => (
                    <ListRow key={job.id}>
                      <div className="min-w-0 flex-1 basis-[200px]">
                        <Route from={job.pickupLocation} to={job.destination} className="block truncate text-[15px]" toLabel={t("kit.to")} />
                        <div className="truncate text-[15px] text-app-ink-soft">{jobId(job.id)} · {job.seller.name} · {job.rider?.name ?? t("today.noRiderYet")}</div>
                      </div>
                      <StatusPill status={job.status} />
                      <div className="ml-auto text-[15px] font-extrabold">{naira(job.cash)}</div>
                    </ListRow>
                  ))}
                </ListCard>
              )}
            </Section>

            <Section id="transfers" title={t("cash.transfersTitle")} sub={t("cash.transfersSub")}>
              {transfers.length === 0 ? (
                <Empty>{t("cash.transfersEmpty")}</Empty>
              ) : (
                <ListCard>
                  {transfers.map((job) => (
                    <ListRow key={job.id}>
                      <div className="min-w-0 flex-1 basis-[200px]">
                        <Route from={job.pickupLocation} to={job.destination} className="block truncate text-[15px]" toLabel={t("kit.to")} />
                        <div className="truncate text-[15px] text-app-ink-soft">
                          {jobId(job.id)} · {job.seller.name} · {job.rider?.name ?? t("dispatch.noRider")} · {lagosDate(job.codCollectedAt ?? job.createdAt, undefined, now, t)}
                        </div>
                      </div>
                      <div className="ml-auto text-[15px] font-extrabold">{naira(job.codCollected ?? 0)}</div>
                    </ListRow>
                  ))}
                </ListCard>
              )}
            </Section>
          </>
        </div>
        <div className="order-first grid min-w-0 content-start gap-5 xl:order-none">
          <>
            {overdue && <PayInOverdueCard {...overdueCardWords({ amount: overdue.amount, since: new Date(overdue.since), paused: overdue.paused, now }, t)} account={overdue.account} />}
            <Card className="grid gap-4 p-5">
              <div>
                <h2 className="m-0 text-[22px] font-extrabold leading-tight">{owed > 0 ? t("cash.payInAmount", { amount: naira(owed), when: due.words }) : t("cash.nothingToPay")}</h2>
                <p className={`m-0 mt-1 text-[15px] leading-[1.5] ${late && !overdue ? "font-bold text-app-danger" : "text-app-ink-soft"}`}>
                  {owed > 0
                    ? late
                      ? overdue
                        ? t("today.codOwed")
                        : t("cash.dueEarlier")
                      : t("today.codOwed")
                    : credit > 0
                    ? t("cash.paidExtra", { amount: naira(credit) })
                    : t("cash.whenCollect")}
                </p>
              </div>
              <PaySellerList rows={sellersOwed.map((row) => ({ sellerId: row.sellerId, sellerName: row.sellerName, amount: row.amount, jobs: row.jobIds.length, payable: row.payable }))} />
              <p className="m-0 text-[13.5px] leading-[1.5] text-app-ink-soft">
                Cash on delivery belongs to the seller, so it goes to each seller directly. Paying in the app sends it straight to their bank through Paystack and settles the jobs at once.
              </p>
            </Card>

            <section aria-labelledby="history" className="min-w-0">
              <h2 id="history" className="m-0 mb-3 text-[18px] font-extrabold">{t("cash.recent")}</h2>
              {remittances.length === 0 ? (
                <Empty>{t("cash.noPayIns")}</Empty>
              ) : (
                <ListCard>
                  {remittances.map((row) => (
                    <ListRow key={row.id}>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-extrabold">{naira(row.amount)}</div>
                        <div className="truncate text-[15px] text-app-ink-soft">
                          {lagosDate(row.createdAt, undefined, now, t)}, {lagosTime(row.createdAt, t)} · {row.method === "seller" ? "Paid to the seller" : row.method === "seller_confirmed" ? "Seller confirmed" : row.method === "account" ? t("cash.method.account") : row.method === "settled" ? t("cash.method.settled") : row.method === "cash" ? t("cash.cash") : row.method === "api" ? t("cash.method.api") : t("cash.method.transfer")}
                          {row.reference && row.method !== "account" ? ` · ${row.reference}` : ""}
                        </div>
                        <div className="truncate text-[14px] font-bold text-app-forest">
                          {payInStatusWords({ outcome: row.outcome, covered: row.covered, creditAfter: row.creditAfter, jobs: row._count.bookings }, naira)}
                        </div>
                      </div>
                    </ListRow>
                  ))}
                </ListCard>
              )}
            </section>
          </>
        </div>
      </div>
    </PartnerPage>
  );
}
