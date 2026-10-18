import Image from "next/image";
import Link from "next/link";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, EmptyState, FilterChips, Pill, PillLink } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { FIELD_SELECT } from "@/components/seller-settings/fields";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace, safeQuery } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { payWhenItArrivesWhere } from "@/lib/logistics/payin-deadline";
import { redirect } from "next/navigation";
import { MarketplaceChatWrapper } from "@/components/marketplace/MarketplaceChatWrapper";
import { ChatButton } from "@/components/marketplace/ChatButton";
import { formatMoney, type Locale } from "@shared/i18n";
import { getLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT("marketplace");
  return { title: t("sup.chip.delivery") };
}

function fmtMoney(n: number, locale: Locale = "en") {
  if (locale !== "en") return formatMoney(n, locale);
  return "\u20A6" + n.toLocaleString("en-NG");
}

type PageProps = {
  searchParams?: Promise<{ q?: string; country?: string; zone?: string; near?: string; cod?: string }>;
};

function norm(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

export default async function MarketplaceLogisticsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const t = await getT("marketplace");
  const locale = await getLocale();
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace) return null;
  if (!workspace.store) redirect("/builder?firstRun=1");

  const store = workspace.store;
  const q = params?.q?.toLowerCase() ?? "";
  const selectedNear = norm(params?.near);
  const storeCity = norm(store.city);
  const storeCountry = norm(store.country);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { status: "active", verificationStatus: "verified", ownerId: null };
  if (q) {
    where.OR = [
      { companyName: { contains: q, mode: "insensitive" } },
      { displayName: { contains: q, mode: "insensitive" } },
      { city: { contains: q, mode: "insensitive" } },
    ];
  }
  if (params?.country) where.country = params.country;
  if (params?.zone) where.coverageZones = { has: params.zone };
  // ?cod=1 (booking a pay-when-it-arrives delivery): skip partners paused for a late cash pay-in.
  Object.assign(where, payWhenItArrivesWhere(params?.cod === "1" || params?.cod === "true"));

  const allVerified = await safeQuery(() => db.logisticsPartner.findMany({
    where: { status: "active", verificationStatus: "verified", ownerId: null },
    select: { coverageZones: true, country: true },
  }), []);
  const allZones = [...new Set(allVerified.flatMap((p) => p.coverageZones))].sort();
  const allCountries = [...new Set(allVerified.map((p) => p.country).filter(Boolean))].sort();

  const rawPartners = await safeQuery(() => db.logisticsPartner.findMany({
    where,
    orderBy: [{ reliabilityScore: "desc" }, { createdAt: "desc" }],
    take: 50,
    select: {
      id: true, slug: true, displayName: true, description: true,
      logoUrl: true, vehicleTypes: true, deliveryTypes: true,
      coverageZones: true, basePrice: true, estimatedSpeed: true,
      city: true, country: true, reliabilityScore: true,
      userId: true,
    },
  }), []);
  const partners = [...rawPartners].sort((a, b) => {
    const localScore = (partner: typeof rawPartners[number]) => {
      const cityMatch = storeCity && (norm(partner.city) === storeCity || partner.coverageZones.some((zone) => norm(zone).includes(storeCity)));
      const countryMatch = storeCountry && norm(partner.country) === storeCountry;
      if (selectedNear === "city") return cityMatch ? 2 : 0;
      if (selectedNear === "country") return countryMatch ? 1 : 0;
      return (cityMatch ? 2 : 0) + (countryMatch ? 1 : 0);
    };
    return localScore(b) - localScore(a) || b.reliabilityScore - a.reliabilityScore;
  });
  const nearbyCount = partners.filter((partner) =>
    (storeCity && (norm(partner.city) === storeCity || partner.coverageZones.some((zone) => norm(zone).includes(storeCity)))) ||
    (storeCountry && norm(partner.country) === storeCountry),
  ).length;

  const filtered = Boolean(params?.q || params?.zone || params?.country || params?.near);
  const selectClass = `${FIELD_SELECT} h-[44px] rounded-full sm:w-auto`;

  return (
    <MarketplaceChatWrapper>
      <SellerPage
        user={user}
        store={storeSummary(store)}
        title={t("sup.chip.delivery")}
        sub={`${t("lp.sub", { count: partners.length })}${nearbyCount > 0 ? ` ${t("lp.cover", { count: nearbyCount })}` : ""}`}
      >
        <div className="grid gap-5">
          <FilterChips
            items={[
              { label: t("sup.chip.products"), href: "/marketplace" },
              { label: t("sup.chip.suppliers"), href: "/marketplace/suppliers" },
              { label: t("sup.chip.delivery"), href: "/marketplace/logistics", active: true },
            ]}
          />

          <form method="GET" action="/marketplace/logistics" role="search" className="flex flex-wrap items-center gap-2">
            <label className="flex min-h-[44px] w-full items-center gap-2 rounded-full border border-app-line bg-white px-4 sm:w-[300px]">
              <Icon name="search" size={16} className="shrink-0 text-app-ink-soft" />
              <span className="sr-only">{t("lp.search")}</span>
              <input name="q" defaultValue={params?.q ?? ""} placeholder={t("lp.search")} className="min-w-0 flex-1 border-0 bg-transparent text-[14.5px] outline-none placeholder:text-app-ink-faint" />
            </label>
            <select name="zone" aria-label={t("lp.area")} defaultValue={params?.zone ?? ""} className={selectClass}>
              <option value="">{t("lp.allAreas")}</option>
              {allZones.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
            <select name="country" aria-label={t("sup.country")} defaultValue={params?.country ?? ""} className={selectClass}>
              <option value="">{t("sup.allCountries")}</option>
              {allCountries.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select name="near" aria-label={t("sup.sort")} defaultValue={params?.near ?? ""} className={selectClass}>
              <option value="">{t("sup.best")}</option>
              <option value="city">{t("sup.sameCity")}</option>
              <option value="country">{t("sup.sameCountry")}</option>
            </select>
            <button type="submit" className="inline-flex min-h-[44px] items-center rounded-full bg-app-ink px-5 text-[14px] font-extrabold text-white hover:bg-black">{t("sup.filter")}</button>
            {filtered && <Link href="/marketplace/logistics" className="px-2 text-[14px] font-extrabold text-app-accent-ink no-underline hover:underline">{t("sup.clear")}</Link>}
          </form>

          <AssistantNote who="peggy">
            {t("lp.peggy", { place: `${store.city ? `${store.city}, ` : ""}${store.country ?? ""}` })}
          </AssistantNote>

          {partners.length === 0 ? (
            <EmptyState icon="truck" title={filtered ? t("lp.noMatch") : t("lp.noneYet")} action={filtered ? <PillLink href="/marketplace/logistics" tone="ink">{t("sup.clearFilters")}</PillLink> : undefined}>
              {filtered ? t("sup.tryDifferent") : t("lp.showOnce")}
            </EmptyState>
          ) : (
            <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2 2xl:grid-cols-3 min-[1900px]:grid-cols-4">
              {partners.map((p) => (
                <li key={p.id} className="flex min-w-0 flex-col rounded-[22px] border border-app-line bg-white p-4">
                  <div className="flex items-start gap-3">
                    <span className="h-14 w-14 shrink-0 overflow-hidden rounded-[14px] border border-app-line bg-app-canvas">
                      {p.logoUrl ? (
                        <Image src={p.logoUrl} alt="" width={56} height={56} className="h-full w-full object-cover" unoptimized />
                      ) : (
                        <span className="grid h-full w-full place-items-center"><Icon name="truck" size={22} /></span>
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="m-0 truncate text-[16px] font-extrabold">{p.displayName}</h2>
                      <div className="truncate text-[13px] text-app-ink-soft">{p.city ?? ""}{p.city && p.country ? ", " : ""}{p.country ?? ""}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[22px] font-extrabold leading-none">{p.reliabilityScore}</div>
                      <div className="text-[12px] text-app-ink-soft">{t("lp.reliability")}</div>
                    </div>
                  </div>
                  {p.description && <p className="mb-0 mt-3 line-clamp-3 text-[13.5px] leading-[1.5] text-app-ink-soft">{p.description}</p>}
                  {(p.vehicleTypes.length > 0 || p.deliveryTypes.length > 0) && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {p.vehicleTypes.slice(0, 3).map((v) => <Pill key={v}>{v}</Pill>)}
                      {p.deliveryTypes.slice(0, 3).map((d) => <Pill key={d} tone="info">{d.replace(/_/g, " ")}</Pill>)}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[13.5px]">
                    {p.basePrice > 0 && <span className="font-extrabold">{t("lp.from", { price: fmtMoney(p.basePrice, locale) })}</span>}
                    {p.coverageZones.length > 0 && <span className="text-app-ink-soft">{t("lp.areas", { count: p.coverageZones.length })}</span>}
                    {p.estimatedSpeed && <span className="text-app-ink-soft">{p.estimatedSpeed}</span>}
                  </div>
                  <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
                    <ChatButton contactId={p.userId} />
                    <PillLink href={`/home/logistics?intent=quote&partner=${p.id}#quote`} size="sm" tone="ink" className="min-h-[40px]">{t("lp.quote")}</PillLink>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SellerPage>
    </MarketplaceChatWrapper>
  );
}
