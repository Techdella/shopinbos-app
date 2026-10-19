import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { EmptyState, FilterChips, ListCard, Pill, PillLink, StatGrid, StatTile } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { formatDate, humanize } from "@/components/growth/kit";
import { ensureStorefrontVisitorTables } from "@/lib/storefront/visitor-data";
import { getLocale, getT } from "@/lib/i18n/server";
import { pageWindow } from "@/lib/pagination";
import { Pagination } from "@/components/seller/Pagination";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("store");
  return { title: t("forms.title") };
}

const FILTERS = [
  { key: "", label: "forms.filter.all" },
  { key: "contact", label: "forms.filter.contact" },
  { key: "newsletter", label: "forms.filter.newsletter" },
] as const;

export default async function SellerFormSubmissionsPage({ searchParams }: { searchParams?: Promise<{ type?: string; page?: string }> }) {
  const params = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const t = await getT("store", "common");
  const locale = await getLocale();
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  if (!store) redirect("/builder?firstRun=1");

  await ensureStorefrontVisitorTables();
  const active = FILTERS.find((filter) => filter.key === params?.type) ?? FILTERS[0];
  // Counts cover every message; the list shows one page of the chosen kind, filtered in the query.
  const counts = await db.$queryRawUnsafe<Array<{ type: string; status: string; count: number }>>(
    `SELECT type, status, COUNT(*)::int AS count FROM "StoreFormSubmission" WHERE "storeId" = $1 GROUP BY type, status`,
    store.id,
  );
  const sum = (test: (row: { type: string; status: string }) => boolean) => counts.filter(test).reduce((total, row) => total + Number(row.count), 0);
  const totalCount = sum(() => true);
  const contactCount = sum((row) => row.type === "contact");
  const newsletterCount = sum((row) => row.type === "newsletter");
  const newCount = sum((row) => row.status === "new");
  const paging = pageWindow(params?.page, active.key ? sum((row) => row.type === active.key) : totalCount, PAGE_SIZE);
  const shown = paging.total
    ? await db.$queryRawUnsafe<Array<{
        id: string;
        type: string;
        name: string | null;
        email: string | null;
        phone: string | null;
        message: string | null;
        status: string;
        createdAt: Date;
      }>>(
        `SELECT id, type, name, email, phone, message, status, "createdAt" FROM "StoreFormSubmission" WHERE "storeId" = $1 AND ($2::text = '' OR type = $2::text) ORDER BY "createdAt" DESC, id DESC LIMIT $3 OFFSET $4`,
        store.id,
        active.key,
        paging.take,
        paging.skip,
      )
    : [];

  // The Inbox conversation for each address (a form message, or an email thread), to reply from there.
  const emails = [...new Set(shown.map((item) => item.email?.trim().toLowerCase()).filter((v): v is string => Boolean(v)))];
  const threads = emails.length
    ? await db.inboxConversation.findMany({ where: { storeId: store.id, channel: { in: ["form", "email"] }, externalThreadId: { in: emails } }, select: { id: true, channel: true, externalThreadId: true }, orderBy: { lastMessageAt: "desc" } })
    : [];
  const threadFor = (email: string) => threads.find((c) => c.externalThreadId === email.trim().toLowerCase())?.id ?? null;


  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("forms.title")}
      sub={t("forms.sub")}
      actions={
        <>
          <PillLink href="/home/messages" icon="chat" tone="ink">{t("forms.reply")}</PillLink>
          <PillLink href="/home/marketing/forms" icon="settings">{t("forms.manage")}</PillLink>
          <PillLink href={`/s/${store.slug}`} icon="globe">{t("forms.viewStore")}</PillLink>
        </>
      }
    >
      <div className="grid gap-5">
        <StatGrid>
          <StatTile tone="card" label={t("forms.total")} value={totalCount} hint={t("forms.allTime")} />
          <StatTile tone="card" label={t("forms.new")} value={newCount} />
          <StatTile tone="card" label={t("forms.filter.contact")} value={contactCount} />
          <StatTile tone="card" label={t("forms.filter.newsletter")} value={newsletterCount} />
        </StatGrid>

        <FilterChips
          items={FILTERS.map((filter) => ({
            label: t(filter.label),
            href: filter.key ? `/home/forms?type=${filter.key}` : "/home/forms",
            count: filter.key === "contact" ? contactCount : filter.key === "newsletter" ? newsletterCount : totalCount,
            active: filter === active,
          }))}
        />

        {shown.length === 0 ? (
          <EmptyState icon="message" title={t("forms.empty")}>{t("forms.emptySub")}</EmptyState>
        ) : (
          <div>
          <ListCard>
            {shown.map((submission) => (
              <li key={submission.id} className="flex items-start gap-3 px-4 py-4 sm:gap-4 sm:px-5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-app-canvas">
                  <Icon name={submission.type === "newsletter" ? "mail" : "message"} size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <strong className="min-w-0 truncate text-[15px] font-extrabold">{submission.name || submission.email || t("forms.visitor")}</strong>
                    <Pill tone={submission.type === "newsletter" ? "info" : "accent"}>{t.dynamic(`forms.filter.${submission.type}`, humanize(submission.type))}</Pill>
                    {submission.status === "new" && <Pill tone="success" dot>{t("forms.new")}</Pill>}
                    <span className="text-[12.5px] text-app-ink-soft">{formatDate(submission.createdAt, true, locale)}</span>
                  </div>
                  {(submission.email || submission.phone) && (
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-[13.5px]">
                      {/* Reply in the Inbox (sent from the store's connected email), never the device's mail app. */}
                      {submission.email && (threadFor(submission.email) ? <a href={`/home/messages?c=${threadFor(submission.email)}`} className="break-all text-app-ink-soft no-underline hover:text-app-ink hover:underline">{submission.email}</a> : <span className="break-all text-app-ink-soft">{submission.email}</span>)}
                      {submission.phone && <a href={`tel:${submission.phone}`} className="text-app-ink-soft no-underline hover:text-app-ink hover:underline">{submission.phone}</a>}
                    </div>
                  )}
                  {submission.message ? <p className="mb-0 mt-2 whitespace-pre-wrap break-words text-[14px] leading-[1.55]">{submission.message}</p> : null}
                </div>
              </li>
            ))}
          </ListCard>
          <Pagination {...paging} base="/home/forms" params={{ type: active.key || undefined }} label={t("forms.pages")} />
          </div>
        )}
      </div>
    </SellerPage>
  );
}
