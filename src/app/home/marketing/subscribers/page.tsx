import type { Metadata } from "next";
import type { SubscriberSource, SubscriberStatus } from "@prisma/client";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { FilterChips, MoreActions, PillLink, SearchForm, StatGrid, StatTile } from "@/components/app-kit";
import { PHONE_SCROLL_ROW } from "@/components/app-ui/cx";
import { consentSummary, listSubscribers } from "@/lib/marketing/subscribers";
import { SOURCE_LABEL } from "@/lib/marketing/segment-rules";
import { SubscribersManager } from "./SubscribersManager";
import { getLocale, getT } from "@/lib/i18n/server";
import { formatNumber } from "@shared/i18n";
import { parsePage } from "@/lib/pagination";
import type { MessageKey } from "@shared/i18n/catalog";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("marketing");
  return { title: t("hub.stat.subscribers") };
}

const PAGE = 50;
const STATUSES: Array<{ key?: SubscriberStatus; label: MessageKey<"marketing"> }> = [{ label: "campaigns.filter.all" }, { key: "active", label: "subs.status.active" }, { key: "unsubscribed", label: "subs.status.unsubscribed" }, { key: "bounced", label: "subs.status.bounced" }];

type Search = { q?: string; status?: string; source?: string; tag?: string; page?: string };

function href(params: Search) {
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as Array<[string, string]>).toString();
  return `/home/marketing/subscribers${query ? `?${query}` : ""}`;
}

export default async function SubscribersPage({ searchParams }: { searchParams?: Promise<Search> }) {
  const params = (await searchParams) ?? {};
  const user = await requireRole(["seller"], "/login");
  const t = await getT("marketing", "common");
  const locale = await getLocale();
  const n = (value: number) => formatNumber(value, locale);
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  const status = STATUSES.find((s) => s.key === params.status)?.key;
  const source = params.source && params.source in SOURCE_LABEL ? (params.source as SubscriberSource) : undefined;
  const list = store ? await listSubscribers(store.id, { q: params.q, status, source, tag: params.tag, page: parsePage(params.page), limit: PAGE }) : null;
  const rows = list?.rows ?? [];
  const filtered = list?.filtered ?? 0;
  const newThisMonth = list?.newThisMonth ?? 0;
  const q = params.q?.trim().slice(0, 100);
  const count = (key?: SubscriberStatus) => (list ? (key ? list.counts[key] : list.counts.all) : 0);
  const tags = list?.tags ?? [];
  const page = list?.page ?? 1;
  const pages = list?.pages ?? 1;
  const exportHref = `/api/app/marketing/subscribers/export${status || params.tag ? `?${new URLSearchParams({ ...(status ? { status } : {}), ...(params.tag ? { tag: params.tag } : {}) })}` : ""}`;

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("hub.stat.subscribers")}
      sub={t("subs.sub")}
      actions={
        <>
          <MoreActions>
            <PillLink href="/home/marketing/forms" icon="mail">{t("subs.signupForms")}</PillLink>
            <PillLink href="/home/marketing/segments" icon="layers">{t("hub.tool.segments")}</PillLink>
          </MoreActions>
        </>
      }
    >
      <div className="grid gap-5">
        <StatGrid>
          <StatTile tone="card" label={t("subs.status.active")} value={n(count("active"))} />
          <StatTile tone="card" label={t("subs.new30")} value={n(newThisMonth)} />
          <StatTile tone="card" label={t("subs.status.unsubscribed")} value={n(count("unsubscribed"))} />
          <StatTile tone="card" label={t("subs.bouncedOrSpam")} value={n(count("bounced") + count("spam"))} />
        </StatGrid>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterChips items={STATUSES.map((s) => ({ label: t(s.label), href: href({ ...params, status: s.key, page: undefined }), count: count(s.key), active: s.key === status }))} />
          <SearchForm action="/home/marketing/subscribers" defaultValue={q} placeholder={t("subs.search")} keep={{ status, source, tag: params.tag }} />
        </div>
        {tags.length || source ? (
          <nav aria-label={t("subs.filterByTag")} className={`flex items-center gap-2 text-[13.5px] ${PHONE_SCROLL_ROW}`}>
            <span className="shrink-0 font-bold text-app-ink-soft">{t("subs.tags")}</span>
            {tags.slice(0, 30).map((tag) => (
              <a key={tag} href={href({ ...params, tag: params.tag === tag ? undefined : tag, page: undefined })} aria-current={params.tag === tag ? "true" : undefined} className={`inline-flex min-h-[34px] shrink-0 items-center whitespace-nowrap rounded-full border px-3 font-bold no-underline ${params.tag === tag ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink"}`}>
                {tag}
              </a>
            ))}
            {source ? <a href={href({ ...params, source: undefined })} className="shrink-0 whitespace-nowrap font-bold text-app-accent-ink">{t("subs.clearSource", { source: t.dynamic(`source.${source}`, SOURCE_LABEL[source]) })}</a> : null}
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
              sourceLabel: t.dynamic(`source.${row.source}`, SOURCE_LABEL[row.source] ?? row.source),
              tags: row.tags,
              createdAt: row.createdAt.toISOString(),
              consent: consent ? { email: consent.email, text: consent.sms || consent.whatsapp, at: consent.at } : null,
              birthday: typeof meta.birthday === "string" ? meta.birthday : null,
            };
          })}
          total={filtered}
          exportHref={exportHref}
          tags={tags}
          pagination={{ page, pages, total: filtered, from: list?.from ?? 0, to: list?.to ?? 0, base: "/home/marketing/subscribers", params: { q, status, source, tag: params.tag } }}
        />
      </div>
    </SellerPage>
  );
}
