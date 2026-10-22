import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { db } from "@/lib/db/client";
import { AppPage, EmptyState, FilterChips, ListCard, Pill, SearchForm, StatGrid, StatTile, Thumb, type Tone } from "@/components/app-kit";
import { MessageBuyerButton } from "@/components/supplier/MessageBuyerButton";
import { money, shortDate, supplierFrame } from "@/components/supplier/supplier-kit";
import { getT } from "@/lib/i18n/server";
import { PageTip } from "@/components/learn/PageTip";

export const dynamic = "force-dynamic";

type Segment = "vip" | "repeat" | "new";

const SEGMENT: Record<Segment, { label: string; tone: Tone }> = {
  vip: { label: "VIP", tone: "accent" },
  repeat: { label: "Repeat", tone: "success" },
  new: { label: "New", tone: "info" },
};

type PageProps = {
  searchParams?: Promise<{ segment?: string; q?: string }>;
};

function href(segment?: string, q?: string) {
  const params = new URLSearchParams();
  if (segment) params.set("segment", segment);
  if (q) params.set("q", q);
  const query = params.toString();
  return `/supplier/buyers${query ? `?${query}` : ""}`;
}

export default async function SupplierBuyersPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);
  const t = await getT("supplier", "common");
  const tipT = await getT("tips");

  const orders = await db.wholesaleOrder.findMany({
    where: { supplierId: supplier.id },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { seller: { select: { id: true, name: true, city: true, country: true } } },
  });

  const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const buyerMap = new Map<string, { id: string; name: string; place: string; orders: number; total: number; first: Date; last: Date }>();
  for (const o of orders) {
    if (!o.seller) continue;
    const key = o.seller.id;
    const existing = buyerMap.get(key) ?? {
      id: key,
      name: o.seller.name,
      place: [o.seller.city, o.seller.country].filter(Boolean).join(" · "),
      orders: 0,
      total: 0,
      first: o.createdAt,
      last: o.createdAt,
    };
    existing.orders++;
    existing.total += Number(o.totalPrice);
    if (o.createdAt < existing.first) existing.first = o.createdAt;
    if (o.createdAt > existing.last) existing.last = o.createdAt;
    buyerMap.set(key, existing);
  }
  const segmentOf = (b: { total: number; orders: number }): Segment => (b.total > 1_000_000 ? "vip" : b.orders > 1 ? "repeat" : "new");
  const buyers = Array.from(buyerMap.values()).sort((a, b) => b.total - a.total);
  const newThisMonth = buyers.filter((b) => b.first.getTime() >= monthAgo).length;
  const repeatShare = buyers.length > 0 ? Math.round((buyers.filter((b) => b.orders > 1).length / buyers.length) * 100) : 0;
  const avgOrder = orders.length > 0 ? orders.reduce((s, o) => s + Number(o.totalPrice), 0) / orders.length : 0;

  const segment = params.segment && params.segment in SEGMENT ? (params.segment as Segment) : undefined;
  const q = params.q?.trim().toLowerCase() || undefined;
  const visible = buyers.filter((b) => (!segment || segmentOf(b) === segment) && (!q || b.name.toLowerCase().includes(q) || b.place.toLowerCase().includes(q)));

  return (
    <AppPage
      frame={supplierFrame(user, supplier, { searchPlaceholder: t("buyers.searchPlaceholder") })}
      title={t("buyers.title")}
      sub={buyers.length
        ? t("buyers.sub", { count: buyers.length, name: buyers[0].name, amount: money(buyers[0].total) })
        : t("buyers.subEmpty")}
      toolbar={
        buyers.length > 0 ? (
          <>
            <FilterChips
              items={[
                { label: t("products.filter.all"), href: href(undefined, params.q), count: buyers.length, active: !segment },
                ...(Object.keys(SEGMENT) as Segment[]).map((key) => ({
                  label: t.dynamic(`buyers.segment.${key}`, SEGMENT[key].label),
                  href: href(key, params.q),
                  count: buyers.filter((b) => segmentOf(b) === key).length,
                  active: segment === key,
                })),
              ]}
            />
            <SearchForm action="/supplier/buyers" defaultValue={params.q} placeholder={t("buyers.searchNameCity")} keep={{ segment }} />
          </>
        ) : undefined
      }
    >
      <PageTip who="rex" className="mb-5">{tipT("supplier.buyers")}</PageTip>
      <StatGrid className="mb-5">
        <StatTile tone="card" label={t("buyers.title")} value={buyers.length} hint={t("buyers.newIn30", { count: newThisMonth })} />
        <StatTile tone="card" label={t("buyers.vips")} value={buyers.filter((b) => b.total > 1_000_000).length} />
        <StatTile tone="card" label={t("buyers.buyAgain")} value={`${repeatShare}%`} hint={t("buyers.buyAgainHint")} />
        <StatTile tone="card" label={t("buyers.averageOrder")} value={money(avgOrder)} />
      </StatGrid>

      {visible.length === 0 ? (
        <EmptyState icon="users" title={buyers.length === 0 ? t("buyers.emptyTitle") : t("buyers.noMatchTitle")}>
          {buyers.length === 0
            ? t("buyers.emptyBody")
            : t("products.noMatchBody")}
        </EmptyState>
      ) : (
        <ListCard>
          {visible.slice(0, 50).map((b) => {
            const segKey = segmentOf(b);
            const seg = { ...SEGMENT[segKey], label: t.dynamic(`buyers.segment.${segKey}`, SEGMENT[segKey].label) };
            return (
              <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:flex-nowrap sm:px-5">
                <Thumb label={b.name} size={44} />
                <span className="min-w-0 flex-1 basis-[calc(100%-72px)] sm:basis-0">
                  <span className="block truncate text-[14.5px] font-extrabold">{b.name}</span>
                  <span className="block truncate text-[13px] text-app-ink-soft">{b.place || t("dashboard.noLocation")} · {t("buyers.lastOrder", { date: shortDate(b.last, t.locale) })}</span>
                </span>
                <Pill tone={seg.tone}>{seg.label}</Pill>
                <span className="w-[80px] text-[13.5px] text-app-ink-soft">{t("analytics.orderCount", { count: b.orders })}</span>
                <span className="w-[110px] text-right text-[14.5px] font-extrabold">{money(b.total)}</span>
                <MessageBuyerButton sellerUserId={b.id} sellerName={b.name} />
              </li>
            );
          })}
        </ListCard>
      )}
    </AppPage>
  );
}
