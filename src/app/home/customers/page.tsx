import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { AppPage, EmptyState, ListCard, ListRow, Pill, PillLink, StatGrid, StatTile } from "@/components/app-kit";
import { Avatar, sellerFrame, timeAgo } from "@/components/seller-core";
import { formatMoney, formatNumber, type Locale } from "@shared/i18n";
import { getLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const SHOWN = 100;

export async function generateMetadata() {
  const t = await getT("customers");
  return { title: t("title") };
}

function lastOrder(date: Date, locale: Locale, onDate: (date: string) => string) {
  const text = timeAgo(date, Date.now(), locale);
  if (locale !== "en") return text;
  return text === "Just now" || text === "Yesterday" ? text.toLowerCase() : /ago$/.test(text) ? text : onDate(text);
}

export default async function SellerCustomersPage() {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("customers", "orders", "common");
  const locale = await getLocale();
  const naira = (amount: number) => formatMoney(Math.round(amount), locale);
  const num = (value: number) => formatNumber(value, locale);
  const workspace = await getSellerWorkspace(user.id);

  const store = workspace?.store;
  const orders = store ? await db.retailOrder.findMany({
    where: { storeId: store.id }, orderBy: { createdAt: "desc" },
    select: { id: true, buyerName: true, buyerEmail: true, buyerPhone: true, total: true, createdAt: true, status: true },
  }) : [];

  const map = new Map<string, { key: string; name: string; email: string; orders: number; total: number; last: Date }>();
  for (const o of orders) {
    // Recorded sales may have no email: fall back to the phone, then the name.
    const key = o.buyerEmail.trim().toLowerCase() || o.buyerPhone?.replace(/\D/g, "") || `name:${o.buyerName.trim().toLowerCase()}`;
    const e = map.get(key) ?? { key, name: o.buyerName, email: o.buyerEmail || o.buyerPhone || "", orders: 0, total: 0, last: o.createdAt };
    e.orders++; e.total += Number(o.total); if (e.last < o.createdAt) e.last = o.createdAt;
    map.set(key, e);
  }
  const customers = [...map.values()].sort((a, b) => b.last.getTime() - a.last.getTime());
  const repeat = customers.filter((c) => c.orders > 1).length;
  const delivered = orders.filter((o) => o.status === "delivered").length;

  return (
    <AppPage
      frame={sellerFrame(user, store)}
      title={t("title")}
      sub={customers.length > 0 ? t("sub", { count: customers.length, repeat }) : t("subEmpty")}
    >
      <StatGrid className="mb-5">
        <StatTile tone="card" label={t("stat.customers")} value={num(customers.length)} hint={t("stat.allTime")} />
        <StatTile tone="card" label={t("stat.repeat")} value={num(repeat)} hint={t("stat.repeatHint")} />
        <StatTile tone="card" label={t("stat.orders")} value={num(orders.length)} hint={t("stat.allTime")} />
        <StatTile tone="card" label={t("stat.delivered")} value={num(delivered)} hint={t("stat.deliveredHint")} />
      </StatGrid>

      {customers.length === 0 ? (
        <EmptyState icon="users" title={t("empty")} action={<PillLink href="/home/orders/new" tone="ink" icon="plus">{t("recordSale")}</PillLink>}>
          {t("emptySub")}
        </EmptyState>
      ) : (
        <>
          <ListCard>
            {customers.slice(0, SHOWN).map((c) => (
              <ListRow key={c.key}>
                <div className="flex w-full min-w-0 items-start gap-3.5 md:items-center md:gap-4">
                  <Avatar name={c.name} size={44} />
                  <div className="grid min-w-0 flex-1 items-center gap-x-5 gap-y-1.5 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] xl:grid-cols-[minmax(0,1.8fr)_100px_110px_minmax(0,0.8fr)_120px]">
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-extrabold">{c.name}</div>
                      {c.email && <div className="truncate text-[13px] text-app-ink-soft">{c.email}</div>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13.5px] xl:contents">
                      <span>
                        {c.orders > 5 ? <Pill tone="accent">{t("badge.vip")}</Pill> : c.orders > 1 ? <Pill tone="success">{t("badge.repeat")}</Pill> : <Pill tone="info">{t("badge.new")}</Pill>}
                      </span>
                      <span className="text-app-ink-soft">{t("count.orders", { count: c.orders })}</span>
                      <span className="text-app-ink-soft">{t("lastOrder", { when: lastOrder(c.last, locale, (date) => t("onDate", { date })) })}</span>
                    </div>
                    <div className="text-[15px] font-extrabold md:text-right">{naira(c.total)}</div>
                  </div>
                </div>
              </ListRow>
            ))}
          </ListCard>
          {customers.length > SHOWN && (
            <p className="mb-0 mt-3 text-[13px] text-app-ink-soft">{t("showing", { shown: SHOWN, total: num(customers.length) })}</p>
          )}
        </>
      )}
    </AppPage>
  );
}
