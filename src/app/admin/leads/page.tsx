import { AppPage, EmptyState, FilterChips, Pill, PillLink, SearchForm, StatTile, type Tone } from "@/components/app-kit";
import { adminFrame, buttonClass, fieldClass, withParams } from "@/components/admin/AdminKit";
import { addLeadManually, importLeadsCsv, replyToLead, setWebsiteLeadStatus } from "@/app/actions/admin-website-leads";
import { Notice } from "@/components/app-ui";
import { CHANNEL_LABELS, LEAD_ROLES, type LeadChannel } from "@/lib/lead-growth/pure";
import { leadMessages } from "@/lib/lead-growth/service.server";
import { KIND_LABELS, LEAD_STATUSES, STATUS_LABELS, type LeadStatus } from "@/lib/website-leads/pure";
import { LEADS_PAGE_SIZE, LeadsNotReady, listWebsiteLeads } from "@/lib/website-leads/service.server";
import { requireRole } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type Search = { kind?: string; status?: string; role?: string; noted?: string; q?: string; page?: string; added?: string; imported?: string; skipped?: string; error?: string; saved?: string; savedStatus?: string };

const ROLE_NAMES = { seller: "Seller", supplier: "Supplier", delivery: "Delivery partner" } as const;

const STATUS_TONE: Record<string, Tone> = { new: "accent", contacted: "info", converted: "success", closed: "muted" };

function when(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" }).format(date);
}

function waLink(phone: string) {
  return `https://wa.me/${phone.replace(/\D/g, "")}`;
}

// /admin/leads: everyone who filled a form on shopinbos.com (newsletter, WhatsApp tips, guide downloads, tools,
// contact). The website sends each one here as it comes in.
export default async function AdminLeadsPage(props: { searchParams?: Promise<Search> }) {
  const user = await requireRole(["admin"], "/admin/login");
  const frame = adminFrame(user, "Search leads");
  const search = (await props.searchParams) ?? {};
  // Everyone by default: messaged leads move to "Contacted" by themselves, so a "New" default hid most of them.
  const status = search.status && ([...LEAD_STATUSES, "all"] as string[]).includes(search.status) ? search.status : "all";
  const kind = search.kind && KIND_LABELS[search.kind] ? search.kind : undefined;
  const role = search.role && search.role in ROLE_NAMES ? search.role : undefined;
  const noted = search.noted === "1";
  const q = search.q?.trim() || undefined;
  const page = Math.max(1, Number(search.page) || 1);

  let data: Awaited<ReturnType<typeof listWebsiteLeads>>;
  try {
    data = await listWebsiteLeads({ kind, status, role, noted, q, page });
  } catch (error) {
    if (!(error instanceof LeadsNotReady)) throw error;
    return (
      <AppPage frame={frame} title="Website leads" sub="Forms filled on shopinbos.com.">
        <EmptyState icon="list" title="Website leads need a quick database update">
          Run docs/migrations/2026-10-18-website-leads.sql and docs/migrations/2026-11-05-lead-growth.sql on the Supabase database, and set WEBSITE_LEADS_SECRET here and SIB_LEADS_SECRET on the website. Until then the website keeps the leads and retries every hour.
        </EmptyState>
      </AppPage>
    );
  }

  const keep = { kind, q, role, noted: noted ? "1" : undefined, status: status === "all" ? undefined : status };
  // The view a Save returns to (the lead may move to another status tab; the notice says where).
  const here = `?${new URLSearchParams(Object.entries({ ...keep, page: page > 1 ? String(page) : undefined }).filter((entry): entry is [string, string] => Boolean(entry[1])))}`;
  const savedLead = search.saved ? data.rows.find((lead) => lead.id === search.saved) : null;
  const savedStatus = search.savedStatus && (LEAD_STATUSES as readonly string[]).includes(search.savedStatus) ? (search.savedStatus as LeadStatus) : null;
  // Messages each lead on this page got from lead campaigns and automations (none before the lead-growth migration).
  const history = await leadMessages(data.rows.map((lead) => lead.id)).catch(() => []);
  const sentTo = (leadId: string) => history.filter((m) => m.leadId === leadId);
  const pages = Math.max(1, Math.ceil(data.total / LEADS_PAGE_SIZE));
  const total30 = Object.values(data.kindCounts30d).reduce((a, b) => a + b, 0);

  return (
    <AppPage
      frame={frame}
      title="Website leads"
      sub="Everyone who left their details on shopinbos.com: newsletter, WhatsApp tips, guide downloads, tools and the contact form."
      actions={
        <>
          <PillLink href="/admin/lead-campaigns" icon="megaphone">Campaigns</PillLink>
          <PillLink href={withParams("/api/admin/website-leads/export", { kind, q, status, role, noted: noted ? "1" : undefined })} icon="download">Download CSV</PillLink>
        </>
      }
    >
      {search.error && <div className="mb-4"><Notice>{search.error}</Notice></div>}
      {search.added && <div className="mb-4"><Notice tone="success">Lead added.</Notice></div>}
      {search.saved && (
        <div className="mb-4">
          <Notice tone="success">
            Saved{savedStatus ? `: the lead is in ${STATUS_LABELS[savedStatus]}` : ""}.{" "}
            {savedLead ? (
              <a href={`#lead-${savedLead.id}`} className="font-bold underline">Show it</a>
            ) : (
              <a href={withParams("/admin/leads", { status: savedStatus ?? undefined, q: undefined })} className="font-bold underline">It moved out of this view: open {savedStatus ? STATUS_LABELS[savedStatus] : "it"}</a>
            )}
            {" · "}
            <a href={withParams("/admin/leads", { noted: "1" })} className="font-bold underline">All leads with notes</a>
          </Notice>
        </div>
      )}
      {search.imported && <div className="mb-4"><Notice tone="success">Imported {search.imported} leads{Number(search.skipped) ? `; ${search.skipped} rows had no usable email or phone and were skipped` : ""}.</Notice></div>}

      <details className="mb-5 rounded-[20px] border border-app-line bg-white p-4 md:p-5">
        <summary className="cursor-pointer text-[15px] font-bold">Add leads from somewhere else</summary>
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <form action={addLeadManually} className="flex flex-col gap-3">
            <b className="text-[14px]">One person</b>
            <div className="grid gap-3 sm:grid-cols-2">
              <input name="name" placeholder="Name" maxLength={120} className={fieldClass} aria-label="Name" />
              <input name="source" placeholder="Where from (event, Instagram…)" maxLength={190} className={fieldClass} aria-label="Source" />
              <input name="email" type="email" placeholder="Email" maxLength={190} className={fieldClass} aria-label="Email" />
              <input name="phone" placeholder="Phone / WhatsApp" maxLength={32} className={fieldClass} aria-label="Phone" />
            </div>
            <input name="message" placeholder="Note or message (optional)" maxLength={2000} className={fieldClass} aria-label="Message" />
            <select name="as" defaultValue="seller" className={fieldClass} aria-label="They are a">
              {LEAD_ROLES.map((role) => <option key={role} value={role}>{ROLE_NAMES[role]}</option>)}
            </select>
            <label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="consent" className="h-[18px] w-[18px]" /> They agreed to get messages from us</label>
            <div><button type="submit" className={buttonClass("ink", "sm")}>Add lead</button></div>
          </form>
          <form action={importLeadsCsv} className="flex flex-col gap-3">
            <b className="text-[14px]">A CSV list</b>
            <p className="m-0 text-[13px] text-app-ink-soft">Columns by header: name, email, phone, source, consent (yes/no), role (seller / supplier / delivery). Up to 5,000 rows. The same email or phone twice is one lead; people who already have an account are marked signed up.</p>
            <input name="file" type="file" accept=".csv,text/csv" required className="text-[13.5px]" aria-label="CSV file" />
            <input name="source" placeholder="Source for every row (optional)" maxLength={190} className={fieldClass} aria-label="Source for every row" />
            <select name="as" defaultValue="seller" className={fieldClass} aria-label="Role for rows without one">
              {LEAD_ROLES.map((role) => <option key={role} value={role}>{ROLE_NAMES[role]}</option>)}
            </select>
            <label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="consent" className="h-[18px] w-[18px]" /> Everyone on this list agreed to get messages</label>
            <div><button type="submit" className={buttonClass("white", "sm")}>Import</button></div>
          </form>
        </div>
      </details>
      <section aria-label="Last 30 days" className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile tone="card" label="Last 30 days" value={total30} hint="All forms" />
        {Object.entries(KIND_LABELS).filter(([key]) => data.kindCounts30d[key]).map(([key, label]) => (
          <StatTile key={key} tone="card" label={label} value={data.kindCounts30d[key]} hint="Last 30 days" />
        ))}
      </section>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <FilterChips
          items={[
            ...["all" as const, ...LEAD_STATUSES].map((value) => ({
              label: value === "all" ? "All" : STATUS_LABELS[value as LeadStatus],
              href: withParams("/admin/leads", { ...keep, noted: undefined, status: value === "all" ? undefined : value }),
              count: value === "all" ? data.allCount : data.statusCounts[value] ?? 0,
              active: status === value && !noted,
            })),
            { label: "Has a note", href: withParams("/admin/leads", { ...keep, status: undefined, noted: "1" }), count: data.notedCount, active: noted },
          ]}
        />
        <SearchForm action="/admin/leads" defaultValue={q} placeholder="Name, email, phone, message or note" keep={{ kind, role, status: keep.status, noted: keep.noted }} />
      </div>
      <FilterChips
        className="mb-3"
        items={[{ label: "Everyone", href: withParams("/admin/leads", { ...keep, role: undefined }), active: !role }].concat(
          Object.entries(ROLE_NAMES).map(([key, label]) => ({ label: `${label}s`, href: withParams("/admin/leads", { ...keep, role: key }), active: role === key })),
        )}
      />
      <FilterChips
        className="mb-5"
        items={[{ label: "Every form", href: withParams("/admin/leads", { ...keep, kind: undefined }), active: !kind }].concat(
          Object.entries(KIND_LABELS).map(([key, label]) => ({ label, href: withParams("/admin/leads", { ...keep, kind: key }), active: kind === key })),
        )}
      />

      {data.rows.length === 0 ? (
        <EmptyState icon="list" title={q || kind || role || noted || status !== "all" ? "No leads match" : "No leads yet"}>
          {q || kind || role || noted || status !== "all" ? "Try another filter, or All." : "Sign-ups from the website show up here as they come in."}
        </EmptyState>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {data.rows.map((lead) => {
            const extra = lead.payload && typeof lead.payload === "object" && !Array.isArray(lead.payload) ? (lead.payload as Record<string, unknown>) : {};
            const details = Object.entries(extra).filter(([, v]) => v !== null && v !== "" && typeof v !== "object");
            return (
              <li key={lead.id} id={`lead-${lead.id}`} className={`scroll-mt-6 rounded-[20px] border bg-white p-4 md:p-5 ${lead.id === search.saved ? "border-app-ink ring-2 ring-app-ink/15" : "border-app-line"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="text-[15.5px]">{lead.name || lead.email || lead.phone || "No name"}</b>
                      <Pill tone={STATUS_TONE[lead.status] ?? "muted"} dot>{STATUS_LABELS[lead.status as LeadStatus] ?? lead.status}</Pill>
                      <Pill tone="muted">{KIND_LABELS[lead.kind] ?? lead.kind}</Pill>
                      {lead.role !== "seller" && <Pill tone="info">{ROLE_NAMES[lead.role as keyof typeof ROLE_NAMES] ?? lead.role}</Pill>}
                      {lead.consent && <Pill tone="success">Agreed to messages</Pill>}
                      {lead.convertedAt && <Pill tone="success">Has an account</Pill>}
                      {lead.optedOut.map((channel) => <Pill key={channel} tone="danger">No {CHANNEL_LABELS[channel as LeadChannel] ?? channel}</Pill>)}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13.5px] text-app-ink-soft">
                      <span>{when(lead.createdAt)}</span>
                      {lead.email && <a className="font-bold text-app-ink underline" href={`mailto:${lead.email}`}>{lead.email}</a>}
                      {lead.phone && <a className="font-bold text-app-ink underline" href={waLink(lead.phone)} target="_blank" rel="noreferrer">WhatsApp {lead.phone}</a>}
                      {lead.source && <span>From: {lead.source}</span>}
                      {lead.pageUrl && <a className="underline" href={lead.pageUrl} target="_blank" rel="noreferrer">Page</a>}
                    </div>
                    {lead.message && <p className="mb-0 mt-2 whitespace-pre-line text-[14px]">{lead.message}</p>}
                    {lead.note && (
                      <p className="mb-0 mt-2 whitespace-pre-line rounded-[12px] border border-[#F2D59B] bg-[#FFF8E6] px-3 py-2 text-[13.5px]">
                        <b>Team note:</b> {lead.note}
                      </p>
                    )}
                    {details.length > 0 && (
                      <p className="mb-0 mt-2 text-[13px] text-app-ink-soft">{details.map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}</p>
                    )}
                    {sentTo(lead.id).length > 0 && (
                      <p className="mb-0 mt-2 text-[13px] text-app-ink-soft">
                        Messages: {sentTo(lead.id).slice(0, 6).map((m) => `${CHANNEL_LABELS[m.channel as LeadChannel] ?? m.channel} ${m.status === "sent" ? "✓" : m.status} (${m.campaign?.name ?? m.automation?.name ?? "test"}, ${when(m.createdAt)})`).join(" · ")}
                      </p>
                    )}
                  </div>
                  <form action={replyToLead}>
                    <input type="hidden" name="id" value={lead.id} />
                    <button type="submit" className={buttonClass("ink", "sm")}>{lead.message ? "Reply" : "Message"}</button>
                  </form>
                  <form action={setWebsiteLeadStatus} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={lead.id} />
                    <input type="hidden" name="back" value={here} />
                    <label className="sr-only" htmlFor={`st-${lead.id}`}>Status</label>
                    <select id={`st-${lead.id}`} name="status" defaultValue={lead.status} className={`${fieldClass} !min-h-[40px] !w-auto`}>
                      {LEAD_STATUSES.map((value) => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}
                    </select>
                    <label className="sr-only" htmlFor={`nt-${lead.id}`}>Note</label>
                    <input id={`nt-${lead.id}`} name="note" defaultValue={lead.note ?? ""} placeholder={lead.note ? "Edit the note" : "Add a note"} maxLength={2000} className={`${fieldClass} !min-h-[40px] !w-[220px]`} />
                    <button type="submit" className={buttonClass("ink", "sm")}>Save</button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="mt-5 flex items-center justify-center gap-2">
          {page > 1 && <PillLink href={withParams("/admin/leads", { ...keep, page: String(page - 1) })}>Newer</PillLink>}
          <span className="text-[13.5px] text-app-ink-soft">Page {page} of {pages}</span>
          {page < pages && <PillLink href={withParams("/admin/leads", { ...keep, page: String(page + 1) })}>Older</PillLink>}
        </nav>
      )}
    </AppPage>
  );
}
