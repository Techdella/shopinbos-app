import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { getLocale, getT } from "@/lib/i18n/server";
import { intlLocale, formatNumber } from "@shared/i18n";
import { naira } from "@shared/onboarding";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, Card, CardHead, EmptyState, PillLink, StatGrid, StatTile, TextLink } from "@/components/app-kit";
import { ShareBar } from "@/components/growth/kit";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/app-ui/cx";
import { loadAnalytics } from "@/lib/analytics/load";
import { resolveRange } from "@/lib/analytics/range";
import { cleanChannels, lagosDayKey, monthGrid, parseMonth, readResults, readyToShare } from "@/lib/social-posts/pure";
import { postAccountNames } from "@/lib/social-posts/server";
import { ChannelBadge } from "./_kit/ChannelBadge";
import { OneTapShare } from "./_kit/OneTapShare";
import { PostList, PostThumb, STATUS_TONE, type ListPost } from "./_kit/PostList";
import { SocialNav } from "./_kit/SocialNav";
import { shareProps } from "./_kit/share.server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("socialPosts");
  return { title: t("title") };
}

// Marketing > Social posts: a Buffer-style planner. The month calendar (Lagos time) with every planned and posted
// post, the queue, what went out (with what it sold), drafts, and "Ready to post": the WhatsApp, TikTok and X posts
// whose time has come, each one tap away. Facebook and Instagram post by themselves (/api/cron/social-posts).

const VIEWS = ["calendar", "queue", "posted", "drafts"] as const;
type View = (typeof VIEWS)[number];

const LIST_SELECT = { id: true, caption: true, mediaUrl: true, mediaKind: true, renderedUrl: true, format: true, channels: true, status: true, scheduledAt: true, postedAt: true, results: true, link: true } as const;

export default async function SocialPostsPage({ searchParams }: { searchParams: Promise<{ view?: string; month?: string; saved?: string }> }) {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("socialPosts", "common");
  const locale = await getLocale();
  const query = await searchParams;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, customDomain: true } });

  if (!store) {
    return (
      <SellerPage user={user} store={null} title={t("title")}>
        <EmptyState icon="calendar" title={t("noStore.title")} action={<PillLink href="/onboarding" tone="ink">{t("noStore.action")}</PillLink>}>
          {t("noStore.body")}
        </EmptyState>
      </SellerPage>
    );
  }

  const view: View = (VIEWS as readonly string[]).includes(query.view ?? "") ? (query.view as View) : "calendar";
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [accounts, queued, drafts, postedMonth, recent, saved] = await Promise.all([
    postAccountNames(store.id),
    db.socialPost.count({ where: { storeId: store.id, status: "scheduled" } }).catch(() => 0),
    db.socialPost.count({ where: { storeId: store.id, status: "draft" } }).catch(() => 0),
    db.socialPost.count({ where: { storeId: store.id, status: { in: ["posted", "partial"] }, postedAt: { gte: monthStart } } }).catch(() => 0),
    db.socialPost.findMany({ where: { storeId: store.id, status: { in: ["posted", "partial"] }, postedAt: { gte: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000) } }, orderBy: { postedAt: "desc" }, take: 40, select: LIST_SELECT }).catch(() => []),
    query.saved ? db.socialPost.findFirst({ where: { id: query.saved, storeId: store.id }, select: { scheduledAt: true, status: true } }).catch(() => null) : null,
  ]);
  const weekCount = await db.socialPost.count({ where: { storeId: store.id, status: "scheduled", scheduledAt: { gte: now, lt: weekAhead } } }).catch(() => 0);
  const ready = recent.filter((post) => readyToShare(cleanChannels(post.channels), readResults(post.results)).length > 0);

  const timeFmt = new Intl.DateTimeFormat(intlLocale(locale), { hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" });
  const dateFmt = new Intl.DateTimeFormat(intlLocale(locale), { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" });
  const when = (date: Date) => dateFmt.format(date);

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("title")}
      sub={t("sub")}
      actions={
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          <PillLink href="/home/cms/plan" icon="calendar" iconOnlyOnPhone>{t("act.plan")}</PillLink>
          <PillLink href="/home/marketing/social/designs" icon="sparkle">{t("act.designs")}</PillLink>
          <PillLink href="/home/marketing/social/new" tone="ink" icon="plus">{t("act.create")}</PillLink>
        </div>
      }
    >
      <SocialNav active={view} counts={{ queue: queued, drafts }} />

      {saved && (
        <p role="status" className="m-0 mb-5 rounded-[14px] bg-app-mint px-4 py-3 text-[14px] font-semibold">
          {saved.status === "scheduled" && saved.scheduledAt ? t("saved.scheduled", { when: when(saved.scheduledAt) }) : t("saved.ok")}
        </p>
      )}

      <div className="grid gap-5">
        <StatGrid>
          <StatTile label={t("stat.week")} value={formatNumber(weekCount, locale)} hint={t("stat.weekHint")} />
          <StatTile label={t("stat.queued")} value={formatNumber(queued, locale)} />
          <StatTile label={t("stat.posted")} value={formatNumber(postedMonth, locale)} hint={t("stat.postedHint")} />
          <StatTile label={t("stat.ready")} value={formatNumber(ready.length, locale)} />
        </StatGrid>

        {!accounts.facebook && !accounts.instagram && (
          <AssistantNote who="rex" action={<PillLink href="/home/marketing/social/accounts" tone="ink" size="sm">{t("connect.action")}</PillLink>}>{t("connect.note")}</AssistantNote>
        )}

        {ready.length > 0 && (
          <Card className="p-5">
            <CardHead title={t("ready.title")} sub={t("ready.sub")} />
            <ul className="m-0 mt-4 grid list-none gap-3 p-0">
              {ready.map((post) => {
                const channels = readyToShare(cleanChannels(post.channels), readResults(post.results));
                return (
                  <li key={post.id} className="flex min-w-0 flex-wrap items-start gap-3 rounded-[16px] bg-app-canvas p-3">
                    <Link href={`/home/marketing/social/${post.id}`} className="shrink-0"><PostThumb post={post} size={64} /></Link>
                    <div className="grid min-w-0 flex-1 gap-2">
                      <p className="m-0 line-clamp-2 text-[13.5px]">{post.caption || t("list.noCaption")}</p>
                      <div className="flex flex-wrap gap-2">
                        {channels.map((channel) => <OneTapShare key={channel} {...shareProps(post, channel)} />)}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {view === "calendar" && <CalendarView storeId={store.id} month={query.month} now={now} locale={locale} timeFmt={timeFmt} />}
        {view === "queue" && (
          <section aria-label={t("nav.queue")} className="grid gap-3">
            <PostList posts={await db.socialPost.findMany({ where: { storeId: store.id, status: { in: ["scheduled", "publishing"] } }, orderBy: { scheduledAt: "asc" }, take: 100, select: LIST_SELECT }).catch(() => [])} when={when} empty={t("empty.queue")} />
          </section>
        )}
        {view === "drafts" && (
          <section aria-label={t("nav.drafts")} className="grid gap-3">
            <PostList posts={await db.socialPost.findMany({ where: { storeId: store.id, status: "draft" }, orderBy: { updatedAt: "desc" }, take: 100, select: LIST_SELECT }).catch(() => [])} when={when} empty={t("empty.drafts")} />
          </section>
        )}
        {view === "posted" && <PostedView storeId={store.id} when={when} now={now} />}
      </div>
    </SellerPage>
  );
}

async function CalendarView({ storeId, month, now, locale, timeFmt }: { storeId: string; month?: string; now: Date; locale: Awaited<ReturnType<typeof getLocale>>; timeFmt: Intl.DateTimeFormat }) {
  const t = await getT("socialPosts");
  const { year, month: m } = parseMonth(month, now);
  const grid = monthGrid(year, m);
  const posts: ListPost[] = await db.socialPost
    .findMany({ where: { storeId, scheduledAt: { gte: grid.start, lt: grid.end } }, orderBy: { scheduledAt: "asc" }, take: 500, select: LIST_SELECT })
    .catch(() => []);
  const byDay = new Map<string, ListPost[]>();
  for (const post of posts) {
    const key = lagosDayKey(post.scheduledAt!);
    byDay.set(key, [...(byDay.get(key) ?? []), post]);
  }
  const today = lagosDayKey(now);
  const title = new Intl.DateTimeFormat(intlLocale(locale), { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, m - 1, 15)));
  const weekdays = Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(intlLocale(locale), { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 5 + index))));
  const monthDays = grid.weeks.flat().filter((cell) => cell.inMonth);

  const chip = (post: ListPost) => {
    const channels = cleanChannels(post.channels);
    const status = post.status as keyof typeof STATUS_TONE;
    return (
      <Link
        key={post.id}
        href={`/home/marketing/social/${post.id}`}
        className={cx(
          "flex min-w-0 items-center gap-1.5 rounded-[10px] border bg-white p-1 pr-1.5 text-[11.5px] text-app-ink no-underline hover:border-app-ink",
          status === "draft" ? "border-dashed border-app-line-strong" : status === "failed" ? "border-app-danger" : "border-app-line",
        )}
      >
        <PostThumb post={post} size={26} className="rounded-[7px]" />
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{timeFmt.format(post.scheduledAt!)}</span>
          <span className="flex -space-x-1">{channels.map((channel) => <ChannelBadge key={channel} channel={channel} size={14} className="ring-1 ring-white" />)}</span>
        </span>
        {(status === "posted" || status === "partial") && <Icon name="check" size={12} className="shrink-0 text-app-success" />}
      </Link>
    );
  };

  return (
    <section aria-labelledby="cal-title" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="cal-title" className="m-0 text-[20px] font-extrabold tracking-[-0.3px]">{title}</h2>
        <div className="flex items-center gap-2">
          <Link href={`/home/marketing/social?month=${grid.prev}`} className="grid h-10 w-10 place-items-center rounded-full border border-app-line bg-white text-app-ink" aria-label={t("cal.prev")}><Icon name="arrowLeft" size={16} /></Link>
          <Link href="/home/marketing/social" className="inline-flex min-h-[40px] items-center rounded-full border border-app-line bg-white px-4 text-[13.5px] font-bold text-app-ink no-underline">{t("cal.today")}</Link>
          <Link href={`/home/marketing/social?month=${grid.next}`} className="grid h-10 w-10 place-items-center rounded-full border border-app-line bg-white text-app-ink" aria-label={t("cal.next")}><Icon name="arrow" size={16} /></Link>
        </div>
      </div>

      {/* Month grid (tablet and up) */}
      <div className="hidden overflow-hidden rounded-[20px] border border-app-line bg-white md:block">
        <div className="grid grid-cols-7 border-b border-app-line bg-app-canvas">
          {weekdays.map((name) => <div key={name} className="px-2 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-app-ink-soft">{name}</div>)}
        </div>
        {grid.weeks.map((week) => (
          <div key={week[0].key} className="grid grid-cols-7 border-b border-app-line last:border-0">
            {week.map((cell) => {
              const list = byDay.get(cell.key) ?? [];
              const past = cell.key < today;
              return (
                <div key={cell.key} className={cx("group relative grid min-h-[118px] content-start gap-1 border-r border-app-line p-1.5 last:border-0", !cell.inMonth && "bg-app-canvas/60", past && "bg-app-canvas/40")}>
                  <div className="flex items-center justify-between">
                    <span className={cx("grid h-6 min-w-6 place-items-center rounded-full px-1 text-[12px] font-bold", cell.key === today ? "bg-app-ink text-white" : cell.inMonth ? "text-app-ink" : "text-app-ink-faint")}>{cell.day}</span>
                    {!past && (
                      <Link href={`/home/marketing/social/new?date=${cell.key}`} aria-label={t("cal.add", { day: cell.key })} className="grid h-6 w-6 place-items-center rounded-full text-app-ink-soft opacity-0 transition hover:bg-app-ink hover:text-white focus:opacity-100 group-hover:opacity-100">
                        <Icon name="plus" size={13} />
                      </Link>
                    )}
                  </div>
                  {list.slice(0, 3).map(chip)}
                  {list.length > 3 && <Link href={`/home/marketing/social?view=queue`} className="px-1 text-[11px] font-bold text-app-ink-soft">{t("cal.more", { count: list.length - 3 })}</Link>}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Agenda (phones): the days of the month that have posts, and today */}
      <ul className="m-0 grid list-none gap-2 p-0 md:hidden">
        {monthDays
          .filter((cell) => byDay.has(cell.key) || cell.key === today)
          .map((cell) => (
            <li key={cell.key} className="rounded-[18px] border border-app-line bg-white p-3">
              <div className="flex items-center justify-between">
                <span className={cx("text-[13.5px] font-extrabold", cell.key === today && "text-app-accent-ink")}>
                  {new Intl.DateTimeFormat(intlLocale(locale), { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${cell.key}T12:00:00Z`))}
                </span>
                {cell.key >= today && <Link href={`/home/marketing/social/new?date=${cell.key}`} className="text-[13px] font-bold text-app-ink underline">{t("cal.addShort")}</Link>}
              </div>
              <div className="mt-2 grid gap-1.5">{(byDay.get(cell.key) ?? []).map(chip)}</div>
              {!byDay.has(cell.key) && <p className="m-0 mt-1 text-[13px] text-app-ink-soft">{t("cal.nothing")}</p>}
            </li>
          ))}
      </ul>

      {!posts.length && (
        <p className="m-0 text-[13.5px] text-app-ink-soft">
          {t("cal.empty")} <TextLink href="/home/marketing/social/new">{t("act.create")}</TextLink>
        </p>
      )}
    </section>
  );
}

async function PostedView({ storeId, when, now }: { storeId: string; when: (date: Date) => string; now: Date }) {
  const t = await getT("socialPosts");
  const locale = await getLocale();
  const [posts, { report }] = await Promise.all([
    db.socialPost.findMany({ where: { storeId, status: { in: ["posted", "partial", "failed"] } }, orderBy: { postedAt: "desc" }, take: 60, select: LIST_SELECT }).catch(() => []),
    loadAnalytics(storeId, resolveRange({ range: "30d" }, now), now),
  ]);
  const social = report.channels.filter((row) => ["instagram", "facebook", "whatsapp", "tiktok", "x"].includes(row.key));
  const max = Math.max(1, ...social.map((row) => row.sales));
  return (
    <div className="grid gap-5">
      <PostList posts={posts} when={when} empty={t("empty.posted")} />
      <Card className="p-5">
        <CardHead title={t("sales.title")} sub={t("sales.sub")} action={<TextLink href="/home/analytics">{t("sales.full")}</TextLink>} />
        {social.length ? (
          <ul className="m-0 mt-4 grid list-none gap-4 p-0">
            {social.map((row) => (
              <li key={row.key}>
                <ShareBar label={row.label} value={t("sales.paid", { count: formatNumber(row.orders, locale), sales: naira(row.sales) })} share={row.sales / max} />
                {row.visits > 0 && <div className="mt-1 text-[12.5px] text-app-ink-soft">{t("sales.visits", { count: row.visits })}</div>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">{t("sales.empty")}</p>
        )}
      </Card>
    </div>
  );
}
