import Image from "next/image";
import { featuredSupplierUserIds } from "@/lib/plans/extras.server";
import { SUPPLIER_PLAN_FIRST } from "@/lib/plans/placement";
import Link from "next/link";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, EmptyState, FilterChips, Pill, PillLink } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { FIELD_SELECT } from "@/components/seller-settings/fields";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace, safeQuery } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { redirect } from "next/navigation";
import { MarketplaceChatWrapper } from "@/components/marketplace/MarketplaceChatWrapper";
import { ChatButton } from "@/components/marketplace/ChatButton";
import { getT } from "@/lib/i18n/server";
import { TipsGate } from "../_components/TipsGate";
import { VISIBLE_SUPPLIER, nearness, sellerHasPlace, supplierTrust } from "@/lib/marketplace/agreements.server";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT("marketplace");
  return { title: t("sup.title") };
}

type PageProps = {
  searchParams?: Promise<{ q?: string; country?: string; category?: string; near?: string; reach?: string }>;
};

const RISK_TONE = { low: "success", medium: "warning", high: "danger" } as const;

function norm(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

export default async function MarketplaceSuppliersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const t = await getT("marketplace");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace) return null;
  if (!workspace.store) redirect("/builder?firstRun=1");

  const store = workspace.store;
  const q = params?.q?.toLowerCase() ?? "";
  const selectedNear = norm(params?.near);
  // "all" also shows suppliers far from the seller (marked, since delivery from them costs more); near only by default.
  const showFar = norm(params?.reach) === "all";
  const storeCity = norm(store.city);
  const storeCountry = norm(store.country);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { ...VISIBLE_SUPPLIER };
  if (q) {
    where.OR = [
      { businessName: { contains: q, mode: "insensitive" } },
      { displayName: { contains: q, mode: "insensitive" } },
      { city: { contains: q, mode: "insensitive" } },
    ];
  }
  if (params?.country) where.country = params.country;
  if (params?.category) where.categories = { has: params.category };

  const allVerified = await safeQuery(() => db.supplier.findMany({
    where: { status: "active", marketplaceVisible: true, verificationStatus: "verified" },
    select: { categories: true, country: true },
  }), []);
  const allCategories = [...new Set(allVerified.flatMap((s) => s.categories))].sort();
  const allCountries = [...new Set(allVerified.map((s) => s.country).filter(Boolean))].sort();

  const rawSuppliers = await safeQuery(() => db.supplier.findMany({
    where,
    orderBy: [SUPPLIER_PLAN_FIRST, { trustScore: "desc" }, { createdAt: "desc" }],
    take: 300,
    select: {
      id: true, slug: true, displayName: true, description: true,
      logoUrl: true, bannerUrl: true, categories: true,
      city: true, address: true, country: true, businessType: true, trustScore: true, verificationStatus: true,
      userId: true,
      _count: { select: { products: { where: { status: "published" } } } },
    },
  }), []);
  // Suppliers near the seller (shared/supplier-trust.ts), so they can go and see the stock; far ones too when asked.
  const place = { city: store.city ?? user.city ?? null, address: null };
  const hasPlace = sellerHasPlace(place);
  const distances = new Map(rawSuppliers.map((supplier) => [supplier.id, nearness(place, supplier)]));
  const near = hasPlace ? rawSuppliers.filter((supplier) => distances.get(supplier.id)?.near) : [];
  const isFar = (supplier: typeof rawSuppliers[number]) => hasPlace && !distances.get(supplier.id)?.near;
  const hiddenFar = rawSuppliers.length - near.length;
  const shown = showFar ? rawSuppliers : near;
  const [trust, featuredIds] = await Promise.all([supplierTrust(shown.map((supplier) => supplier.id)), featuredSupplierUserIds()]);
  const featured = new Set(featuredIds);
  const isFeatured = (supplier: typeof rawSuppliers[number]) => (featured.has(supplier.userId) ? 1 : 0);
  const suppliers = [...shown].sort((a, b) => {
    const localScore = (supplier: typeof rawSuppliers[number]) => {
      if (selectedNear === "city") return storeCity && norm(supplier.city) === storeCity ? 2 : 0;
      if (selectedNear === "country") return storeCountry && norm(supplier.country) === storeCountry ? 1 : 0;
      return (storeCity && norm(supplier.city) === storeCity ? 2 : 0) + (storeCountry && norm(supplier.country) === storeCountry ? 1 : 0);
    };
    return Number(isFar(a)) - Number(isFar(b)) || isFeatured(b) - isFeatured(a) || localScore(b) - localScore(a) || (trust.get(a.id)?.risk.score ?? 100) - (trust.get(b.id)?.risk.score ?? 100);
  });
  const nearbyCount = suppliers.filter((supplier) =>
    (storeCity && norm(supplier.city) === storeCity) ||
    (storeCountry && norm(supplier.country) === storeCountry),
  ).length;
  const farCount = suppliers.filter(isFar).length;
  const withFarHref = `/marketplace/suppliers?${new URLSearchParams({ ...Object.fromEntries(Object.entries(params ?? {}).filter(([, value]) => typeof value === "string" && value)), reach: "all" }).toString()}`;

  const filtered = Boolean(params?.q || params?.category || params?.country || params?.near || showFar);
  const selectClass = `${FIELD_SELECT} h-[44px] rounded-full sm:w-auto`;

  return (
    <MarketplaceChatWrapper>
      <SellerPage
        user={user}
        store={storeSummary(store)}
        title={t("sup.title")}
        sub={`${t("sup.sub", { count: suppliers.length })}${nearbyCount > 0 ? ` ${t("sup.near", { count: nearbyCount })}` : ""}`}
      >
        <div className="grid gap-5">
          <FilterChips
            items={[
              { label: t("sup.chip.products"), href: "/marketplace" },
              { label: t("sup.chip.suppliers"), href: "/marketplace/suppliers", active: true },
              { label: t("sup.chip.delivery"), href: "/marketplace/logistics" },
            ]}
          />

          <TipsGate>
            <AssistantNote who="peggy">
              {t("sup.peggy", { place: `${store.city ? `${store.city}, ` : ""}${store.country ?? ""}` })}
            </AssistantNote>
          </TipsGate>

          <form method="GET" action="/marketplace/suppliers" role="search" className="flex flex-wrap items-center gap-2">
            <label className="flex min-h-[44px] w-full items-center gap-2 rounded-full border border-app-line bg-white px-4 sm:w-[300px]">
              <Icon name="search" size={16} className="shrink-0 text-app-ink-soft" />
              <span className="sr-only">{t("sup.search")}</span>
              <input name="q" defaultValue={params?.q ?? ""} placeholder={t("sup.search")} className="min-w-0 flex-1 border-0 bg-transparent text-[14.5px] outline-none placeholder:text-app-ink-faint" />
            </label>
            <select name="category" aria-label={t("sup.category")} defaultValue={params?.category ?? ""} className={selectClass}>
              <option value="">{t("sup.allCategories")}</option>
              {allCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
            </select>
            <select name="reach" aria-label={t("sup.reach")} defaultValue={showFar ? "all" : ""} className={selectClass}>
              <option value="">{t("sup.reachNear")}</option>
              <option value="all">{t("sup.reachAll")}</option>
            </select>
            {/* Rarely used: tucked away, open when one of them is set. */}
            <details open={Boolean(params?.country || params?.near)} className="group w-full sm:w-auto">
              <summary className="inline-flex min-h-[44px] cursor-pointer list-none items-center gap-1.5 rounded-full border border-app-line bg-white px-4 text-[14px] font-extrabold text-app-ink hover:border-app-line-strong [&::-webkit-details-marker]:hidden">
                {t("sup.moreFilters")} <Icon name="chevron" size={14} className="rotate-90 transition group-open:-rotate-90" />
              </summary>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select name="country" aria-label={t("sup.country")} defaultValue={params?.country ?? ""} className={selectClass}>
                  <option value="">{t("sup.allCountries")}</option>
                  {allCountries.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select name="near" aria-label={t("sup.sort")} defaultValue={params?.near ?? ""} className={selectClass}>
                  <option value="">{t("sup.best")}</option>
                  <option value="city">{t("sup.sameCity")}</option>
                  <option value="country">{t("sup.sameCountry")}</option>
                </select>
              </div>
            </details>
            <button type="submit" className="inline-flex min-h-[44px] items-center rounded-full bg-app-ink px-5 text-[14px] font-bold text-white hover:bg-black">{t("sup.filter")}</button>
            {filtered && <Link href="/marketplace/suppliers" className="px-2 text-[14px] font-extrabold text-app-accent-ink no-underline hover:underline">{t("sup.clear")}</Link>}
          </form>

          {!hasPlace ? (
            <AssistantNote who="peggy" action={<PillLink href="/home/settings" tone="ink" size="sm">{t("trust.addCityBtn")}</PillLink>}>{t("trust.addCity")}</AssistantNote>
          ) : null}

          {showFar && farCount > 0 ? (
            <AssistantNote who="rex">{t("sup.farNote", { count: farCount })}</AssistantNote>
          ) : !showFar && hasPlace && hiddenFar > 0 ? (
            <AssistantNote who="peggy" action={<PillLink href={withFarHref} tone="ink" size="sm">{t("sup.showFarBtn")}</PillLink>}>{t("sup.farHidden", { count: hiddenFar })}</AssistantNote>
          ) : null}

          {suppliers.length === 0 ? (
            <EmptyState icon="people" title={filtered ? t("sup.noMatch") : t("sup.noneYet")} action={filtered ? <PillLink href="/marketplace/suppliers" tone="ink">{t("sup.clearFilters")}</PillLink> : undefined}>
              {filtered ? t("sup.tryDifferent") : t("sup.showOnce")}
            </EmptyState>
          ) : (
            <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3 min-[1900px]:grid-cols-4">
              {suppliers.map((s) => {
                const risk = trust.get(s.id)?.risk;
                const km = distances.get(s.id)?.km;
                const far = isFar(s);
                const location = [s.city, s.country].filter(Boolean).join(", ");
                const logo = (
                  <span className="block h-14 w-14 shrink-0 overflow-hidden rounded-[14px] border border-app-line bg-white">
                    {s.logoUrl ? (
                      <Image src={s.logoUrl} alt="" width={56} height={56} className="h-full w-full object-cover" unoptimized />
                    ) : (
                      <span className="grid h-full w-full place-items-center bg-app-canvas text-[18px] font-extrabold text-app-ink">{s.displayName.charAt(0).toUpperCase()}</span>
                    )}
                  </span>
                );
                return (
                  <li key={s.id} className="flex min-w-0 flex-col overflow-hidden rounded-[22px] border border-app-line bg-white">
                    {/* The banner only when the supplier has one: an empty grey band looked broken. */}
                    {s.bannerUrl ? (
                      <div className="relative h-28 bg-app-canvas bg-cover bg-center" style={{ backgroundImage: `url(${s.bannerUrl})` }}>
                        <div className="absolute -bottom-7 left-4 rounded-[16px] bg-white p-[3px]">{logo}</div>
                      </div>
                    ) : null}
                    <div className={`flex flex-1 flex-col gap-3 px-4 pb-4 ${s.bannerUrl ? "pt-10" : "pt-4"}`}>
                      <div className="flex min-w-0 items-start gap-3">
                        {s.bannerUrl ? null : logo}
                        <div className="min-w-0 flex-1">
                          <Link href={`/suppliers/${s.slug}`} className="block truncate text-[16.5px] font-extrabold leading-tight text-app-ink no-underline hover:underline">{s.displayName}</Link>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-app-ink-soft">
                            {location ? <span className="inline-flex items-center gap-1"><Icon name="pin" size={13} className="shrink-0" />{location}</span> : null}
                            {s.businessType ? <span>· {s.businessType.replace(/_/g, " ")}</span> : null}
                            {typeof km === "number" ? <span>· {t("trust.km", { km: String(Math.max(1, Math.round(km))) })}</span> : null}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {far ? <Pill tone="warning" dot>{t("sup.farBadge")}</Pill> : null}
                        {featured.has(s.userId) ? <Pill tone="ink">{t("featured")}</Pill> : null}
                        {s.verificationStatus === "verified" ? <Pill tone="success" dot>{t("trust.verified")}</Pill> : <Pill tone="danger" dot>{s.verificationStatus === "pending" ? t("trust.pending") : t("trust.unverified")}</Pill>}
                        {risk ? <Pill tone={RISK_TONE[risk.level]}>{t.dynamic(`trust.risk.${risk.level}`, "", { score: risk.score })}</Pill> : null}
                      </div>
                      {far ? (
                        <p className="m-0 flex items-start gap-1.5 rounded-[12px] bg-app-canvas px-3 py-2 text-[13px] font-semibold leading-[1.45] text-app-ink">
                          <Icon name="truck" size={14} className="mt-0.5 shrink-0" />{t("sup.farFees")}
                        </p>
                      ) : null}
                      {s.description ? (
                        <p className="m-0 line-clamp-2 text-[13.5px] leading-[1.5] text-app-ink-soft">{s.description}</p>
                      ) : null}
                      {s.categories.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {s.categories.slice(0, 3).map((cat) => <Pill key={cat}>{cat}</Pill>)}
                          {s.categories.length > 3 ? <Pill>+{s.categories.length - 3}</Pill> : null}
                        </div>
                      ) : null}
                      <div className="mt-auto grid gap-2 pt-1">
                        <PillLink href={far ? `/suppliers/${s.slug}` : `/marketplace?supplier=${s.slug}`} size="sm" tone="ink" className="min-h-[42px] w-full whitespace-nowrap">
                          {t("sup.theirProducts")}{s._count.products > 0 ? ` · ${s._count.products}` : ""}
                        </PillLink>
                        <div className="grid grid-cols-2 gap-2">
                          <PillLink href={`/suppliers/${s.slug}`} size="sm" className="min-h-[40px] w-full whitespace-nowrap">{t("sup.profile")}</PillLink>
                          <ChatButton contactId={s.id} />
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SellerPage>
    </MarketplaceChatWrapper>
  );
}
