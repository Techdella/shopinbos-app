import Link from "next/link";
import { AppPage, Card, CardHead, EmptyState, Pill, PillLink, StatTile, type Tone } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { adminFrame, buttonClass, fieldClass } from "@/components/admin/AdminKit";
import { importLeadsCsv } from "@/app/actions/admin-website-leads";
import { addOutreachSequences, addWhatsAppSequences, connectWhatsAppInbox, submitInboxTemplates, submitWhatsAppTemplates, toggleLeadAutomation } from "@/app/actions/admin-lead-growth";
import { LEAD_ROLES, ROLE_LABELS, type LeadRole } from "@/lib/lead-growth/pure";
import { LeadGrowthNotReady, listAutomations, whatsappOverview } from "@/lib/lead-growth/service.server";
import { OUTREACH_AUTOMATIONS, OUTREACH_EMAIL, OUTREACH_SOURCE, WHATSAPP_AUTOMATIONS, WHATSAPP_TEMPLATES, templatePreviewText, templatesUsed, type WhatsAppTemplate } from "@/lib/lead-growth/whatsapp-content";
import { metaPhoneInfo, metaTemplates, metaWhatsAppConfig, type MetaTemplateStatus } from "@/lib/lead-growth/whatsapp-meta.server";
import { requireRole } from "@/lib/server-auth";
import { inboxWhatsAppStatus } from "@/lib/support/whatsapp.server";
import { GrowthNotReady, lagosTime } from "../_shared";
import { PendingButton } from "@/components/admin/PendingButton";
import { MEMBER_TEMPLATES } from "@/lib/member-messaging/whatsapp-templates";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// /admin/lead-campaigns/whatsapp: WhatsApp for website leads, from Shopinbos's own number on Meta's Cloud API.
// The number's status, the launch templates Meta has to approve (submit them from here), the WhatsApp launch
// sequences per role, partnership outreach to imported lists (suppliers, delivery partners, well-known sellers),
// who WhatsApp can reach, and the latest messages.

const STATUS_TONE: Record<string, Tone> = { APPROVED: "success", PENDING: "warning", IN_APPEAL: "warning", REJECTED: "danger", PAUSED: "danger", DISABLED: "danger" };
const MSG_TONE: Record<string, Tone> = { sent: "success", failed: "danger", skipped: "muted", sending: "info" };

const mask = (phone: string) => (phone.length > 6 ? `${phone.slice(0, 4)}•••${phone.slice(-3)}` : phone || "-");

type Search = { error?: string; submitted?: string; connected?: string; imported?: string; skipped?: string };

const OUTREACH_NAMES = new Set(OUTREACH_AUTOMATIONS.map((a) => a.name));
const OUTREACH_ROLE: Record<LeadRole, string> = { supplier: "Suppliers", delivery: "Delivery / logistics companies", seller: "Sellers (free store offer)" };
type Automation = Awaited<ReturnType<typeof listAutomations>>[number];

export default async function LeadWhatsAppPage(props: { searchParams?: Promise<Search> }) {
  const user = await requireRole(["admin"], "/admin/login");
  const frame = adminFrame(user, "Search leads");
  const search = (await props.searchParams) ?? {};
  const config = metaWhatsAppConfig();
  const sub = "Message website leads on WhatsApp from Shopinbos's own number on Meta. No third-party provider.";

  let overview: Awaited<ReturnType<typeof whatsappOverview>>;
  let automations: Awaited<ReturnType<typeof listAutomations>>;
  try {
    [overview, automations] = await Promise.all([whatsappOverview(), listAutomations()]);
  } catch (error) {
    if (!(error instanceof LeadGrowthNotReady)) throw error;
    return (
      <AppPage frame={frame} title="WhatsApp" sub={sub}>
        <GrowthNotReady />
      </AppPage>
    );
  }
  const [phone, metaList, inbox] = config ? await Promise.all([metaPhoneInfo(config), metaTemplates(config), inboxWhatsAppStatus().catch(() => null)]) : [null, null, null];
  const onMeta = new Map<string, MetaTemplateStatus>((metaList?.ok ? metaList.templates : []).map((t) => [`${t.name}:${t.language}`, t]));
  const statusOf = (name: string, language: string) => onMeta.get(`${name}:${language}`) ?? null;
  const approved = (name: string) => WHATSAPP_TEMPLATES.some((t) => t.name === name && statusOf(t.name, t.language)?.status === "APPROVED");
  const waAutomations = automations.filter((a) => a.steps.some((step) => step.channel === "whatsapp") && !OUTREACH_NAMES.has(a.name));
  const outreachAutomations = automations.filter((a) => OUTREACH_NAMES.has(a.name));
  const missingSequences = WHATSAPP_AUTOMATIONS.some((a) => !automations.some((have) => have.name === a.name));
  const missingOutreach = OUTREACH_AUTOMATIONS.some((a) => !automations.some((have) => have.name === a.name));
  const canSubmit = Boolean(config?.wabaId);
  // "Submit all" also sends the members' templates (referrals, weekly tips, journeys), so count those too: once the
  // launch templates were all approved, the button vanished and the member ones had nowhere to be submitted from.
  const missingLaunch = WHATSAPP_TEMPLATES.filter((t) => !statusOf(t.name, t.language)).length;
  const missingMembers = MEMBER_TEMPLATES.filter((t) => !statusOf(t.name, t.language)).length;
  const missingTemplates = missingLaunch + missingMembers;
  const reachTotal = Object.values(overview.reachableByRole).reduce((a, b) => a + b, 0);

  return (
    <AppPage
      frame={frame}
      title="WhatsApp"
      sub={sub}
      actions={
        <>
          <PillLink href="/admin/lead-campaigns" icon="arrowLeft">Campaigns</PillLink>
          <PillLink href="/admin/lead-campaigns/new?channel=whatsapp" tone="ink" icon="whatsapp">New WhatsApp campaign</PillLink>
        </>
      }
    >
      {search.error && <div className="mb-4"><Notice>{search.error}</Notice></div>}
      {search.connected && <div className="mb-4"><Notice tone="success">Connected. Messages to the number now arrive in Admin › Inbox.</Notice></div>}
      {search.imported && <div className="mb-4"><Notice tone="success">Added {search.imported} people to the outreach list{Number(search.skipped) ? `; ${search.skipped} rows had no usable phone number and were skipped` : ""}.</Notice></div>}
      {search.submitted && <div className="mb-4"><Notice tone="success">Sent {search.submitted} template{search.submitted === "1" ? "" : "s"} to Meta for review. Approval usually takes minutes, sometimes up to a day.</Notice></div>}

      <section aria-label="Reach" className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile tone="card" label="Reachable on WhatsApp" value={reachTotal} hint={`${overview.consented} agreed to messages`} />
        {(Object.keys(ROLE_LABELS) as LeadRole[]).map((role) => (
          <StatTile key={role} tone="card" label={ROLE_LABELS[role]} value={overview.reachableByRole[role] ?? 0} hint="With a phone number" />
        ))}
        <StatTile tone="card" label="Sent, last 30 days" value={overview.last30.sent ?? 0} hint={`${overview.last30.failed ?? 0} failed`} />
        <StatTile tone="card" label="Opted out" value={overview.optedOut} hint="Never messaged again" />
      </section>

      <Card className="mb-5 p-5">
        <CardHead title="Your WhatsApp number" />
        {!config ? (
          <div className="flex flex-col gap-2 text-[14px]">
            <p className="m-0">Not connected yet. Add these in Vercel (Settings › Environment Variables), then redeploy:</p>
            <ul className="m-0 pl-5 text-[13.5px]">
              <li><span className="font-mono">WHATSAPP_LEADS_TOKEN</span>: a System User token from Meta Business Settings with <i>whatsapp_business_messaging</i> and <i>whatsapp_business_management</i></li>
              <li><span className="font-mono">WHATSAPP_LEADS_PHONE_NUMBER_ID</span>: WhatsApp Manager › Phone numbers › your number's ID</li>
              <li><span className="font-mono">WHATSAPP_LEADS_WABA_ID</span>: your WhatsApp Business Account ID (to submit and track templates)</li>
            </ul>
            <p className="m-0 text-[13px] text-app-ink-soft">The number that sends sign-in codes (WHATSAPP_OTP_TOKEN / WHATSAPP_OTP_PHONE_NUMBER_ID) is used if those are set and these aren't.</p>
          </div>
        ) : phone && phone.ok ? (
          <div className="flex flex-wrap items-center gap-2 text-[14.5px]">
            <b>{phone.number}</b>
            <span className="text-app-ink-soft">{phone.name}</span>
            <Pill tone={phone.quality === "GREEN" ? "success" : phone.quality === "YELLOW" ? "warning" : phone.quality === "RED" ? "danger" : "muted"} dot>Quality: {phone.quality.toLowerCase()}</Pill>
            {!config.wabaId && <Pill tone="warning">Add WHATSAPP_LEADS_WABA_ID to manage templates</Pill>}
          </div>
        ) : (
          <Notice>Meta didn't accept the number's details: {phone?.ok === false ? phone.error : "unknown error"}. Check the token and phone number ID.</Notice>
        )}
      </Card>

      {config && inbox && (
        <Card className="mb-5 p-5">
          <CardHead
            title="Inbox: replies and new chats"
            sub="Replies to your lead messages, and anyone who messages the number, arrive in Admin › Inbox. The team answers there and can start chats with these templates."
            action={<PillLink href="/admin/support?channel=whatsapp" size="sm" icon="chat">Open the inbox</PillLink>}
          />
          <div className="flex flex-wrap items-center gap-2 text-[14px]">
            {inbox.wabaSubscribed ? (
              <Pill tone="success" dot>Receiving messages</Pill>
            ) : (
              <>
                <Pill tone="warning" dot>{inbox.wabaSubscribed === false ? "Not receiving messages yet" : "Couldn't check (add WHATSAPP_LEADS_WABA_ID)"}</Pill>
                {config.wabaId && (
                  <form action={connectWhatsAppInbox}>
                    <button type="submit" className={buttonClass("ink", "sm")}>Connect to the inbox</button>
                  </form>
                )}
              </>
            )}
          </div>
          <p className="mb-0 mt-2 text-[12.5px] text-app-ink-soft">
            The Meta app&apos;s WhatsApp webhook must point at <span className="font-mono">https://app.shopinbos.com/api/webhooks/whatsapp</span> with the &quot;messages&quot; field on, signed with META_APP_SECRET (or WHATSAPP_LEADS_APP_SECRET).
          </p>
          <ul className="m-0 mt-3 grid list-none gap-2 p-0">
            {inbox.templates.map((t) => (
              <li key={t.name} className="flex flex-wrap items-center gap-2 text-[13.5px]">
                <span className="font-mono text-[12.5px]">{t.name}</span>
                <span className="text-app-ink-soft">{t.purpose}</span>
                <Pill tone={t.status ? STATUS_TONE[t.status] ?? "muted" : "muted"}>{t.status ? t.status.toLowerCase() : "not submitted"}</Pill>
                {t.reason && <span className="text-app-danger">{t.reason}</span>}
              </li>
            ))}
          </ul>
          {config.wabaId && inbox.templates.some((t) => !t.status) && (
            <form action={submitInboxTemplates} className="mt-3">
              <button type="submit" className={buttonClass("ink", "sm")}>Submit the inbox templates to Meta</button>
            </form>
          )}
        </Card>
      )}

      <Card className="mb-5 p-5">
        <CardHead
          title="Launch templates"
          sub="WhatsApp only lets a business start a chat with a template Meta has approved. Each has the lead's first name and their opt-out link."
          action={
            config?.wabaId && missingTemplates > 0 ? (
              <form action={submitWhatsAppTemplates}>
                <PendingButton pending="Submitting to Meta… (up to a minute)" className={buttonClass("ink", "sm")}>
                  Submit {missingTemplates} to Meta{missingMembers ? ` (${missingMembers} for members)` : ""}
                </PendingButton>
              </form>
            ) : undefined
          }
        />
        {metaList && !metaList.ok && config?.wabaId && <div className="mb-3"><Notice>Couldn't read templates from Meta: {metaList.error}</Notice></div>}
        <TemplateList templates={WHATSAPP_TEMPLATES.filter((t) => t.use !== "outreach")} statusOf={statusOf} canSubmit={canSubmit} />
      </Card>

      <Card className="mb-5 p-5">
        <CardHead
          title="WhatsApp launch sequences"
          sub="Run alongside the email sequences: a welcome an hour after someone joins, registration day for partners, launch day and one reminder. Each stops when the lead signs up or opts out."
          action={
            missingSequences ? (
              <form action={addWhatsAppSequences}>
                <button type="submit" className={buttonClass("white", "sm")}>Add WhatsApp sequences</button>
              </form>
            ) : undefined
          }
        />
        {waAutomations.length === 0 ? (
          <EmptyState icon="whatsapp" title="No WhatsApp sequences yet">Add them, get the templates approved, then switch them on.</EmptyState>
        ) : (
          <SequenceList automations={waAutomations} approved={approved} connected={Boolean(config)} />
        )}
      </Card>

      <Card className="mb-5 scroll-mt-24 p-5" id="outreach">
        <CardHead
          title="Partnership outreach"
          sub={`First contact with suppliers, delivery companies and well-known sellers who haven't heard of us: an introduction, a follow-up 3 days later and a last note 4 days after that. Anyone who replies (or sends STOP) gets no more follow-ups, and the chat lands in Admin › Inbox. They can also email ${OUTREACH_EMAIL}.`}
        />
        <ol className="m-0 mb-4 grid gap-1 pl-5 text-[13.5px]">
          <li>Submit the 9 outreach templates below to Meta and wait for them to be approved.</li>
          <li>Upload each list as a CSV: one file per group, with a <span className="font-mono">phone</span> column (0803… or +234803…) and a <span className="font-mono">name</span> column if you have one.</li>
          <li>Add the outreach sequences and turn on the ones you want. Messages go out in sending hours, at most one a day per person.</li>
        </ol>
        <section aria-label="Outreach lists" className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(["supplier", "delivery", "seller"] as const).map((role) => (
            <StatTile key={role} tone="card" label={OUTREACH_ROLE[role]} value={overview.outreachByRole[role] ?? 0} hint="On the outreach list, not signed up" />
          ))}
        </section>
        <details className="mb-4 rounded-[14px] border border-app-line p-3">
          <summary className="cursor-pointer text-[14px] font-bold">Upload a phone number list (CSV)</summary>
          <form action={importLeadsCsv} className="mt-3 flex max-w-[520px] flex-col gap-3">
            <input type="hidden" name="source" value={OUTREACH_SOURCE} />
            <input type="hidden" name="back" value="whatsapp" />
            <p className="m-0 text-[13px] text-app-ink-soft">Columns by header: phone (or whatsapp / mobile), name, email, role. Up to 5,000 rows, 2 MB. The same number twice is one person; anyone who already has a Shopinbos account is left out.</p>
            <input name="file" type="file" accept=".csv,text/csv" required className="text-[13.5px]" aria-label="CSV file" />
            <select name="as" defaultValue="supplier" className={fieldClass} aria-label="Who is on this list">
              {LEAD_ROLES.map((role) => <option key={role} value={role}>{OUTREACH_ROLE[role]}</option>)}
            </select>
            <div><button type="submit" className={buttonClass("ink", "sm")}>Add to the outreach list</button></div>
          </form>
        </details>
        <h3 className="m-0 mb-1 text-[14.5px] font-bold">Outreach templates</h3>
        <TemplateList templates={WHATSAPP_TEMPLATES.filter((t) => t.use === "outreach")} statusOf={statusOf} canSubmit={canSubmit} />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="m-0 text-[14.5px] font-bold">Outreach sequences</h3>
          {missingOutreach && (
            <form action={addOutreachSequences}>
              <button type="submit" className={buttonClass("white", "sm")}>Add outreach sequences</button>
            </form>
          )}
        </div>
        {outreachAutomations.length === 0 ? (
          <p className="m-0 mt-2 text-[13.5px] text-app-ink-soft">Not added yet. They start switched off.</p>
        ) : (
          <SequenceList automations={outreachAutomations} approved={approved} connected={Boolean(config)} />
        )}
      </Card>

      <Card className="p-5">
        <CardHead title="Latest WhatsApp messages" />
        {overview.recent.length === 0 ? (
          <p className="m-0 text-[13.5px] text-app-ink-soft">None yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-app-line text-[12px] text-app-ink-soft">
                  <th className="py-2 pr-3 font-bold">When</th>
                  <th className="py-2 pr-3 font-bold">To</th>
                  <th className="py-2 pr-3 font-bold">From</th>
                  <th className="py-2 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {overview.recent.map((message) => (
                  <tr key={message.id} className="border-b border-app-line last:border-0">
                    <td className="py-2 pr-3">{lagosTime(message.createdAt)}</td>
                    <td className="py-2 pr-3">{message.lead.name || "No name"} <span className="font-mono text-app-ink-soft">{mask(message.to)}</span></td>
                    <td className="py-2 pr-3">{message.campaign?.name ?? message.automation?.name ?? "-"}</td>
                    <td className="py-2"><Pill tone={MSG_TONE[message.status] ?? "muted"} dot>{message.status}</Pill>{message.error && <span className="ml-2 text-[12.5px] text-app-ink-soft">{message.error.slice(0, 120)}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AppPage>
  );
}

function TemplateList(props: { templates: WhatsAppTemplate[]; statusOf: (name: string, language: string) => MetaTemplateStatus | null; canSubmit: boolean }) {
  return (
    <ul className="m-0 flex list-none flex-col divide-y divide-app-line p-0">
      {props.templates.map((template) => {
        const status = props.statusOf(template.name, template.language);
        return (
          <li key={template.name} className="py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="font-mono text-[13.5px]">{template.name}</b>
                  <Pill tone="muted">{ROLE_LABELS[template.role]}</Pill>
                  {status ? <Pill tone={STATUS_TONE[status.status] ?? "muted"} dot>{status.status.toLowerCase().replace(/_/g, " ")}</Pill> : <Pill tone="muted">Not on Meta yet</Pill>}
                </div>
                <p className="mb-0 mt-1 text-[13px] text-app-ink-soft">{template.purpose}{status?.reason ? ` · Rejected: ${status.reason.toLowerCase().replace(/_/g, " ")}` : ""}</p>
                <details className="mt-1.5">
                  <summary className="cursor-pointer text-[13px] font-bold">Preview</summary>
                  <div className="mt-2 max-w-[420px] whitespace-pre-line rounded-[14px] bg-[#ECE5DD] p-3 text-[13.5px]">
                    <div className="rounded-[12px] rounded-tl-[4px] bg-white px-3 py-2">{templatePreviewText(template)}</div>
                    <div className="mt-1.5 rounded-[12px] bg-white px-3 py-2 text-center font-bold text-[#00A5F4]">{template.button.text}</div>
                  </div>
                </details>
              </div>
              {props.canSubmit && (!status || status.status === "REJECTED") && (
                <form action={submitWhatsAppTemplates}>
                  <input type="hidden" name="name" value={template.name} />
                  <button type="submit" className={buttonClass("white", "sm")}>{status ? "Resubmit" : "Submit to Meta"}</button>
                </form>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function SequenceList(props: { automations: Automation[]; approved: (name: string) => boolean; connected: boolean }) {
  return (
    <ul className="m-0 flex list-none flex-col divide-y divide-app-line p-0">
      {props.automations.map((automation) => {
        const needed = templatesUsed(automation.steps);
        const ready = needed.filter(props.approved).length;
        const blocked = !props.connected || ready < needed.length;
        return (
          <li key={automation.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/admin/lead-campaigns/automations/${automation.id}`} className="text-[15.5px] font-bold underline-offset-2 hover:underline">{automation.name}</Link>
                <Pill tone={automation.active ? "success" : "muted"} dot>{automation.active ? "On" : "Off"}</Pill>
                <Pill tone={ready === needed.length ? "success" : "warning"}>{ready}/{needed.length} templates approved</Pill>
              </div>
              <p className="mb-0 mt-1 text-[13px] text-app-ink-soft">
                {automation.steps.length} messages · {automation.enrolled} entered · {automation.sent} sent · <b className="text-app-ink">{automation.converted} signed up</b>
              </p>
            </div>
            <form action={toggleLeadAutomation}>
              <input type="hidden" name="id" value={automation.id} />
              <input type="hidden" name="active" value={automation.active ? "0" : "1"} />
              <button type="submit" className={buttonClass(automation.active ? "white" : "ink", "sm")} disabled={!automation.active && blocked} title={!automation.active && blocked ? "Connect the number and get its templates approved first" : undefined}>
                {automation.active ? "Turn off" : "Turn on"}
              </button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
