import Link from "next/link";
import { markLatePayInSettled, recordPartnerPayInByTeam, unpauseLatePartner } from "@/app/actions/admin-payins";
import { ListCard, Pill } from "@/components/app-kit";
import { buttonClass, fieldClass, formatDate, formatMoney } from "@/components/admin/AdminKit";
import { lagosWhenWords, lateLevel } from "@/lib/logistics/payin-deadline";

// Admin views of late cash pay-ins (lib/logistics/payin-deadline.ts): the "Late pay-ins" list on the partners page
// and one partner's late pay-in section with its history of strikes. Buttons: "Mark as settled" (with a reason),
// "Unpause", and (on the partner page) recording a pay-in they made some other way.

export interface LatePayInRow {
  id: string;
  displayName: string;
  city: string;
  amount: number;
  since: Date;
  codPaused: boolean;
  escalatedAt: Date | null;
  reviewAt: Date | null;
  strikes: number;
  riders: Array<{ name: string; amount: number }>;
}

const LEVEL: Record<string, { label: string; tone: "warning" | "danger" }> = {
  late: { label: "Late", tone: "warning" },
  high: { label: "High priority · 24h+", tone: "danger" },
  review: { label: "Needs review · 72h+", tone: "danger" },
};

function LateActions({ partnerId, paused, returnTo }: { partnerId: string; paused: boolean; returnTo: string }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <form action={markLatePayInSettled} className="flex min-w-0 max-w-full items-center gap-2">
        <input type="hidden" name="partnerId" value={partnerId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <label htmlFor={`settle-${partnerId}`} className="sr-only">Why it&apos;s settled</label>
        <input id={`settle-${partnerId}`} name="reason" required minLength={3} maxLength={300} placeholder="Why it's settled" className={`${fieldClass} w-[260px] min-w-0 flex-1`} />
        <button type="submit" className={buttonClass("ink", "sm")}>Mark as settled</button>
      </form>
      {paused && (
        <form action={unpauseLatePartner}>
          <input type="hidden" name="partnerId" value={partnerId} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <button type="submit" className={buttonClass("white", "sm")}>Unpause</button>
        </form>
      )}
    </div>
  );
}

const ridersWords = (riders: LatePayInRow["riders"]) => (riders.length ? riders.map((rider) => `${rider.name} ${formatMoney(rider.amount)}`).join(" · ") : "No rider recorded");

export function LatePayIns({ rows, now, returnTo }: { rows: LatePayInRow[]; now: Date; returnTo: string }) {
  return (
    <section id="late-payins" aria-labelledby="late-payins-title" className="mb-6 scroll-mt-6">
      <h2 id="late-payins-title" className="m-0 text-[20px] font-extrabold">Late pay-ins ({rows.length})</h2>
      <p className="mb-3 mt-1 max-w-[760px] text-[14.5px] text-app-ink-soft">
        Delivery partners who missed the 6pm deadline to pay in customers&apos; cash. They&apos;re paused from new pay-when-it-arrives jobs (prepaid jobs still go to them) until they pay in. Nothing is suspended automatically: after 3 days, decide what happens.
      </p>
      {rows.length === 0 ? (
        <p className="m-0 rounded-[18px] border border-app-line bg-white p-5 text-[14.5px] text-app-ink-soft">Everyone has paid in on time.</p>
      ) : (
        <ListCard>
          {rows.map((row) => {
            const level = LEVEL[lateLevel({ payInEscalatedAt: row.escalatedAt, payInReviewAt: row.reviewAt })];
            return (
              <li key={row.id} className="grid gap-3 px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/logistics-partners/${row.id}#late-payin`} className="min-w-0 truncate text-[16px] font-extrabold text-app-ink hover:underline">{row.displayName}</Link>
                  <span className="text-[14px] text-app-ink-soft">{row.city}</span>
                  <Pill tone={level.tone} dot>{level.label}</Pill>
                  <Pill tone={row.codPaused ? "warning" : "muted"}>{row.codPaused ? "Paused from pay-when-it-arrives" : "Unpaused by the team"}</Pill>
                </div>
                <div className="grid gap-1 text-[14.5px]">
                  <span><b className="text-[18px] font-extrabold">{formatMoney(row.amount)}</b> overdue since {lagosWhenWords(row.since, now)} ({formatDate(row.since)}) · {row.strikes} {row.strikes === 1 ? "strike" : "strikes"}</span>
                  <span className="text-app-ink-soft">Riders holding the cash: {ridersWords(row.riders)}</span>
                </div>
                <LateActions partnerId={row.id} paused={row.codPaused} returnTo={returnTo} />
              </li>
            );
          })}
        </ListCard>
      )}
    </section>
  );
}

const EVENT_WORDS: Record<string, string> = {
  reminder: "Reminder sent",
  overdue: "Late: flagged and paused from pay-when-it-arrives jobs",
  escalated: "24 hours late: told again, high priority",
  review: "72 hours late: flagged for review",
  strike: "Strike (a day late)",
  cleared: "Paid in: back to all jobs",
  settled: "Marked as settled by the team",
  unpaused: "Unpaused by the team",
};

export function PartnerLatePayInPanel({
  partner,
  riders,
  events,
  now,
}: {
  partner: { id: string; codPaused: boolean; payInOverdueSince: Date | null; payInOverdueAmount: number; payInEscalatedAt: Date | null; payInReviewAt: Date | null; payInPauseWaived: boolean; payInStrikes: number };
  riders: LatePayInRow["riders"];
  events: Array<{ id: string; kind: string; amount: number | null; deadline: Date | null; note: string | null; createdAt: Date }>;
  now: Date;
}) {
  const back = `/admin/logistics-partners/${partner.id}`;
  const late = Boolean(partner.payInOverdueSince && partner.payInOverdueAmount > 0);
  const level = LEVEL[lateLevel(partner)];
  const history = events.filter((event) => event.kind !== "recheck");
  return (
    <section id="late-payin" aria-labelledby="late-payin-title" className="mt-6 scroll-mt-6">
      <h2 id="late-payin-title" className="m-0 text-[20px] font-extrabold">Late pay-ins</h2>
      <p className="mb-3 mt-1 max-w-[760px] text-[14.5px] text-app-ink-soft">
        Cash from pay-when-it-arrives jobs is due by 6pm (Lagos) the day it&apos;s collected. Late partners are paused from new pay-when-it-arrives jobs until they pay in; every day late is a strike and lowers their reliability score.
      </p>
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="grid content-start gap-3 rounded-[18px] border border-app-line bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[15px] font-extrabold">Now</span>
            {late ? <Pill tone={level.tone} dot>{level.label}</Pill> : partner.codPaused ? <Pill tone="warning" dot>Paused</Pill> : <Pill tone="success" dot>On time</Pill>}
          </div>
          {late && partner.payInOverdueSince ? (
            <div className="grid gap-1 text-[14.5px]">
              <span><b className="text-[22px] font-extrabold">{formatMoney(partner.payInOverdueAmount)}</b> overdue since {lagosWhenWords(partner.payInOverdueSince, now)} ({formatDate(partner.payInOverdueSince)})</span>
              <span className="text-app-ink-soft">{partner.codPaused ? "Paused from new pay-when-it-arrives jobs. Prepaid jobs still go to them." : partner.payInPauseWaived ? "Unpaused by the team: still getting pay-when-it-arrives jobs." : "Not paused."}</span>
              <span className="text-app-ink-soft">Riders holding the cash: {ridersWords(riders)}</span>
            </div>
          ) : (
            <p className="m-0 text-[14.5px] text-app-ink-soft">Nothing overdue.</p>
          )}
          <div className="text-[14px] text-app-ink-soft">Strikes so far: {partner.payInStrikes}</div>
          {(late || partner.codPaused) && <LateActions partnerId={partner.id} paused={partner.codPaused} returnTo={back} />}
          <form action={recordPartnerPayInByTeam} className="grid gap-2 border-t border-app-line pt-3">
            <span className="text-[14.5px] font-extrabold">Record a pay-in they made another way</span>
            <input type="hidden" name="partnerId" value={partner.id} />
            <input type="hidden" name="returnTo" value={back} />
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="team-payin-amount" className="sr-only">Amount in naira</label>
              <input id="team-payin-amount" name="amount" type="number" min="1" step="any" inputMode="decimal" required placeholder="₦ amount" className={`${fieldClass} w-[140px]`} />
              <label htmlFor="team-payin-method" className="sr-only">How they paid</label>
              <select id="team-payin-method" name="method" defaultValue="transfer" className={`${fieldClass} w-[150px]`}>
                <option value="transfer">Bank transfer</option>
                <option value="cash">Cash</option>
              </select>
              <label htmlFor="team-payin-note" className="sr-only">Note</label>
              <input id="team-payin-note" name="note" maxLength={300} placeholder="Note (optional)" className={`${fieldClass} w-[200px] max-w-full`} />
              <button type="submit" className={buttonClass("white", "sm")}>Save pay-in</button>
            </div>
          </form>
        </div>
        <div className="grid content-start gap-3">
          <span className="text-[15px] font-extrabold">History</span>
          {history.length === 0 ? (
            <p className="m-0 rounded-[18px] border border-app-line bg-white p-5 text-[14.5px] text-app-ink-soft">No late pay-ins yet.</p>
          ) : (
            <ListCard>
              {history.map((event) => (
                <li key={event.id} className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
                  <span className="min-w-0 flex-1 text-[14.5px]">
                    <b>{EVENT_WORDS[event.kind] ?? event.kind}</b>
                    {event.amount ? ` · ${formatMoney(event.amount)}` : ""}
                    {event.deadline && event.kind !== "reminder" ? ` · due ${lagosWhenWords(event.deadline, now)}` : ""}
                    {event.note ? ` · “${event.note}”` : ""}
                  </span>
                  <span className="text-[13.5px] text-app-ink-soft">{formatDate(event.createdAt)}</span>
                </li>
              ))}
            </ListCard>
          )}
        </div>
      </div>
    </section>
  );
}
