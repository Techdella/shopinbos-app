import { AppPage, EmptyState, FilterChips, Pill, PillLink, SearchForm, StatTile, type Tone } from "@/components/app-kit";
import { adminFrame, buttonClass, fieldClass, withParams } from "@/components/admin/AdminKit";
import { setWebsiteLeadStatus } from "@/app/actions/admin-website-leads";
import { KIND_LABELS, LEAD_STATUSES, STATUS_LABELS, type LeadStatus } from "@/lib/website-leads/pure";
import { LEADS_PAGE_SIZE, LeadsNotReady, listWebsiteLeads } from "@/lib/website-leads/service.server";
import { requireRole } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type Search = { kind?: string; status?: string; q?: string; page?: string };

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
  const status = search.status && ([...LEAD_STATUSES, "all"] as string[]).includes(search.status) ? search.status : "new";
  const kind = search.kind && KIND_LABELS[search.kind] ? search.kind : undefined;
  const q = search.q?.trim() || undefined;
  const page = Math.max(1, Number(search.page) || 1);

  let data: Awaited<ReturnType<typeof listWebsiteLeads>>;
  try {
    data = await listWebsiteLeads({ kind, status, q, page });
  } catch (error) {
    if (!(error instanceof LeadsNotReady)) throw error;
    return (
      <AppPage frame={frame} title="Website leads" sub="Forms filled on shopinbos.com.">
        <EmptyState icon="list" title="Website leads need a quick database update">
          Run docs/migrations/2026-10-18-website-leads.sql on the Supabase database, and set WEBSITE_LEADS_SECRET here and SIB_LEADS_SECRET on the website. Until then the website keeps the leads and retries every hour.
        </EmptyState>
      </AppPage>
    );
  }

  const keep = { kind, q, status: status === "new" ? undefined : status };
  const pages = Math.max(1, Math.ceil(data.total / LEADS_PAGE_SIZE));
  const total30 = Object.values(data.kindCounts30d).reduce((a, b) => a + b, 0);

  return (
    <AppPage
      frame={frame}
      title="Website leads"
      sub="Everyone who left their details on shopinbos.com: newsletter, WhatsApp tips, guide downloads, tools and the contact form."
      actions={<PillLink href={withParams("/api/admin/website-leads/export", { kind, q, status })} icon="download">Download CSV</PillLink>}
    >
      <section aria-label="Last 30 days" className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile tone="card" label="Last 30 days" value={total30} hint="All forms" />
        {Object.entries(KIND_LABELS).filter(([key]) => data.kindCounts30d[key]).map(([key, label]) => (
          <StatTile key={key} tone="card" label={label} value={data.kindCounts30d[key]} hint="Last 30 days" />
        ))}
      </section>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <FilterChips
          items={[...LEAD_STATUSES, "all" as const].map((value) => ({
            label: value === "all" ? "All" : STATUS_LABELS[value as LeadStatus],
            href: withParams("/admin/leads", { ...keep, status: value === "new" ? undefined : value }),
            count: value === "all" ? undefined : data.statusCounts[value] ?? 0,
            active: status === value,
          }))}
        />
        <SearchForm action="/admin/leads" defaultValue={q} placeholder="Name, email, phone or message" keep={{ kind, status: keep.status }} />
      </div>
      <FilterChips
        className="mb-5"
        items={[{ label: "Every form", href: withParams("/admin/leads", { ...keep, kind: undefined }), active: !kind }].concat(
          Object.entries(KIND_LABELS).map(([key, label]) => ({ label, href: withParams("/admin/leads", { ...keep, kind: key }), active: kind === key })),
        )}
      />

      {data.rows.length === 0 ? (
        <EmptyState icon="list" title={q || kind || status !== "new" ? "No leads match" : "No new leads"}>
          {q || kind || status !== "new" ? "Try another filter." : "New sign-ups from the website show up here as they come in."}
        </EmptyState>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {data.rows.map((lead) => {
            const extra = lead.payload && typeof lead.payload === "object" && !Array.isArray(lead.payload) ? (lead.payload as Record<string, unknown>) : {};
            const details = Object.entries(extra).filter(([, v]) => v !== null && v !== "" && typeof v !== "object");
            return (
              <li key={lead.id} className="rounded-[20px] border border-app-line bg-white p-4 md:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="text-[15.5px]">{lead.name || lead.email || lead.phone || "No name"}</b>
                      <Pill tone={STATUS_TONE[lead.status] ?? "muted"} dot>{STATUS_LABELS[lead.status as LeadStatus] ?? lead.status}</Pill>
                      <Pill tone="muted">{KIND_LABELS[lead.kind] ?? lead.kind}</Pill>
                      {lead.consent && <Pill tone="success">Agreed to messages</Pill>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13.5px] text-app-ink-soft">
                      <span>{when(lead.createdAt)}</span>
                      {lead.email && <a className="font-bold text-app-ink underline" href={`mailto:${lead.email}`}>{lead.email}</a>}
                      {lead.phone && <a className="font-bold text-app-ink underline" href={waLink(lead.phone)} target="_blank" rel="noreferrer">WhatsApp {lead.phone}</a>}
                      {lead.source && <span>From: {lead.source}</span>}
                      {lead.pageUrl && <a className="underline" href={lead.pageUrl} target="_blank" rel="noreferrer">Page</a>}
                    </div>
                    {lead.message && <p className="mb-0 mt-2 whitespace-pre-line text-[14px]">{lead.message}</p>}
                    {details.length > 0 && (
                      <p className="mb-0 mt-2 text-[13px] text-app-ink-soft">{details.map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}</p>
                    )}
                  </div>
                  <form action={setWebsiteLeadStatus} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={lead.id} />
                    <label className="sr-only" htmlFor={`st-${lead.id}`}>Status</label>
                    <select id={`st-${lead.id}`} name="status" defaultValue={lead.status} className={`${fieldClass} !min-h-[40px] !w-auto`}>
                      {LEAD_STATUSES.map((value) => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}
                    </select>
                    <label className="sr-only" htmlFor={`nt-${lead.id}`}>Note</label>
                    <input id={`nt-${lead.id}`} name="note" defaultValue={lead.note ?? ""} placeholder="Note" className={`${fieldClass} !min-h-[40px] !w-[200px]`} />
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
