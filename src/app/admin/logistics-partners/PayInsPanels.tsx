import { assignUnmatchedPayIn, setUpPayInAccount } from "@/app/actions/admin-payins";
import { ListCard, Pill } from "@/components/app-kit";
import { buttonClass, fieldClass, formatDate, formatMoney } from "@/components/admin/AdminKit";

// Admin views of delivery partners' pay-ins: transfers we couldn't match (assign each to a partner, once), and one
// partner's pay-in account with the payments matched to it.

export interface UnmatchedPayInRow {
  id: string;
  amount: number;
  currency: string;
  accountNumber: string | null;
  senderName: string | null;
  senderBank: string | null;
  reference: string;
  paidAt: Date;
}

export function UnmatchedPayIns({ payIns, partners, returnTo }: { payIns: UnmatchedPayInRow[]; partners: Array<{ id: string; displayName: string }>; returnTo: string }) {
  if (!payIns.length) return null;
  return (
    <section id="payins" aria-labelledby="payins-title" className="mb-6 scroll-mt-6">
      <h2 id="payins-title" className="m-0 text-[20px] font-extrabold">Pay-ins to check ({payIns.length})</h2>
      <p className="mb-3 mt-1 max-w-[760px] text-[14.5px] text-app-ink-soft">
        Transfers into pay-in accounts that we couldn&apos;t match to a delivery partner. Assign each one to the right partner: it settles their oldest cash jobs and they get a note.
      </p>
      <ListCard>
        {payIns.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
            <div className="min-w-0 flex-1 basis-[240px]">
              <div className="text-[15px] font-extrabold">{formatMoney(row.amount, row.currency)} · {formatDate(row.paidAt)}</div>
              <div className="truncate text-[14px] text-app-ink-soft">
                {row.senderName ?? "Unknown sender"}{row.senderBank ? `, ${row.senderBank}` : ""} → account {row.accountNumber ?? "unknown"} · ref {row.reference}
              </div>
            </div>
            <form action={assignUnmatchedPayIn} className="flex min-w-0 flex-wrap items-center gap-2">
              <input type="hidden" name="payInId" value={row.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <label htmlFor={`assign-${row.id}`} className="sr-only">Delivery partner for this payment</label>
              <select id={`assign-${row.id}`} name="partnerId" required defaultValue="" className={`${fieldClass} w-auto min-w-[200px]`}>
                <option value="" disabled>Pick a partner</option>
                {partners.map((partner) => (
                  <option key={partner.id} value={partner.id}>{partner.displayName}</option>
                ))}
              </select>
              <button type="submit" className={buttonClass("ink", "sm")}>Assign</button>
            </form>
          </li>
        ))}
      </ListCard>
    </section>
  );
}

const ACCOUNT_STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "muted" }> = {
  assigned: { label: "Ready", tone: "success" },
  pending: { label: "Waiting for Paystack", tone: "warning" },
  failed: { label: "Couldn't set up", tone: "danger" },
  unavailable: { label: "Not available on Paystack", tone: "danger" },
};

export function PartnerPayInsPanel({
  partnerId,
  account,
  credit,
  payIns,
  remittances,
}: {
  partnerId: string;
  account: { status: string; accountNumber: string | null; accountName: string | null; bankName: string | null; customerCode: string | null; lastError: string | null; updatedAt: Date } | null;
  credit: number;
  payIns: Array<{ id: string; amount: number; reference: string; senderName: string | null; paidAt: Date; matchedBy: string | null }>;
  remittances: Array<{ id: string; amount: number; method: string; createdAt: Date; outcome: string | null; jobs: number }>;
}) {
  const status = account ? ACCOUNT_STATUS[account.status] ?? { label: account.status, tone: "muted" as const } : { label: "Not set up", tone: "muted" as const };
  return (
    <section id="payin-account" aria-labelledby="payin-account-title" className="mt-6 scroll-mt-6">
      <h2 id="payin-account-title" className="m-0 text-[20px] font-extrabold">Cash pay-ins</h2>
      <p className="mb-3 mt-1 max-w-[760px] text-[14.5px] text-app-ink-soft">
        The partner&apos;s own pay-in account (Paystack dedicated account). Transfers into it settle their cash from pay-on-delivery jobs automatically, oldest first.
      </p>
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="grid content-start gap-3 rounded-[18px] border border-app-line bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[15px] font-extrabold">Pay-in account</span>
            <Pill tone={status.tone} dot>{status.label}</Pill>
          </div>
          {account?.accountNumber ? (
            <div className="grid gap-0.5">
              <span className="font-mono text-[24px] font-extrabold tracking-[0.06em]">{account.accountNumber}</span>
              <span className="text-[15px]">{account.bankName} · {account.accountName}</span>
            </div>
          ) : (
            <p className="m-0 text-[14.5px] text-app-ink-soft">
              No account number yet. Until there is one, the partner sees the &quot;Tell us you paid in&quot; form.
              {account?.lastError ? ` Last reply from Paystack: ${account.lastError}` : ""}
            </p>
          )}
          <div className="text-[14px] text-app-ink-soft">
            {account?.customerCode ? `Paystack customer ${account.customerCode} · ` : ""}Credit kept: {formatMoney(credit)}
          </div>
          {account?.status !== "assigned" && (
            <form action={setUpPayInAccount}>
              <input type="hidden" name="partnerId" value={partnerId} />
              <button type="submit" className={buttonClass("white", "sm")}>{account ? "Try again now" : "Set up account now"}</button>
            </form>
          )}
        </div>
        <div className="grid content-start gap-3">
          <span className="text-[15px] font-extrabold">Matched payments</span>
          {payIns.length === 0 && remittances.length === 0 ? (
            <p className="m-0 rounded-[18px] border border-app-line bg-white p-5 text-[14.5px] text-app-ink-soft">No pay-ins yet.</p>
          ) : (
            <ListCard>
              {payIns.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
                  <span className="min-w-0 flex-1 truncate text-[14.5px]">
                    <b>{formatMoney(row.amount)}</b> · {formatDate(row.paidAt)} · {row.senderName ?? "transfer"} · ref {row.reference}
                  </span>
                  <Pill tone={row.matchedBy === "admin" ? "warning" : "success"} dot>{row.matchedBy === "admin" ? "Assigned by team" : "Matched"}</Pill>
                </li>
              ))}
              {remittances.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
                  <span className="min-w-0 flex-1 truncate text-[14.5px]">
                    <b>{formatMoney(row.amount)}</b> · {formatDate(row.createdAt)} · {row.method === "api" ? "their software" : row.method === "cash" ? "cash (told us)" : "transfer (told us)"} · {row.jobs} {row.jobs === 1 ? "job" : "jobs"}
                  </span>
                  <Pill tone="muted" dot>{row.outcome === "over" ? "Paid extra" : row.outcome === "under" ? "Part paid" : "Saved"}</Pill>
                </li>
              ))}
            </ListCard>
          )}
        </div>
      </div>
    </section>
  );
}
