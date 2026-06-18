import Image from "next/image";
import Link from "next/link";
import { AppFrame } from "@/components/shell/AppFrame";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace, safeQuery } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { redirect } from "next/navigation";
import { MarketplaceChatWrapper } from "@/components/marketplace/MarketplaceChatWrapper";
import { ChatButton } from "@/components/marketplace/ChatButton";

export const dynamic = "force-dynamic";

function fmtMoney(n: number) {
  return "\u20A6" + n.toLocaleString("en-NG");
}

type PageProps = {
  searchParams?: Promise<{ q?: string; country?: string; zone?: string; near?: string }>;
};

function norm(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

export default async function MarketplaceLogisticsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace) return null;
  if (!workspace.store) redirect("/builder?firstRun=1");

  const store = workspace.store;
  const q = params?.q?.toLowerCase() ?? "";
  const selectedNear = norm(params?.near);
  const storeCity = norm(store.city);
  const storeCountry = norm(store.country);

  const where: any = { status: "active", verificationStatus: "verified" };
  if (q) {
    where.OR = [
      { companyName: { contains: q, mode: "insensitive" } },
      { displayName: { contains: q, mode: "insensitive" } },
      { city: { contains: q, mode: "insensitive" } },
    ];
  }
  if (params?.country) where.country = params.country;
  if (params?.zone) where.coverageZones = { has: params.zone };

  const allVerified = await safeQuery(() => db.logisticsPartner.findMany({
    where: { status: "active", verificationStatus: "verified" },
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

  return (
    <MarketplaceChatWrapper>
    <AppFrame
      role="seller"
      storeName={store.name}
      storeSlug={store.slug}
      storeInitial={store.name?.[0]?.toUpperCase()}
      userName={user.name ?? "You"}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <div className="flex-1 overflow-y-auto" style={{ padding: "24px 28px 40px", background: "var(--canvas)" }}>
        <div className="pg-hero">
          <div>
            <h1>
              Logistics.{" "}
              <span style={{ color: "var(--teal-700)", fontStyle: "italic" }}>{partners.length} verified partners.</span>
            </h1>
            <div className="pg-sub">
              Find verified delivery partners, compare pricing, and book shipments for your orders.
              {nearbyCount > 0 ? ` ${nearbyCount} can support your store location.` : ""}
            </div>
          </div>
          <div className="pg-acts">
            <Link href="/marketplace" className="dbtn dBtn-ghost dBtn-sm">
              Products
            </Link>
            <Link href="/marketplace/suppliers" className="dbtn dBtn-ghost dBtn-sm">
              Suppliers
            </Link>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap", alignItems: "center" }}>
          <form method="GET" action="/marketplace/logistics" style={{ display: "flex", gap: 10, flex: 1, flexWrap: "wrap", alignItems: "center" }}>
            <div className="sb-search" style={{ flex: "1 1 200px", maxWidth: 300 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5"/></svg>
              <input name="q" defaultValue={params?.q ?? ""} placeholder="Search partners..." style={{ border: "none", background: "none", outline: "none", flex: 1, fontFamily: "inherit", fontSize: 13 }} />
            </div>
            <div className="sel" style={{ minWidth: 150, fontSize: 12.5, padding: "7px 11px", display: "flex", alignItems: "center", gap: 6 }}>
              <select name="zone" defaultValue={params?.zone ?? ""} style={{ border: "none", background: "none", outline: "none", flex: 1, fontFamily: "inherit", fontSize: 12.5, color: "inherit" }}>
                <option value="">All zones</option>
                {allZones.map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
            <div className="sel" style={{ minWidth: 130, fontSize: 12.5, padding: "7px 11px", display: "flex", alignItems: "center", gap: 6 }}>
              <select name="country" defaultValue={params?.country ?? ""} style={{ border: "none", background: "none", outline: "none", flex: 1, fontFamily: "inherit", fontSize: 12.5, color: "inherit" }}>
                <option value="">All countries</option>
                {allCountries.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="sel" style={{ minWidth: 130, fontSize: 12.5, padding: "7px 11px", display: "flex", alignItems: "center", gap: 6 }}>
              <select name="near" defaultValue={params?.near ?? ""} style={{ border: "none", background: "none", outline: "none", flex: 1, fontFamily: "inherit", fontSize: 12.5, color: "inherit" }}>
                <option value="">Best match</option>
                <option value="city">Same city</option>
                <option value="country">Same country</option>
              </select>
            </div>
            <button type="submit" className="dbtn dBtn-ghost dBtn-sm">Filter</button>
            {(params?.q || params?.zone || params?.country || params?.near) && (
              <Link href="/marketplace/logistics" className="dbtn dBtn-ghost dBtn-sm" style={{ color: "var(--teal-700)" }}>Clear</Link>
            )}
          </form>
        </div>

        <div className="card" style={{ marginTop: 14, padding: 14, borderLeft: "3px solid var(--indigo-500)" }}>
          <div style={{ fontSize: 11, color: "var(--indigo-500)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Peggy logistics picks</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-700)", lineHeight: 1.45 }}>
            Ranked by coverage near {store.city ? `${store.city}, ` : ""}{store.country}, reliability, and listed base price. Request a quote before promising delivery dates at checkout.
          </div>
        </div>

        <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
          {partners.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--ink-500)", fontSize: 14 }}>
              No verified logistics partners yet. Partners appear here once they complete onboarding and get verified by admin.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 14 }}>
              {partners.map((p) => (
                <div key={p.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <div style={{
                    height: 80,
                    background: "linear-gradient(135deg, #5b6ad0, #3a4ba6)",
                    position: "relative",
                  }}>
                    {p.logoUrl && (
                      <div style={{
                        position: "absolute", bottom: -24, left: 16,
                        width: 52, height: 52, borderRadius: 12, overflow: "hidden",
                        border: "3px solid white", background: "white",
                      }}>
                        <Image src={p.logoUrl} alt={p.displayName} width={52} height={52} style={{ objectFit: "cover" }} unoptimized />
                      </div>
                    )}
                  </div>
                  <div style={{ padding: p.logoUrl ? "32px 16px 16px" : "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{p.displayName}</div>
                        <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>
                          {p.city ?? ""}{p.city && p.country ? ", " : ""}{p.country ?? ""}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 20, fontWeight: 500, color: "var(--indigo-500)", lineHeight: 1 }}>{p.reliabilityScore}</div>
                        <div style={{ fontSize: 10.5, color: "var(--ink-500)", textTransform: "uppercase" }}>Reliability</div>
                      </div>
                    </div>
                    {p.description && (
                      <div style={{ fontSize: 12.5, color: "var(--ink-600)", marginTop: 8, lineHeight: 1.5 }}>
                        {p.description.length > 150 ? `${p.description.slice(0, 150)}...` : p.description}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                      {p.vehicleTypes.slice(0, 3).map((v) => (
                        <span key={v} className="chip" style={{ fontSize: 11 }}>{v}</span>
                      ))}
                      {p.deliveryTypes.slice(0, 3).map((d) => (
                        <span key={d} className="chip" style={{ fontSize: 11 }}>{d.replace(/_/g, " ")}</span>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 12, marginTop: 10, fontSize: 12 }}>
                      {p.coverageZones.length > 0 && (
                        <span style={{ color: "var(--ink-500)" }}>{p.coverageZones.length} zones</span>
                      )}
                      {p.basePrice > 0 && (
                        <span style={{ fontWeight: 600 }}>From {fmtMoney(p.basePrice)}</span>
                      )}
                      {p.estimatedSpeed && (
                        <span style={{ color: "var(--ink-500)" }}>{p.estimatedSpeed}</span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                      <ChatButton contactId={p.userId} />
                      <Link href={`/home/logistics?partner=${p.slug}`} className="dbtn dBtn-soft dBtn-sm" style={{ flex: 1, justifyContent: "center", fontSize: 12 }}>
                        Request quote
                      </Link>
                      <Link href={`/home/logistics?partner=${p.slug}`} className="dbtn dBtn-mint dBtn-sm" style={{ flex: 1, justifyContent: "center", fontSize: 12 }}>
                        Book delivery
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppFrame>
    </MarketplaceChatWrapper>
  );
}
