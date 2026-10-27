import { notFound } from "next/navigation";
import { AppPage, Card, CardHead, EmptyState, FilterChips, Pill, PillLink, StatTile, type Tone } from "@/components/app-kit";
import { adminFrame, buttonClass, withParams } from "@/components/admin/AdminKit";
import { Notice } from "@/components/app-ui";
import { ConfirmSubmit } from "@/components/growth/ConfirmSubmit";
import {
  autoPickPilot,
  decidePilotApplicant,
  deletePilotProgram,
  invitePilotLeads,
  notifyPilotDecisions,
  remindPilotLeads,
  setPilotClosed,
  waitlistPilotRest,
} from "@/app/actions/admin-pilot";
import {
  APPLICANT_STATUSES,
  APPLICANT_STATUS_LABELS,
  AVAILABILITY_LABELS,
  DEVICE_LABELS,
  PILOT_ROLES,
  PILOT_ROLE_LABELS,
  PILOT_ROLE_NAME,
  canDecide,
  deadlineText,
  pilotIsClosed,
  type ApplicantStatus,
  type PilotRole,
} from "@/lib/pilot/pure";
import { PilotNotReady, getProgram, previewInvites } from "@/lib/pilot/service.server";
import { requireRole } from "@/lib/server-auth";
import { PilotNotReadyState, ProgramForm } from "../_form";

export const dynamic = "force-dynamic";
// Sending invitations, reminders and outcomes runs in the page's server actions.
export const maxDuration = 300;

type Search = {
  role?: string;
  status?: string;
  error?: string;
  saved?: string;
  invited?: string;
  reminded?: string;
  failed?: string;
  remaining?: string;
  picked?: string;
  waitlistedRest?: string;
  notifiedIn?: string;
  notifiedWave?: string;
};

const STATUS_TONE: Record<string, Tone> = { invited: "muted", applied: "accent", selected: "success", waitlisted: "info", declined: "muted" };

function when(date: Date | null) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" }).format(date);
}

function Step({ n, title, children, action }: { n: number; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3.5">
      <div className="flex min-w-0 max-w-[640px] gap-3">
        <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-app-ink font-mono text-[12px] font-bold text-white">{n}</span>
        <div className="min-w-0">
          <b className="text-[14.5px]">{title}</b>
          <p className="m-0 mt-0.5 text-[13px] text-app-ink-soft">{children}</p>
        </div>
      </div>
      {action}
    </li>
  );
}

// /admin/pilot/[id]: one pilot. Send the invitations and the reminder, close replies, pick testers (by hand or the
// earliest replies up to each target), then email everyone the outcome.
export default async function PilotProgramPage(props: { params: Promise<{ id: string }>; searchParams?: Promise<Search> }) {
  const user = await requireRole(["admin"], "/admin/login");
  const frame = adminFrame(user, "Search leads");
  const { id } = await props.params;
  const search = (await props.searchParams) ?? {};

  let program: Awaited<ReturnType<typeof getProgram>>;
  try {
    program = await getProgram(id);
  } catch (error) {
    if (!(error instanceof PilotNotReady)) throw error;
    return (
      <AppPage frame={frame} title="Pilot testing">
        <PilotNotReadyState />
      </AppPage>
    );
  }
  if (!program) notFound();
  const [consented, everyone] = await Promise.all([
    previewInvites({ roles: [...PILOT_ROLES], includeNoConsent: false, textChannel: program.textChannel }),
    previewInvites({ roles: [...PILOT_ROLES], includeNoConsent: true, textChannel: program.textChannel }),
  ]);

  const closed = pilotIsClosed(program);
  const role = search.role && (PILOT_ROLES as readonly string[]).includes(search.role) ? (search.role as PilotRole) : undefined;
  const status = search.status && (APPLICANT_STATUSES as readonly string[]).includes(search.status) ? (search.status as ApplicantStatus) : undefined;
  const view = new URLSearchParams({ ...(role ? { role } : {}), ...(status ? { status } : {}) }).toString();
  const rows = program.applicants.filter((a) => (!role || a.role === role) && (!status || a.status === status));
  const count = (r: string | undefined, s: string) => program.applicants.filter((a) => (!r || a.role === r) && a.status === s).length;
  const replied = (r?: string) => count(r, "applied") + count(r, "selected") + count(r, "waitlisted");
  const notInvited = program.applicants.filter((a) => !a.invitedAt).length;
  const failedInvites = program.applicants.filter((a) => a.inviteError).length;
  const toRemind = program.applicants.filter((a) => a.status === "invited" && a.invitedAt && !a.inviteError && !a.remindedAt).length;
  const toNotify = program.applicants.filter((a) => (a.status === "selected" || a.status === "waitlisted") && !a.notifiedAt && a.email).length;
  const base = `/admin/pilot/${program.id}`;

  return (
    <AppPage
      frame={frame}
      title={program.name}
      sub={`${closed ? "Replies closed" : "Replies close"} ${deadlineText(program.closesAt)} (Lagos time).`}
      actions={
        <>
          <PillLink href="/admin/pilot" icon="list">All pilots</PillLink>
          <PillLink href={`/api/admin/pilot/export?id=${program.id}`} icon="download">Download CSV</PillLink>
        </>
      }
    >
      {search.error && <div className="mb-4"><Notice>{search.error}</Notice></div>}
      {search.saved && <div className="mb-4"><Notice tone="success">Saved.</Notice></div>}
      {search.invited !== undefined && (
        <div className="mb-4">
          <Notice tone={Number(search.failed) ? "info" : "success"}>
            Sent {search.invited} invitations{Number(search.failed) ? `; ${search.failed} couldn't be sent (see the list)` : ""}.{Number(search.remaining) ? ` ${search.remaining} still to send: press Send invitations again.` : ""}
          </Notice>
        </div>
      )}
      {search.reminded !== undefined && <div className="mb-4"><Notice tone="success">Sent {search.reminded} reminders{Number(search.failed) ? `; ${search.failed} failed` : ""}.{Number(search.remaining) ? ` ${search.remaining} still to send: press the button again.` : ""}</Notice></div>}
      {search.picked !== undefined && <div className="mb-4"><Notice tone="success">Selected {search.picked} more {Number(search.picked) === 1 ? "person" : "people"} from the earliest replies.</Notice></div>}
      {search.waitlistedRest !== undefined && <div className="mb-4"><Notice tone="success">Moved {search.waitlistedRest} to the next wave.</Notice></div>}
      {search.notifiedIn !== undefined && (
        <div className="mb-4">
          <Notice tone={Number(search.failed) ? "info" : "success"}>
            Emailed {search.notifiedIn} testers and {search.notifiedWave} people in the next wave{Number(search.failed) ? `; ${search.failed} failed (press again to retry)` : ""}.{Number(search.remaining) ? ` ${search.remaining} still to send.` : ""}
          </Notice>
        </div>
      )}

      <section aria-label="Overview" className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile tone="card" label="Invited" value={program.applicants.length} hint={`${replied()} replied`} />
        {program.roles.map((r) => (
          <StatTile key={r} tone="card" label={PILOT_ROLE_LABELS[r as PilotRole] ?? r} value={`${count(r, "selected")} / ${program.targets[r as PilotRole] ?? 0}`} hint={`selected · ${replied(r)} replied of ${program.applicants.filter((a) => a.role === r).length}`} />
        ))}
      </section>

      <Card className="mb-5 p-5">
        <CardHead title="Steps" />
        <ol className="m-0 flex list-none flex-col divide-y divide-app-line p-0">
          <Step
            n={1}
            title="Send invitations"
            action={
              !closed && (
                <form action={invitePilotLeads}>
                  <input type="hidden" name="id" value={program.id} />
                  <ConfirmSubmit message="Send the pilot invitation to everyone who matches and hasn't had it yet?" className={buttonClass(program.invitedAt ? "white" : "ink", "sm")}>
                    {program.invitedAt ? "Invite new matches" : "Send invitations"}
                  </ConfirmSubmit>
                </form>
              )
            }
          >
            {program.invitedAt
              ? `First sent ${when(program.invitedAt)}. ${program.applicants.length - notInvited - failedInvites} delivered${failedInvites ? `, ${failedInvites} couldn't be sent` : ""}${notInvited ? `, ${notInvited} still to send` : ""}. Leads who join the waitlist later are invited when you press it again.`
              : "Email for everyone with an address; the text channel you chose for people with only a phone number. Each person gets their own reply link."}
          </Step>
          <Step
            n={2}
            title="Send one reminder"
            action={
              !closed && program.invitedAt && toRemind > 0 && (
                <form action={remindPilotLeads}>
                  <input type="hidden" name="id" value={program.id} />
                  <ConfirmSubmit message={`Remind the ${toRemind} people who haven't replied?`} className={buttonClass("white", "sm")}>Remind {toRemind}</ConfirmSubmit>
                </form>
              )
            }
          >
            {program.remindedAt ? `Sent ${when(program.remindedAt)}. ` : "About 48 hours before the deadline works best. "}Only people who haven&apos;t replied get it, once.
          </Step>
          <Step
            n={3}
            title="Close replies"
            action={
              program.invitedAt && (
                <form action={setPilotClosed}>
                  <input type="hidden" name="id" value={program.id} />
                  <input type="hidden" name="closed" value={closed ? "0" : "1"} />
                  <button type="submit" className={buttonClass("white", "sm")}>{closed ? "Open again" : "Close now"}</button>
                </form>
              )
            }
          >
            {closed ? "Closed: the reply link now says replies are closed." : `Closes by itself ${deadlineText(program.closesAt)}. People can change their reply until then.`}
          </Step>
          <Step
            n={4}
            title="Pick testers"
            action={
              <div className="flex flex-wrap gap-2">
                <form action={autoPickPilot}>
                  <input type="hidden" name="id" value={program.id} />
                  <button type="submit" className={buttonClass("white", "sm")}>Fill places with earliest replies</button>
                </form>
                <form action={waitlistPilotRest}>
                  <input type="hidden" name="id" value={program.id} />
                  <ConfirmSubmit message="Move everyone who replied and isn't selected to the next wave?" className={buttonClass("white", "sm")}>Rest to next wave</ConfirmSubmit>
                </form>
              </div>
            }
          >
            Select people one by one below, or fill each group up to its target with whoever replied first. Look for a mix of cities and kinds of business.
          </Step>
          <Step
            n={5}
            title="Tell everyone"
            action={
              closed && toNotify > 0 && (
                <form action={notifyPilotDecisions}>
                  <input type="hidden" name="id" value={program.id} />
                  <ConfirmSubmit message={`Email the ${toNotify} people selected or in the next wave? This can't be undone.`} className={buttonClass("ink", "sm")}>Email {toNotify}</ConfirmSubmit>
                </form>
              )
            }
          >
            Testers get &quot;You&apos;re in&quot; with where to sign up and their test checklist; the next wave hears they&apos;re first in line. {closed ? "" : "Available once replies close."}
          </Step>
        </ol>
      </Card>

      <div className="mb-3 flex flex-col gap-3">
        <FilterChips
          items={[{ label: "Everyone", href: withParams(base, { status }), active: !role, count: program.applicants.length }].concat(
            program.roles.map((r) => ({ label: PILOT_ROLE_LABELS[r as PilotRole] ?? r, href: withParams(base, { status, role: r }), active: role === r, count: program.applicants.filter((a) => a.role === r).length })),
          )}
        />
        <FilterChips
          items={[{ label: "Any status", href: withParams(base, { role }), active: !status, count: undefined as number | undefined }].concat(
            APPLICANT_STATUSES.map((s) => ({ label: APPLICANT_STATUS_LABELS[s], href: withParams(base, { role, status: s }), active: status === s, count: count(role, s) })),
          )}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="list" title={program.applicants.length ? "Nobody matches" : "Nobody invited yet"}>
          {program.applicants.length ? "Try another filter." : "Press Send invitations above. Everyone invited shows up here with their reply."}
        </EmptyState>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {rows.map((a) => (
            <li key={a.id} id={`a-${a.id}`} className="scroll-mt-6 rounded-[20px] border border-app-line bg-white p-4 md:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-[15.5px]">{a.name || a.email || a.phone || "No name"}</b>
                    <Pill tone={STATUS_TONE[a.status] ?? "muted"} dot>{APPLICANT_STATUS_LABELS[a.status as ApplicantStatus] ?? a.status}</Pill>
                    <Pill tone="muted">{PILOT_ROLE_NAME[a.role as PilotRole] ?? a.role}</Pill>
                    {a.lead?.convertedUserId && <Pill tone="success">Has an account</Pill>}
                    {a.lead && !a.lead.consent && <Pill tone="muted">Didn&apos;t tick consent</Pill>}
                    {a.notifiedAt && <Pill tone="info">Told {when(a.notifiedAt)}</Pill>}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13.5px] text-app-ink-soft">
                    {a.email && <a className="font-bold text-app-ink underline" href={`mailto:${a.email}`}>{a.email}</a>}
                    {a.phone && <span>{a.phone}</span>}
                    {a.appliedAt && <span>Replied {when(a.appliedAt)}</span>}
                    {a.invitedAt && !a.appliedAt && <span>Invited {when(a.invitedAt)}{a.inviteChannel ? ` by ${a.inviteChannel === "sms" ? "SMS" : a.inviteChannel === "whatsapp" ? "WhatsApp" : "email"}` : ""}{a.remindedAt ? ", reminded" : ""}</span>}
                  </div>
                  {a.appliedAt && (
                    <p className="mb-0 mt-2 text-[13.5px]">
                      {[a.businessName, a.city, a.businessType].filter(Boolean).join(" · ")}
                      {a.devices.length > 0 && <> · {a.devices.map((d) => DEVICE_LABELS[d as keyof typeof DEVICE_LABELS] ?? d).join(", ")}</>}
                      {a.availability && <> · {AVAILABILITY_LABELS[a.availability as keyof typeof AVAILABILITY_LABELS] ?? a.availability}</>}
                    </p>
                  )}
                  {a.note && <p className="mb-0 mt-1.5 whitespace-pre-line text-[13.5px] text-app-ink-soft">&ldquo;{a.note}&rdquo;</p>}
                  {a.inviteError && <p className="mb-0 mt-1.5 text-[13px] text-app-danger">Invitation not sent: {a.inviteError}</p>}
                </div>
                {!a.notifiedAt && canDecide(a.status) && (
                  <div className="flex flex-wrap gap-2">
                    {(["selected", "waitlisted", "applied"] as const)
                      .filter((s) => s !== a.status)
                      .map((s) => (
                        <form key={s} action={decidePilotApplicant}>
                          <input type="hidden" name="applicantId" value={a.id} />
                          <input type="hidden" name="status" value={s} />
                          <input type="hidden" name="view" value={view} />
                          <button type="submit" className={buttonClass(s === "selected" ? "ink" : "white", "sm")}>{s === "selected" ? "Select" : s === "waitlisted" ? "Next wave" : "Undo"}</button>
                        </form>
                      ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <details className="mt-6 rounded-[20px] border border-app-line bg-white p-4 md:p-5">
        <summary className="cursor-pointer text-[15px] font-bold">Pilot settings</summary>
        <div className="mt-4">
          <ProgramForm
            values={{ id: program.id, name: program.name, closesAt: program.closesAt, roles: program.roles, targets: program.targets, includeNoConsent: program.includeNoConsent, textChannel: program.textChannel }}
            reach={{ consented, everyone }}
          />
          {!program.invitedAt && (
            <form action={deletePilotProgram} className="mt-4">
              <input type="hidden" name="id" value={program.id} />
              <ConfirmSubmit message="Delete this pilot? Nothing has been sent yet." className={buttonClass("danger", "sm")}>Delete pilot</ConfirmSubmit>
            </form>
          )}
        </div>
      </details>
    </AppPage>
  );
}
