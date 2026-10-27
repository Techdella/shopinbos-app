import type { Metadata } from "next";
import { AppPage, EmptyState, FilterChips, Pill, type Tone } from "@/components/app-kit";
import { PendingButton } from "@/components/admin/PendingButton";
import { CountRow, adminFrame, buttonClass, formatDate, withParams } from "@/components/admin/AdminKit";
import { requireAdminSection } from "@/lib/admin-team/service.server";
import { adminReferrals } from "@/lib/referrals/service.server";
import { memberTemplateStatuses } from "@/lib/member-messaging/templates.server";
import { MEMBER_TEMPLATES, memberTemplatePreview } from "@/lib/member-messaging/whatsapp-templates";
import { REFERRAL_OFFERS, asReferralRole, rewardText, welcomeText } from "@shared/referrals";
import { announcementState } from "@/lib/member-messaging/announce.server";
import { decideReferral, submitReferralTemplates, toggleReferralAnnouncement } from "./actions";

export const dynamic = "force-dynamic";
// Submitting templates uploads each banner to Meta: give the action time to finish.
export const maxDuration = 300;
export const metadata: Metadata = { title: "Referrals" };

// Admin › Referrals: every invite (who invited whom, how far they are, what each side got), counting one by hand or
// turning it down, and the referral WhatsApp templates on Meta. The rules and amounts are in shared/referrals.ts.

const FILTERS = ["signed_up", "rewarded", "rejected", "all"] as const;
type Filter = (typeof FILTERS)[number];
const LABEL: Record<Filter, string> = { signed_up: "On their way", rewarded: "Rewarded", rejected: "Didn't count", all: "All" };
const TONE: Record<string, Tone> = { signed_up: "warning", qualified: "info", rewarded: "success", rejected: "muted" };
const ROLE: Record<string, string> = { seller: "Seller", supplier: "Supplier", logistics_partner: "Delivery partner" };

export default async function AdminReferralsPage(props: { searchParams?: Promise<{ status?: string; submitted?: string; error?: string }> }) {
  const user = await requireAdminSection("leads");
  const params = (await props.searchParams) ?? {};
  const status = (FILTERS as readonly string[]).includes(params.status ?? "") ? (params.status as Filter) : "signed_up";
  const [{ rows, counts }, templates, announce] = await Promise.all([adminReferrals(status), memberTemplateStatuses().catch(() => null), announcementState()]);
  const back = withParams("/admin/referrals", { status });
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return (
    <AppPage
      frame={adminFrame(user, "Search")}
      title="Referrals"
      sub="Businesses invited by sellers, suppliers and delivery partners. Rewards are given automatically when an invite counts; you can count one by hand or turn it down."
      toolbar={<FilterChips items={FILTERS.map((value) => ({ label: LABEL[value], href: withParams("/admin/referrals", { status: value }), active: status === value, count: value === "all" ? total : counts[value] ?? 0 }))} />}
    >
      {(params.submitted || params.error) && (
        <p role="status" className={`mb-4 rounded-[14px] px-4 py-3 text-[14.5px] font-bold ${params.error ? "bg-app-danger-tint text-app-danger" : "bg-app-success-tint text-app-success"}`}>
          {params.error ?? `${params.submitted} template${params.submitted === "1" ? "" : "s"} sent to Meta for approval.`}
        </p>
      )}

      <CountRow
        items={[
          { label: "Joined with an invite", value: total },
          { label: "On their way", value: counts.signed_up ?? 0 },
          { label: "Rewarded", value: counts.rewarded ?? 0 },
          { label: "Didn't count", value: counts.rejected ?? 0 },
        ]}
      />

      <section aria-labelledby="ref-announce" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-app-line bg-white p-5">
        <div className="min-w-0 flex-1">
          <h2 id="ref-announce" className="m-0 text-[17px] font-extrabold">Tell everyone about Refer &amp; earn</h2>
          <p className="m-0 mt-1 text-[13.5px] leading-[1.5] text-app-ink-soft">
            One email to every seller, supplier and delivery partner with their own link (and the WhatsApp invite once it&apos;s approved). Sent in batches each hour, Mon–Sat 08:00–20:00, each person once.
            {announce.startedAt ? ` Started ${new Date(announce.startedAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}: ${announce.sent} sent${announce.active ? ", still going" : announce.finishedAt ? ", finished" : ""}.` : ""}
          </p>
        </div>
        <form action={toggleReferralAnnouncement}>
          <input type="hidden" name="start" value={announce.active ? "0" : "1"} />
          <input type="hidden" name="back" value={back} />
          <PendingButton pending="Saving…" className={buttonClass(announce.active ? "white" : "ink", "sm")}>{announce.active ? "Pause" : announce.startedAt ? "Resume" : "Start sending"}</PendingButton>
        </form>
      </section>

      <section className="mb-6 grid gap-3 md:grid-cols-3" aria-label="The offers">
        {Object.values(REFERRAL_OFFERS).map((offer) => (
          <div key={offer.role} className="rounded-[18px] border border-app-line bg-white p-4 text-[13.5px] leading-[1.5]">
            <p className="m-0 text-[15px] font-extrabold">Refer {offer.noun}</p>
            <p className="m-0 mt-1"><span className="font-bold">Inviter:</span> {offer.referrerMonths} months free or {offer.referrerCredits} credits</p>
            <p className="m-0"><span className="font-bold">New account:</span> {welcomeText(offer.role)}</p>
            <p className="m-0 text-app-ink-soft">Counts when: {offer.rule.toLowerCase()}</p>
          </div>
        ))}
      </section>

      {rows.length === 0 ? (
        <EmptyState icon="send" title="No invites here yet">When someone joins with an invite link, they show up here.</EmptyState>
      ) : (
        <ul className="m-0 mb-8 grid list-none gap-2 p-0">
          {rows.map((row) => {
            const role = asReferralRole(row.refereeRole);
            const reward = (row.referrerReward ?? null) as { months?: number; credits?: number; paying?: boolean } | null;
            return (
              <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[16px] border border-app-line bg-white px-4 py-3 text-[13.5px]">
                <span className="min-w-[220px] flex-1">
                  <span className="font-bold">{row.refereeName}</span> <span className="text-app-ink-soft">({ROLE[row.refereeRole] ?? row.refereeRole})</span>
                  <span className="block text-[12.5px] text-app-ink-soft">
                    invited by <span className="font-semibold text-app-ink">{row.referrerName}</span> ({ROLE[row.referrer?.role ?? ""] ?? "—"}) · code {row.code}{row.source === "profile" ? " · from their profile" : ""} · {formatDate(row.createdAt)}
                  </span>
                  <span className="block text-[12.5px] text-app-ink-soft">{[row.referee?.email, row.referee?.phone].filter(Boolean).join(" · ")}</span>
                </span>
                <Pill tone={TONE[row.status] ?? "muted"} dot>{row.status === "signed_up" ? "On their way" : row.status === "rewarded" ? `Rewarded: ${rewardText({ months: reward?.months ?? 0, credits: reward?.credits ?? 0 })}` : row.status === "rejected" ? row.reason ?? "Didn't count" : row.status}</Pill>
                {row.status === "signed_up" && role && (
                  <span className="flex flex-wrap gap-2">
                    <form action={decideReferral}>
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="decision" value="reward" />
                      <input type="hidden" name="back" value={back} />
                      <PendingButton pending="Counting…" className={buttonClass("ink", "sm")}>Count it now</PendingButton>
                    </form>
                    <form action={decideReferral}>
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="decision" value="reject" />
                      <input type="hidden" name="back" value={back} />
                      <PendingButton pending="Saving…" className={buttonClass("danger", "sm")}>Turn down</PendingButton>
                    </form>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <section aria-labelledby="ref-templates" className="rounded-[20px] border border-app-line bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="ref-templates" className="m-0 text-[18px] font-extrabold">WhatsApp templates</h2>
            <p className="m-0 mt-1 text-[13.5px] text-app-ink-soft">Meta has to approve these before they can be sent. &ldquo;Joined&rdquo;, &ldquo;reward&rdquo; and &ldquo;welcome&rdquo; go out automatically; the three invites are for campaigns.</p>
          </div>
          <form action={submitReferralTemplates}>
            <input type="hidden" name="back" value={back} />
            <PendingButton pending="Submitting to Meta… (up to a minute)" className={buttonClass("ink", "sm")}>Submit the missing ones</PendingButton>
          </form>
        </div>
        {templates && !templates.ok && <p className="mb-0 mt-3 text-[13px] text-app-danger">{templates.error}</p>}
        <ul className="m-0 mt-4 grid list-none gap-3 p-0 md:grid-cols-2">
          {MEMBER_TEMPLATES.map((template) => {
            const meta = templates?.ok ? templates.byName.get(`${template.name}:${template.language}`) : undefined;
            const state = meta?.status ?? "NOT SUBMITTED";
            return (
              <li key={template.name} className="rounded-[16px] border border-app-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[12.5px] font-bold">{template.name}</span>
                  <Pill tone={state === "APPROVED" ? "success" : state === "REJECTED" ? "danger" : state === "NOT SUBMITTED" ? "muted" : "warning"}>{state.toLowerCase()}</Pill>
                </div>
                <p className="m-0 mt-1 text-[12.5px] text-app-ink-soft">{template.purpose} · {template.category.toLowerCase()}</p>
                {meta?.reason && <p className="m-0 mt-1 text-[12.5px] text-app-danger">{meta.reason}</p>}
                <img src={`/brand/members/${template.image}.jpg`} alt="" className="mt-3 w-full rounded-[10px] border border-app-line" />
                <p className="mb-0 mt-3 whitespace-pre-wrap text-[13px] leading-[1.5]">{memberTemplatePreview(template)}</p>
                <p className="mb-0 mt-2 text-[12.5px] font-bold">Button: {template.button.text}</p>
              </li>
            );
          })}
        </ul>
      </section>
    </AppPage>
  );
}
