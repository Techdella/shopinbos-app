import type { Metadata } from "next";
import type { Prisma, SubscriberSource, SubscriberStatus } from "@prisma/client";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { FilterChips, PillLink, SearchForm, StatGrid, StatTile } from "@/components/app-kit";
import { consentSummary } from "@/lib/marketing/subscribers";
import { SOURCE_LABEL } from "@/lib/marketing/segment-rules";
import { SubscribersManager } from "./SubscribersManager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Subscribers" };

const PAGE = 50;
const STATUSES: Array<{ key?: SubscriberStatus; label: string }> = [{ label: "All" }, { key: "active", label: "Subscribed" }, { key: "unsubscribed", label: "Unsubscribed" }, { key: "bounced", label: "Bounced" }];

type Search = { q?: string; status?: string; source?: string; tag?: string; page?: string };

function href(params: Search) {
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as Array<[string, string]>).toString();
  return `/home/marketing/subscribers${query ? `?${query}` : ""}`;
}

export default async function SubscribersPage({ searchParams }: { searchParams?: Promise<Search> }) {
  const params = (await searchParams) ?? {};
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  const status = STATUSES.find((s) => s.key === params.status)?.key;
  const source = params.source && params.source in SOURCE_LABEL ? (params.source as SubscriberSource) : undefined;
  const page = Math.max(1, Number(params.page) || 1);
  const q = params.q?.trim().slice(0, 100);
  const where: Prisma.SubscriberWhereInput = {
    storeId: store?.id ?? "-",
    ...(status ? { status } : {}),
    ...(source ? { source } : {}),
    ...(params.tag ? { tags: { has: params.tag } } : {}),
    ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } : {}),
  };
  const monthAgo = new Date(Date.now() - 30 * 86_400_000);

  const [rows, filtered, counts, newThisMonth, tagRows] = store
    ? await Promise.all([
        db.subscriber.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
        db.subscriber.count({ where }),
        db.subscriber.groupBy({ by: ["status"], where: { storeId: store.id }, _count: true }),
        db.subscriber.count({ where: { storeId: store.id, status: "active", createdAt: { gte: monthAgo } } }),
        db.subscriber.findMany({ where: { storeId: store.id, NOT: { tags: { isEmpty: true } } }, select: { tags: true }, take: 5000 }),
      ])
    : [[], 0, [], 0, []];
  const count = (key?: string) => counts.filter((row) => !key || row.status === key).reduce((sum, row) => sum + row._count, 0);
  const tags = [...new Set(tagRows.flatMap((row) => row.tags))].sort();
  const pages = Math.max(1, Math.ceil(filtered / PAGE));
  const exportHref = `/api/app/marketing/subscribers/export${status || params.tag ? `?${new URLSearchParams({ ...(status ? { status } : {}), ...(params.tag ? { tag: params.tag } : {}) })}` : ""}`;

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Subscribers"
      sub="People who agreed to hear from your shop, and how they agreed."
      actions={
        <>
          <PillLink href="/home/marketing/forms" icon="mail">Sign-up forms</PillLink>
          <PillLink href="/home/marketing/segments" icon="layers">Groups of customers</PillLink>
        </>
      }
    >
      <div className="grid gap-5">
        <StatGrid>
          <StatTile tone="card" label="Subscribed" value={count("active").toLocaleString("en-NG")} />
          <StatTile tone="card" label="New in 30 days" value={newThisMonth.toLocaleString("en-NG")} />
          <StatTile tone="card" label="Unsubscribed" value={count("unsubscribed").toLocaleString("en-NG")} />
          <StatTile tone="card" label="Bounced or spam" value={(count("bounced") + count("spam")).toLocaleString("en-NG")} />
        </StatGrid>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterChips items={STATUSES.map((s) => ({ label: s.label, href: href({ ...params, status: s.key, page: undefined }), count: count(s.key), active: s.key === status }))} />
          <SearchForm action="/home/marketing/subscribers" defaultValue={q} placeholder="Search name, email or phone" keep={{ status, source, tag: params.tag }} />
        </div>
        {tags.length || source ? (
          <nav aria-label="Filter by tag" className="flex flex-wrap items-center gap-2 text-[13.5px]">
            <span className="font-bold text-app-ink-soft">Tags:</span>
            {tags.slice(0, 30).map((tag) => (
              <a key={tag} href={href({ ...params, tag: params.tag === tag ? undefined : tag, page: undefined })} aria-current={params.tag === tag ? "true" : undefined} className={`inline-flex min-h-[34px] items-center rounded-full border px-3 font-bold no-underline ${params.tag === tag ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink"}`}>
                {tag}
              </a>
            ))}
            {source ? <a href={href({ ...params, source: undefined })} className="font-bold text-app-accent-ink">Clear source: {SOURCE_LABEL[source]}</a> : null}
          </nav>
        ) : null}

        <SubscribersManager
          rows={rows.map((row) => {
            const consent = consentSummary(row.metadata);
            const meta = (row.metadata ?? {}) as Record<string, unknown>;
            return {
              id: row.id,
              email: row.email,
              name: row.name,
              phone: row.phone,
              status: row.status,
              source: row.source,
              sourceLabel: SOURCE_LABEL[row.source] ?? row.source,
              tags: row.tags,
              createdAt: row.createdAt.toISOString(),
              consent: consent ? { email: consent.email, text: consent.sms || consent.whatsapp, at: consent.at } : null,
              birthday: typeof meta.birthday === "string" ? meta.birthday : null,
            };
          })}
          total={filtered}
          exportHref={exportHref}
          tags={tags}
          pagination={{ page, pages, prev: page > 1 ? href({ ...params, page: String(page - 1) }) : null, next: page < pages ? href({ ...params, page: String(page + 1) }) : null }}
        />
      </div>
    </SellerPage>
  );
}
