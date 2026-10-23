import Link from "next/link";
import { AppPage, EmptyState, FilterChips, ListCard, Pill, PillLink, SearchForm, Thumb } from "@/components/app-kit";
import { CountRow, adminFrame, formatDate, formatMoney, withParams } from "@/components/admin/AdminKit";
import { requireAdminSection } from "@/lib/admin-team/service.server";
import { SELLER_FILTERS, listSellers, sellerCounts, type SellerFilter } from "@/lib/admin/sellers.server";
import { storeUrl } from "@/lib/marketing/brand";

// Admin › Sellers: every shop, like Suppliers and Logistics. Shop and business details only; the owner's contact
// details are on the shop's page, masked until revealed with a reason (Nigeria Data Protection Act 2023).

const FILTER_LABELS: Record<SellerFilter, string> = { active: "Live", suspended: "Paused", paid: "On a paid plan", new: "New this week" };

export default async function AdminSellersPage(props: { searchParams?: Promise<{ filter?: string; q?: string; page?: string }> }) {
  const user = await requireAdminSection("partners");
  const params = await props.searchParams;
  const filter = SELLER_FILTERS.find((value) => value === params?.filter);
  const q = params?.q?.trim().slice(0, 120) || undefined;
  const page = Math.max(1, Number.parseInt(params?.page ?? "1", 10) || 1);

  const [counts, list] = await Promise.all([sellerCounts(), listSellers({ filter, q, page })]);
  const base = { filter, q };

  return (
    <AppPage
      frame={adminFrame(user, "Search shops")}
      title="Sellers"
      sub="Every shop on Shopinbos: how it's doing, its plan, and pausing it when something's wrong. Owners' contact details stay hidden unless you need them."
      toolbar={
        <>
          <FilterChips
            items={[
              { label: "All", count: counts.all, href: withParams("/admin/sellers", { q }), active: !filter },
              ...SELLER_FILTERS.map((value) => ({ label: FILTER_LABELS[value], count: counts[value], href: withParams("/admin/sellers", { filter: value, q }), active: filter === value })),
            ]}
          />
          <SearchForm action="/admin/sellers" defaultValue={q} placeholder="Shop name, address or owner's exact email" keep={{ filter }} />
        </>
      }
    >
      <CountRow
        items={[
          { label: "All shops", value: counts.all },
          { label: "Live", value: counts.active },
          { label: "Paused", value: counts.suspended },
          { label: "On a paid plan", value: counts.paid },
          { label: "New this week", value: counts.new },
        ]}
      />

      {list.rows.length === 0 ? (
        <EmptyState icon="store" title={filter || q ? "No shops match" : "No shops yet"} action={filter || q ? <PillLink href="/admin/sellers">Clear filters</PillLink> : undefined}>
          {filter || q ? "Try another filter or search." : "Shops show up here as soon as sellers create them."}
        </EmptyState>
      ) : (
        <ListCard>
          {list.rows.map((row) => (
            <li key={row.id} className="px-4 py-3.5 sm:px-5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 lg:flex-nowrap">
                <Thumb src={row.logoUrl} label={row.name} size={44} />
                <div className="min-w-0 flex-1 basis-[200px]">
                  <Link href={`/admin/sellers/${row.id}`} className="block truncate text-[15px] font-extrabold text-app-ink no-underline hover:underline">
                    {row.name}
                  </Link>
                  <div className="truncate text-[13px] text-app-ink-soft">
                    {row.ownerFirstName && <>{row.ownerFirstName} · </>}
                    <a href={storeUrl(row)} target="_blank" rel="noreferrer" className="text-app-ink-soft">{row.customDomain ?? `/s/${row.slug}`}</a>
                    {row.city ? ` · ${row.city}` : ""}, {row.country}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Pill tone={row.status === "active" ? "success" : "danger"} dot>{row.status === "active" ? "Live" : "Paused"}</Pill>
                  <Pill tone={row.paidPlan ? "accent" : "muted"}>{row.plan}</Pill>
                </div>
                <div className="w-full text-[13px] text-app-ink-soft sm:w-auto lg:w-[220px] lg:shrink-0 lg:text-right">
                  {row.products} products · {row.orders30} paid orders (30 days)
                  <div>{formatMoney(row.sales30)} sales · {row.lastActive ? `active ${formatDate(row.lastActive)}` : "not active yet"}</div>
                </div>
                <div className="w-full text-[13px] text-app-ink-soft sm:w-auto lg:w-[110px] lg:shrink-0 lg:text-right">Joined {formatDate(row.createdAt)}</div>
                <PillLink href={`/admin/sellers/${row.id}`} size="sm" icon="arrow">Open</PillLink>
              </div>
            </li>
          ))}
        </ListCard>
      )}

      {list.pages > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-3 text-[13.5px] text-app-ink-soft">
          <span>Page {list.page} of {list.pages} · {list.total} shops</span>
          <span className="flex gap-2">
            {list.page > 1 && <PillLink href={withParams("/admin/sellers", { ...base, page: String(list.page - 1) })} size="sm" icon="arrowLeft">Newer</PillLink>}
            {list.page < list.pages && <PillLink href={withParams("/admin/sellers", { ...base, page: String(list.page + 1) })} size="sm" icon="arrow">Older</PillLink>}
          </span>
        </nav>
      )}

      <p className="mt-6 max-w-[760px] text-[12.5px] leading-[1.6] text-app-ink-soft">
        Personal data here is handled under the Nigeria Data Protection Act 2023: you see what running the platform needs.
        Opening an owner&apos;s contact details asks for a reason and is logged on their shop&apos;s page. There&apos;s no export.
      </p>
    </AppPage>
  );
}
