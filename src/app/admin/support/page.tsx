import { AppPage, EmptyState, FilterChips, MoreActions, PillLink, SearchForm, StatTile } from "@/components/app-kit";
import { adminFrame, withParams } from "@/components/admin/AdminKit";
import { SupportFilters, SupportQueue, type DeskRow } from "@/components/support/admin/SupportQueue";
import { PeggyAutoReply } from "@/components/support/admin/PeggyAutoReply";
import { aiConfigured } from "@/lib/ai/client";
import { peggySettings } from "@/lib/support/peggy.server";
import { formatMinutes } from "@/lib/support/pure";
import { QUEUE_PAGE_SIZE, supportQueue, supportReady, supportStats } from "@/lib/support/service.server";
import { requireRole } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type Search = { status?: string; priority?: string; topic?: string; portal?: string; channel?: string; assignee?: string; q?: string; page?: string };

const STATUS_CHIPS = [
  { value: "active", label: "Open and waiting" },
  { value: "open", label: "Open" },
  { value: "pending", label: "Waiting on customer" },
  { value: "solved", label: "Solved" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
] as const;

export default async function AdminSupportPage(props: { searchParams?: Promise<Search> }) {
  const user = await requireRole(["admin"], "/admin/login");
  const frame = adminFrame(user, "Search support tickets");

  if (!(await supportReady())) {
    return (
      <AppPage frame={frame} title="Inbox" sub="Email, WhatsApp, in-app chat and the Stuck? form.">
        <EmptyState icon="chat" title="Support needs a quick database update">
          Run docs/migrations/2026-10-12-support.sql on the Supabase database. Until then the Stuck? form emails {process.env.SUPPORT_INBOX?.trim() || "support@shopinbos.com"} and the in-app chat offers WhatsApp and email.
        </EmptyState>
      </AppPage>
    );
  }

  const search = (await props.searchParams) ?? {};
  const status = STATUS_CHIPS.some((chip) => chip.value === search.status) ? search.status! : "active";
  const filters = { status, priority: search.priority || undefined, topic: search.topic || undefined, portal: search.portal || undefined, channel: search.channel || undefined, assignee: search.assignee || undefined, q: search.q?.trim() || undefined };
  const page = Math.max(1, Number(search.page) || 1);
  const [queue, stats, peggy] = await Promise.all([supportQueue(user.id, { ...filters, page }), supportStats(), peggySettings()]);
  const now = Date.now();

  const keep = { ...filters, status: status === "active" ? undefined : status };
  const countFor = (value: string) =>
    value === "active" ? queue.counts.open + queue.counts.pending : value === "all" ? undefined : queue.counts[value as "open" | "pending" | "solved" | "closed"];
  const rows: DeskRow[] = queue.rows.map((row) => ({
    id: row.id,
    number: row.number,
    name: row.name,
    email: row.email,
    phone: row.phone,
    subject: row.subject,
    topic: row.topic,
    portal: row.portal,
    status: row.status,
    priority: row.priority,
    source: row.source,
    assigneeName: row.assigneeName,
    firstResponseDueAt: row.firstResponseDueAt?.toISOString() ?? null,
    firstRespondedAt: row.firstRespondedAt?.toISOString() ?? null,
    lastMessageAt: row.lastMessageAt.toISOString(),
    unread: row.unread,
    preview: row.preview,
    lastFromCustomer: row.lastFromCustomer,
  }));
  const pages = Math.max(1, Math.ceil(queue.total / QUEUE_PAGE_SIZE));

  return (
    <AppPage
      frame={frame}
      title="Inbox"
      sub="Every conversation in one place: WhatsApp to our number, emails to support@, in-app chat and the Stuck? form."
      actions={
        <>
          <PillLink href="/admin/support/new" tone="ink" icon="plus">New conversation</PillLink>
          <MoreActions>
            <PillLink href="/admin/support/macros" icon="list">Saved replies</PillLink>
            <PillLink href={withParams("/admin/support", { assignee: "me" })} icon="user">My tickets · {queue.counts.mine}</PillLink>
          </MoreActions>
        </>
      }
    >
      <PeggyAutoReply initial={peggy.autoReply} aiReady={aiConfigured()} />

      <section aria-label="Support today" className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        <StatTile tone="card" label="Open" value={stats.open} hint={`${queue.counts.unassigned} unassigned`} />
        <StatTile tone="card" label="Overdue first reply" value={<span className={stats.overdue ? "text-app-danger" : undefined}>{stats.overdue}</span>} hint="Past the SLA with no reply" />
        <StatTile tone="card" label="Waiting on customer" value={stats.pending} />
        <StatTile tone="card" label="Solved today" value={stats.solvedToday} hint={`${stats.newToday} new today`} />
        <StatTile
          tone="card"
          label="Median first reply"
          value={stats.medianFirstResponseMinutes === null ? "-" : formatMinutes(stats.medianFirstResponseMinutes)}
          hint={`Last 30 days · ${stats.respondedCount} tickets`}
        />
        <StatTile
          tone="card"
          label="CSAT"
          value={stats.csat.score === null ? "-" : `${stats.csat.score}%`}
          hint={stats.csat.count ? `${stats.csat.average}/5 average · ${stats.csat.count} ratings` : "No ratings in 30 days"}
        />
      </section>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <FilterChips items={STATUS_CHIPS.map((chip) => ({ label: chip.label, href: withParams("/admin/support", { ...keep, status: chip.value === "active" ? undefined : chip.value }), count: countFor(chip.value), active: chip.value === status }))} />
        <SearchForm action="/admin/support" defaultValue={filters.q} placeholder="Ticket number, name, email or text" keep={{ ...keep, q: undefined }} />
      </div>
      <div className="mb-4">
        <SupportFilters filters={{ ...keep }} admins={queue.admins} meId={user.id} />
      </div>

      {rows.length ? (
        <SupportQueue rows={rows} now={now} />
      ) : (
        <EmptyState icon="check" title={filters.q ? "No tickets match that search" : status === "active" ? "Inbox zero" : "No tickets here"}>
          {status === "active" && !filters.q ? "Nothing is waiting on the team. New requests show up here within 30 seconds." : "Try another filter or search."}
        </EmptyState>
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center justify-center gap-2 text-[13.5px] font-bold">
          {page > 1 && <PillLink size="sm" href={withParams("/admin/support", { ...keep, page: String(page - 1) })}>Previous</PillLink>}
          <span className="px-2 text-app-ink-soft">Page {page} of {pages}</span>
          {page < pages && <PillLink size="sm" href={withParams("/admin/support", { ...keep, page: String(page + 1) })}>Next</PillLink>}
        </nav>
      )}
    </AppPage>
  );
}
