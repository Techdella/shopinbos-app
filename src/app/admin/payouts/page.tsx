import Link from "next/link";
import type { Metadata } from "next";
import { AppPage, Card, CardHead, EmptyState, Pill, PillLink, SearchForm, type Tone } from "@/components/app-kit";
import { CountRow, adminFrame, formatDate, formatMoney, withParams } from "@/components/admin/AdminKit";
import { requireAdminSection } from "@/lib/admin-team/service.server";
import { PayoutsNotReady, ledgerWeek, owedByLabel, pastWeeks } from "@/lib/payouts/ledger.server";
import {
  AIRTIME_NETWORK_LABELS,
  PAYOUT_METHOD_LABELS,
  PAYOUT_SOURCE_KINDS,
  PAYOUT_SOURCE_LABELS,
  cleanPayday,
  groupByEarner,
  isAirtimeNetwork,
  isPayoutMethod,
  isPayoutSourceKind,
  ledgerTotals,
} from "@shared/payout-ledger";
import { AddRewardForm, CloseWeekButton, MarkPaidButton, VoidLineButton } from "./PayoutActions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Payouts" };

// Admin › Payouts: the payout and rewards ledger (shared/payout-ledger.ts). One list per Friday (Lagos time) of
// what each reseller, creator and personal shopper is owed, plus airtime rewards. Shopinbos never holds this money:
// resell commissions are owed by the shop; mark a line paid once the money moved (the shop paid them, or you paid
// by hand). Earners' bank details are shown here only, to the team's money section (owners, admins, finance).

const STATUS_TONE: Record<string, Tone> = { owed: "warning", paid: "success", void: "muted" };
const STATUS_LABEL: Record<string, string> = { owed: "Owed", paid: "Paid", void: "Cancelled" };
const STATUS_FILTERS = [
  { id: "", label: "Everything" },
  { id: "owed", label: "Owed" },
  { id: "paid", label: "Paid" },
  { id: "void", label: "Cancelled" },
] as const;

const naira = (amount: number) => formatMoney(amount);
const friday = (day: string) => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

type Search = { week?: string; status?: string; kind?: string; q?: string };

export default async function AdminPayoutsPage({ searchParams }: { searchParams?: Promise<Search> }) {
  const user = await requireAdminSection("money");
  const search = (await searchParams) ?? {};
  const frame = adminFrame(user, "Search");
  const title = "Payouts";
  const sub = "Each Friday's list of what resellers, creators and personal shoppers are owed, and airtime rewards. Shopinbos holds none of it: shops owe their resellers. Mark a line paid once the money has moved.";
  const status = (["owed", "paid", "void"] as const).find((value) => value === search.status) ?? "";
  const kind = isPayoutSourceKind(search.kind) ? search.kind : "";
  const q = (search.q ?? "").slice(0, 80);

  let week: Awaited<ReturnType<typeof ledgerWeek>>;
  let weeks: Awaited<ReturnType<typeof pastWeeks>>;
  try {
    week = await ledgerWeek(cleanPayday(search.week), { status, kind, q });
    weeks = await pastWeeks();
  } catch (error) {
    if (!(error instanceof PayoutsNotReady)) throw error;
    return (
      <AppPage frame={frame} title={title} sub={sub}>
        <EmptyState icon="coin" title="Payouts need a quick database update">Run docs/migrations/2026-12-16-payout-ledger.sql on the Supabase database, then come back here.</EmptyState>
      </AppPage>
    );
  }

  const isOpen = week.payday === week.openPayday;
  const groups = groupByEarner(week.lines);
  const totals = ledgerTotals(week.lines);
  const keep = { week: isOpen ? undefined : week.payday, status: status || undefined, kind: kind || undefined, q: q || undefined };
  const csvHref = withParams("/api/admin/payouts/export", { week: week.payday, status: status || undefined, kind: kind || undefined, q: q || undefined });

  return (
    <AppPage
      frame={frame}
      title={title}
      sub={sub}
      actions={<PillLink href={csvHref} icon="download">Download CSV</PillLink>}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[13px] font-bold uppercase tracking-[0.12em] text-app-ink-soft">{isOpen ? "This Friday's list" : "Past list"}</div>
          <div className="text-[20px] font-extrabold">
            {friday(week.payday)}{" "}
            <Pill tone={week.batch?.status === "paid" ? "success" : "info"} dot>{week.batch?.status === "paid" ? `Closed ${formatDate(week.batch.closedAt)}` : "Open"}</Pill>
          </div>
        </div>
        {week.batch && week.batch.status !== "paid" ? <CloseWeekButton payday={week.payday} owedText={naira(totals.owed)} /> : null}
      </div>

      <CountRow
        items={[
          { label: "Owed", value: naira(totals.owed), hint: status === "" ? "Still to pay on this list" : undefined },
          { label: "Paid", value: naira(totals.paid) },
          { label: "Earners", value: groups.length },
          { label: "Lines", value: totals.lines },
        ]}
      />

      <div className="mb-3 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((option) => (
          <Link key={option.id} href={withParams("/admin/payouts", { ...keep, status: option.id || undefined })} className={`rounded-full border px-3.5 py-1.5 text-[13px] font-bold no-underline ${status === option.id ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink"}`}>
            {option.label}
          </Link>
        ))}
        <span className="mx-1 self-center text-app-ink-faint">|</span>
        {[{ id: "", label: "All kinds" }, ...PAYOUT_SOURCE_KINDS.map((id) => ({ id, label: PAYOUT_SOURCE_LABELS[id] }))].map((option) => (
          <Link key={option.id || "all"} href={withParams("/admin/payouts", { ...keep, kind: option.id || undefined })} className={`rounded-full border px-3.5 py-1.5 text-[13px] font-bold no-underline ${kind === option.id ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink"}`}>
            {option.label}
          </Link>
        ))}
      </div>
      <div className="mb-5 max-w-[520px]">
        <SearchForm action="/admin/payouts" defaultValue={q} placeholder="Search a name, email, phone, shop or reference" keep={{ week: keep.week, status: keep.status, kind: keep.kind }} />
      </div>

      {groups.length ? (
        <div className="mb-6 grid gap-4">
          {groups.map((group) => {
            const person = week.earners.get(group.earnerUserId);
            const owedIds = group.lines.filter((line) => line.status === "owed").map((line) => line.id);
            const allAirtime = group.lines.every((line) => line.sourceKind === "airtime_reward");
            return (
              <Card key={group.earnerUserId} className="grid gap-3 p-4 text-[13.5px]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[16px] font-extrabold">{person?.name ?? "A deleted account"} <span className="text-[12.5px] font-bold text-app-ink-soft">{person?.role}</span></div>
                    <div className="text-app-ink-soft">{[person?.phone, person?.email].filter(Boolean).join(" · ") || "No contact details"}</div>
                    <div className="mt-1">
                      {person?.bank ? (
                        <span className="font-mono text-[13px]">
                          {person.bank.bankName ?? "Bank"} · {person.bank.accountNumber} · {person.bank.accountName}
                          {person.bank.source !== "wallet" ? <span className="text-app-ink-soft"> (masked, from their {person.bank.source} payout account)</span> : null}
                        </span>
                      ) : (
                        <span className="text-app-ink-soft">No bank account on file: ask them, or pay airtime.</span>
                      )}
                    </div>
                  </div>
                  <div className="grid justify-items-end gap-1 text-right">
                    <div className="text-[20px] font-extrabold">{naira(group.owed)} <span className="text-[12.5px] font-bold text-app-ink-soft">owed</span></div>
                    {group.paid ? <div className="text-app-ink-soft">{naira(group.paid)} paid</div> : null}
                  </div>
                </div>

                <div className="grid gap-2 border-t border-app-line pt-3">
                  <div className="text-[12px] font-bold uppercase tracking-[0.12em] text-app-ink-soft">Owed by</div>
                  {group.shops.map((shop) => {
                    const label = owedByLabel({ storeId: shop.storeId, sourceKind: group.lines.find((line) => line.storeId === shop.storeId)?.sourceKind ?? "adjustment" }, week.storeName);
                    return (
                      <div key={shop.storeId ?? "shopinbos"} className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <b>{label}</b> · {naira(shop.owed)} owed{shop.paid ? ` · ${naira(shop.paid)} paid` : ""}
                        </div>
                        {group.shops.length > 1 && shop.owedLineIds.length ? <MarkPaidButton lineIds={shop.owedLineIds} amountText={naira(shop.owed)} label={`Mark ${label} paid`} defaultMethod={shop.storeId ? "shop_paid" : "bank_transfer"} /> : null}
                      </div>
                    );
                  })}
                </div>

                {owedIds.length ? (
                  <div>
                    <MarkPaidButton lineIds={owedIds} amountText={naira(group.owed)} label="Mark everything paid" defaultMethod={allAirtime ? "airtime" : "bank_transfer"} size="md" />
                  </div>
                ) : null}

                <details className="border-t border-app-line pt-3">
                  <summary className="cursor-pointer font-bold">{group.lines.length} line{group.lines.length === 1 ? "" : "s"}</summary>
                  <ul className="m-0 mt-2 grid list-none gap-2 p-0">
                    {group.lines.map((line) => (
                      <li key={line.id} className="grid gap-1.5 rounded-[12px] border border-app-line p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <b>{naira(line.amount)}</b> · {isPayoutSourceKind(line.sourceKind) ? PAYOUT_SOURCE_LABELS[line.sourceKind] : line.sourceKind} · {owedByLabel(line, week.storeName)} · added {formatDate(line.createdAt)}
                          </div>
                          <Pill tone={STATUS_TONE[line.status] ?? "muted"}>{STATUS_LABEL[line.status] ?? line.status}</Pill>
                        </div>
                        {line.phone ? <div className="text-app-ink-soft">Airtime to {line.phone}{isAirtimeNetwork(line.network) ? ` (${AIRTIME_NETWORK_LABELS[line.network]})` : ""}</div> : null}
                        {line.note ? <div className="text-app-ink-soft">{line.note}</div> : null}
                        {line.status === "paid" ? (
                          <div className="text-app-ink-soft">
                            Paid {formatDate(line.paidAt)} · {isPayoutMethod(line.method) ? PAYOUT_METHOD_LABELS[line.method] : line.method}
                            {line.reference ? ` · ref ${line.reference}` : ""} · by {line.paidByName ?? "the team"}
                          </div>
                        ) : null}
                        {line.status === "owed" ? (
                          <div className="flex flex-wrap items-start gap-2">
                            <MarkPaidButton lineIds={[line.id]} amountText={naira(line.amount)} defaultMethod={line.sourceKind === "airtime_reward" ? "airtime" : line.storeId ? "shop_paid" : "bank_transfer"} />
                            <VoidLineButton lineId={line.id} />
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </details>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="mb-6">
          <EmptyState icon="coin" title={q || status || kind ? "Nothing matches" : "Nothing owed on this list"}>
            Resell commissions show here once the order is delivered. Add an airtime reward below.
          </EmptyState>
        </div>
      )}

      {isOpen ? (
        <Card className="mb-6 p-5">
          <CardHead title="Add an airtime reward" sub="For any account: it goes on this Friday's list. Mark it paid once the airtime is sent." />
          <AddRewardForm />
        </Card>
      ) : null}

      <Card className="p-5">
        <CardHead title="Weeks" />
        <ul className="m-0 flex list-none flex-col divide-y divide-app-line p-0">
          {weeks.map((row) => (
            <li key={row.payday} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[13.5px]">
              <Link href={withParams("/admin/payouts", { week: row.payday === week.openPayday ? undefined : row.payday })} className={`font-bold underline-offset-2 hover:underline ${row.payday === week.payday ? "text-app-ink" : ""}`}>
                {friday(row.payday)}
              </Link>
              <span className="text-app-ink-soft">
                {naira(row.paid)} paid · {naira(row.owed)} owed · {row.lines} line{row.lines === 1 ? "" : "s"} · {row.status === "paid" ? `closed ${formatDate(row.closedAt)}` : "open"}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </AppPage>
  );
}
