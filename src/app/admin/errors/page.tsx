import type { Metadata } from "next";
import Link from "next/link";
import { AppPage, EmptyState, FilterChips, Pill, SearchForm, type Tone } from "@/components/app-kit";
import { CountRow, adminFrame, buttonClass, formatDate, withParams } from "@/components/admin/AdminKit";
import { requireAdminSection } from "@/lib/admin-team/service.server";
import { FRIENDLY_TEXT, type ErrorKind } from "@/lib/errors/friendly";
import { errorCounts, listClientErrors, type ErrorFilter } from "@/lib/errors/service.server";
import { markErrorFixed } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "App errors" };

// Admin › App errors: what went wrong for people in the browser, who it happened to, and what they were shown.
// People only ever see a friendly message (src/lib/errors/friendly.ts); the technical details land here.

const FILTERS: ErrorFilter[] = ["open", "fixed", "all"];
const FILTER_LABEL: Record<ErrorFilter, string> = { open: "Open", fixed: "Fixed", all: "All" };
const KIND: Record<ErrorKind, { label: string; tone: Tone }> = {
  storage: { label: "Browser storage blocked", tone: "warning" },
  network: { label: "Connection", tone: "info" },
  update: { label: "Old version of the page", tone: "muted" },
  permission: { label: "Permission blocked", tone: "warning" },
  code: { label: "Bug", tone: "danger" },
};
const SOURCE: Record<string, string> = { shown: "Shown to them", unhandled: "Not caught (in the background)", boundary: "Error page", server: "On the server" };
const ROLE: Record<string, string> = { seller: "Seller", supplier: "Supplier", logistics_partner: "Delivery partner", admin: "Admin", buyer: "Shopper" };

const ago = (date: Date) => {
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} h ago`;
  return formatDate(date);
};

export default async function AdminErrorsPage(props: { searchParams?: Promise<{ status?: string; q?: string }> }) {
  const user = await requireAdminSection("developers");
  const params = (await props.searchParams) ?? {};
  const status = (FILTERS as string[]).includes(params.status ?? "") ? (params.status as ErrorFilter) : "open";
  const q = params.q?.trim() ?? "";
  const [rows, counts] = await Promise.all([listClientErrors(status, q, 300), errorCounts()]);
  const back = withParams("/admin/errors", { status, q: q || undefined });

  // One card per problem, with every account that hit it.
  const groups = new Map<string, { first: (typeof rows)[number]; rows: typeof rows; total: number; last: Date }>();
  for (const row of rows) {
    const group = groups.get(row.fingerprint);
    if (group) {
      group.rows.push(row);
      group.total += row.count;
      if (row.lastSeenAt > group.last) group.last = row.lastSeenAt;
    } else groups.set(row.fingerprint, { first: row, rows: [row], total: row.count, last: row.lastSeenAt });
  }

  return (
    <AppPage
      frame={adminFrame(user, "Search")}
      title="App errors"
      sub="Errors people hit in the app, who they happened to and what they were shown. People only see a friendly message; the details are here."
      toolbar={
        <div className="flex flex-wrap items-center gap-3">
          <FilterChips items={FILTERS.map((value) => ({ label: FILTER_LABEL[value], href: withParams("/admin/errors", { status: value, q: q || undefined }), active: status === value, ...(value === "open" ? { count: counts.open } : {}) }))} />
          <SearchForm action="/admin/errors" defaultValue={q} placeholder="Search the error or page" keep={{ status }} />
        </div>
      }
    >
      <CountRow
        items={[
          { label: "Open (per account)", value: counts.open },
          { label: "Seen in the last 24 hours", value: counts.today },
          { label: "Signed-in people affected", value: counts.people },
        ]}
      />

      {groups.size === 0 ? (
        <EmptyState icon="check" title={status === "open" ? "No open errors" : "Nothing here"}>
          {status === "open" ? "When something goes wrong for someone in the app, it shows up here with their account." : "Try another filter."}
        </EmptyState>
      ) : (
        <div className="grid gap-4">
          {[...groups.entries()].map(([fingerprint, group]) => {
            const kind = KIND[(group.first.kind as ErrorKind) in KIND ? (group.first.kind as ErrorKind) : "code"];
            const fixed = group.rows.every((row) => row.resolvedAt);
            return (
              <article key={fingerprint} className="rounded-[20px] border border-app-line bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={kind.tone} dot>{kind.label}</Pill>
                      {fixed && <Pill tone="success">Fixed</Pill>}
                      <span className="text-[13px] text-app-ink-soft">
                        {group.total} {group.total === 1 ? "time" : "times"} · {group.rows.length} {group.rows.length === 1 ? "person" : "people"} · last {ago(group.last)}
                      </span>
                    </div>
                    <p className="m-0 mt-2 break-words font-mono text-[13.5px] font-semibold text-app-ink">{group.first.message}</p>
                    {group.first.server && (
                      <p className="m-0 mt-1 break-words font-mono text-[13px] text-app-ink">
                        <span className="font-bold">On the server: </span>{group.first.server.message}
                      </p>
                    )}
                    <p className="m-0 mt-1 text-[13px] text-app-ink-soft">
                      On <span className="font-mono">{group.first.pagePattern}</span> · {SOURCE[group.first.source] ?? group.first.source}
                    </p>
                    <p className="m-0 mt-2 rounded-[12px] bg-app-canvas px-3 py-2 text-[13px] text-app-ink-soft">
                      <span className="font-bold text-app-ink">They saw: </span>
                      {group.first.shown ?? (group.first.source === "boundary" ? "The “Something went wrong” page with Try again." : group.first.source === "unhandled" ? "Nothing (it happened in the background), but the page may not have worked." : FRIENDLY_TEXT[group.first.kind as ErrorKind] ?? FRIENDLY_TEXT.code)}
                    </p>
                  </div>
                  <form action={markErrorFixed}>
                    <input type="hidden" name="fingerprint" value={fingerprint} />
                    <input type="hidden" name="fixed" value={fixed ? "0" : "1"} />
                    <input type="hidden" name="back" value={back} />
                    <button type="submit" className={buttonClass(fixed ? "white" : "ink", "sm")}>{fixed ? "Open again" : "Mark fixed"}</button>
                  </form>
                </div>

                <ul className="m-0 mt-4 grid list-none gap-2 p-0">
                  {group.rows.map((row) => (
                    <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[14px] border border-app-line px-3 py-2.5 text-[13.5px]">
                      <span className="min-w-[180px] flex-1">
                        {row.user ? (
                          <>
                            <span className="font-bold text-app-ink">{row.user.name || "No name yet"}</span>
                            <span className="text-app-ink-soft"> · {ROLE[row.user.role] ?? row.user.role}</span>
                            <span className="block text-[12.5px] text-app-ink-soft">{[row.user.email, row.user.phone].filter(Boolean).join(" · ") || "No email or phone"}</span>
                          </>
                        ) : (
                          <span className="text-app-ink-soft">Not signed in</span>
                        )}
                      </span>
                      <span className="text-app-ink-soft">{row.browser}</span>
                      <span className="text-app-ink-soft">{row.count}× · {ago(row.lastSeenAt)}</span>
                      <span className="max-w-[240px] truncate font-mono text-[12px] text-app-ink-soft" title={row.path}>{row.path}</span>
                      {row.user && (
                        <Link href={`/admin/support/new?to=user:${row.user.id}&back=${encodeURIComponent(back)}`} className="font-bold text-app-ink underline">
                          Message them
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>

                {group.first.trail && (
                  <details className="mt-3" open>
                    <summary className="cursor-pointer text-[13px] font-bold text-app-ink-soft">What they did just before</summary>
                    <pre className="mt-2 max-h-[220px] overflow-auto whitespace-pre-wrap break-words rounded-[12px] bg-app-canvas p-3 font-mono text-[12px] text-app-ink">{group.first.trail}</pre>
                  </details>
                )}

                {(group.first.stack || group.first.digest) && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-[13px] font-bold text-app-ink-soft">Technical details</summary>
                    <pre className="mt-2 max-h-[260px] overflow-auto whitespace-pre-wrap break-words rounded-[12px] bg-app-canvas p-3 font-mono text-[12px] text-app-ink">
                      {[group.first.digest ? `Server digest: ${group.first.digest}` : null, group.first.userAgent, group.first.stack, group.first.server?.stack ? `On the server:\n${group.first.server.stack}` : null].filter(Boolean).join("\n\n")}
                    </pre>
                  </details>
                )}
              </article>
            );
          })}
        </div>
      )}
      <p className="mt-4 text-[12.5px] text-app-ink-faint">Showing up to 300, latest first. A fixed error opens again if it happens again.</p>
    </AppPage>
  );
}
