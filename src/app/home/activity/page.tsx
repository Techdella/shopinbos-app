import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { Card, EmptyState, FilterChips } from "@/components/app-kit";
import { Icon, type IconName } from "@/components/ui/Icon";
import { getLocale, getT } from "@/lib/i18n/server";
import { formatDate, type Locale } from "@shared/i18n";
import { pageWindow } from "@/lib/pagination";
import { Pagination } from "@/components/seller/Pagination";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("home");
  return { title: t("activity.title") };
}

const TYPES = ["order", "inventory", "payment", "logistics", "product", "customer", "system"] as const;

const ICONS: Record<string, IconName> = {
  order: "cart",
  inventory: "box",
  payment: "card",
  logistics: "truck",
  product: "tag",
  customer: "users",
  system: "settings",
};

const DAY = 86_400_000;
const PAGE_SIZE = 100;

function lagosDay(date: Date) {
  return new Date(date.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

function dayHeading(key: string, today: string, labels: { today: string; yesterday: string }, locale: Locale) {
  const diff = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${key}T00:00:00Z`)) / DAY);
  if (diff === 0) return labels.today;
  if (diff === 1) return labels.yesterday;
  // Noon UTC keeps the Lagos calendar day the same as the key.
  return formatDate(new Date(`${key}T12:00:00Z`), locale, { weekday: diff < 7 ? "long" : undefined, day: "numeric", month: "long" });
}

function timeOf(date: Date, locale: Locale) {
  return formatDate(date, locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

/** Event types look like "order_created"; the first word is the group. */
function groupOf(type: string) {
  return type.split(/[_.:-]/)[0];
}

function linkOf(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const link = (metadata as Record<string, unknown>).link;
  return typeof link === "string" && link.startsWith("/") ? link : null;
}

export default async function ActivityFeedPage({ searchParams }: { searchParams?: Promise<{ type?: string; page?: string }> }) {
  const params = await searchParams;
  const filter = (TYPES as readonly string[]).includes(params?.type ?? "") ? params!.type! : "";
  const user = await requireRole(["seller"], "/login");
  const t = await getT("home", "common");
  const locale = await getLocale();
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  const where = { storeId: store?.id ?? "__none__", ...(filter ? { type: { startsWith: filter } } : {}) };
  const paging = pageWindow(params?.page, store ? await db.activityEvent.count({ where }) : 0, PAGE_SIZE);
  const events = paging.total
    ? await db.activityEvent.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: paging.skip,
        take: paging.take,
        select: { id: true, type: true, title: true, description: true, metadata: true, createdAt: true },
      })
    : [];

  const today = lagosDay(new Date());
  const days: Array<{ key: string; items: typeof events }> = [];
  for (const event of events) {
    const key = lagosDay(event.createdAt);
    const last = days[days.length - 1];
    if (last?.key === key) last.items.push(event);
    else days.push({ key, items: [event] });
  }

  return (
    <SellerPage user={user} store={storeSummary(store)} title={t("activity.title")} sub={t("activity.sub")}>
      <div className="grid gap-5">
        <FilterChips
          items={[
            { label: t("activity.all"), href: "/home/activity", active: !filter },
            ...TYPES.map((type) => ({ label: t(`activity.type.${type}`), href: `/home/activity?type=${type}`, active: filter === type })),
          ]}
        />

        {days.length === 0 ? (
          <EmptyState icon="clock" title={filter ? t("activity.nothingHere") : t("activity.none")}>
            {t("activity.emptySub")}
          </EmptyState>
        ) : (
          days.map((day) => (
            <section key={day.key} aria-labelledby={`day-${day.key}`}>
              <h2 id={`day-${day.key}`} className="mb-2 mt-0 text-[15px] font-extrabold">{dayHeading(day.key, today, { today: t("time.today"), yesterday: t("time.yesterday") }, locale)}</h2>
              <Card className="overflow-hidden">
                <ol className="m-0 list-none divide-y divide-app-line p-0">
                  {day.items.map((event) => {
                    const link = linkOf(event.metadata);
                    return (
                      <li key={event.id} className="flex items-start gap-3 px-4 py-3.5 sm:gap-4 sm:px-5">
                        <time dateTime={event.createdAt.toISOString()} className="w-11 shrink-0 pt-1 text-[12.5px] tabular-nums text-app-ink-soft">{timeOf(event.createdAt, locale)}</time>
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-app-canvas">
                          <Icon name={ICONS[groupOf(event.type)] ?? "settings"} size={16} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="break-words text-[14.5px] font-bold">{event.title}</div>
                          {event.description && <div className="mt-0.5 break-words text-[13.5px] leading-[1.45] text-app-ink-soft">{event.description}</div>}
                          {link && (
                            <a href={link} className="mt-1 inline-flex min-h-[32px] items-center gap-1 text-[13px] font-extrabold text-app-accent-ink no-underline hover:underline">
                              {t("view")} <Icon name="chevRight" size={12} />
                            </a>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </Card>
            </section>
          ))
        )}
        <Pagination {...paging} base="/home/activity" params={{ type: filter || undefined }} label={t("activity.pages")} className="" />
      </div>
    </SellerPage>
  );
}
