import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { db } from "@/lib/db/client";
import { AppPage, EmptyState, FilterChips, ListCard, Pill, SearchForm, StatGrid, StatTile, Thumb, type Tone } from "@/components/app-kit";
import { MessageBuyerButton } from "@/components/supplier/MessageBuyerButton";
import { money, shortDate, supplierFrame } from "@/components/supplier/supplier-kit";

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
      frame={supplierFrame(user, supplier, { searchPlaceholder: "Search buyers…" })}
      title="Buyers"
      sub={buyers.length
        ? `${buyers.length} seller${buyers.length === 1 ? "" : "s"} stock your products. Top buyer: ${buyers[0].name}, ${money(buyers[0].total)} so far.`
        : "The shops that buy from you show up here."}
      toolbar={
        buyers.length > 0 ? (
          <>
            <FilterChips
              items={[
                { label: "All", href: href(undefined, params.q), count: buyers.length, active: !segment },
                ...(Object.keys(SEGMENT) as Segment[]).map((key) => ({
                  label: SEGMENT[key].label,
                  href: href(key, params.q),
                  count: buyers.filter((b) => segmentOf(b) === key).length,
                  active: segment === key,
                })),
              ]}
            />
            <SearchForm action="/supplier/buyers" defaultValue={params.q} placeholder="Search name or city" keep={{ segment }} />
          </>
        ) : undefined
      }
    >
      <StatGrid className="mb-5">
        <StatTile tone="card" label="Buyers" value={buyers.length} hint={`${newThisMonth} new in the last 30 days`} />
        <StatTile tone="card" label="VIPs (over ₦1M)" value={buyers.filter((b) => b.total > 1_000_000).length} />
        <StatTile tone="card" label="Buy again" value={`${repeatShare}%`} hint="ordered more than once" />
        <StatTile tone="card" label="Average order" value={money(avgOrder)} />
      </StatGrid>

      {visible.length === 0 ? (
        <EmptyState icon="users" title={buyers.length === 0 ? "No buyers yet" : "No buyers match"}>
          {buyers.length === 0
            ? "When sellers place wholesale or dropship orders with you, each shop shows up here with what they've spent."
            : "Try another filter or clear the search."}
        </EmptyState>
      ) : (
        <ListCard>
          {visible.slice(0, 50).map((b) => {
            const seg = SEGMENT[segmentOf(b)];
            return (
              <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:flex-nowrap sm:px-5">
                <Thumb label={b.name} size={44} />
                <span className="min-w-0 flex-1 basis-[calc(100%-72px)] sm:basis-0">
                  <span className="block truncate text-[14.5px] font-extrabold">{b.name}</span>
                  <span className="block truncate text-[13px] text-app-ink-soft">{b.place || "Location not set"} · last order {shortDate(b.last)}</span>
                </span>
                <Pill tone={seg.tone}>{seg.label}</Pill>
                <span className="w-[80px] text-[13.5px] text-app-ink-soft">{b.orders} order{b.orders === 1 ? "" : "s"}</span>
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
