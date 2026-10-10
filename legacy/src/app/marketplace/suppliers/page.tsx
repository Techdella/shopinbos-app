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

type PageProps = {
  searchParams?: Promise<{ q?: string; country?: string; category?: string; near?: string }>;
};

function norm(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

export default async function MarketplaceSuppliersPage({ searchParams }: PageProps) {
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
      { businessName: { contains: q, mode: "insensitive" } },
      { displayName: { contains: q, mode: "insensitive" } },
      { city: { contains: q, mode: "insensitive" } },
    ];
  }
  if (params?.country) where.country = params.country;
  if (params?.category) where.categories = { has: params.category };

  const allVerified = await safeQuery(() => db.supplier.findMany({
    where: { status: "active", verificationStatus: "verified" },
    select: { categories: true, country: true },
  }), []);
  const allCategories = [...new Set(allVerified.flatMap((s) => s.categories))].sort();
  const allCountries = [...new Set(allVerified.map((s) => s.country).filter(Boolean))].sort();

  const rawSuppliers = await safeQuery(() => db.supplier.findMany({
    where,
    orderBy: [{ trustScore: "desc" }, { createdAt: "desc" }],
    take: 50,
    select: {
      id: true, slug: true, displayName: true, description: true,
      logoUrl: true, bannerUrl: true, categories: true,
      city: true, country: true, businessType: true, trustScore: true,
      userId: true,
      _count: { select: { products: { where: { status: "published" } } } },
    },
  }), []);
  const suppliers = [...rawSuppliers].sort((a, b) => {
    const localScore = (supplier: typeof rawSuppliers[number]) => {
      if (selectedNear === "city") return storeCity && norm(supplier.city) === storeCity ? 2 : 0;
      if (selectedNear === "country") return storeCountry && norm(supplier.country) === storeCountry ? 1 : 0;
      return (storeCity && norm(supplier.city) === storeCity ? 2 : 0) + (storeCountry && norm(supplier.country) === storeCountry ? 1 : 0);
    };
    return localScore(b) - localScore(a) || b.trustScore - a.trustScore;
  });
  const nearbyCount = suppliers.filter((supplier) =>
    (storeCity && norm(supplier.city) === storeCity) ||
    (storeCountry && norm(supplier.country) === storeCountry),
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
              Suppliers.{" "}
              <span style={{ color: "var(--teal-700)", fontStyle: "italic" }}>{suppliers.length} verified partners.</span>
            </h1>
            <div className="pg-sub">
              Browse verified suppliers, view their catalog, and request quotes or place wholesale orders.
              {nearbyCount > 0 ? ` ${nearbyCount} match your store location.` : ""}
            </div>
          </div>
          <div className="pg-acts">
            <Link href="/marketplace" className="dbtn dBtn-ghost dBtn-sm">
              Products
            </Link>
            <Link href="/marketplace/logistics" className="dbtn dBtn-ghost dBtn-sm">
              Logistics
            </Link>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap", alignItems: "center" }}>
          <form method="GET" action="/marketplace/suppliers" style={{ display: "flex", gap: 10, flex: 1, flexWrap: "wrap", alignItems: "center" }}>
            <div className="sb-search" style={{ flex: "1 1 200px", maxWidth: 300 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5"/></svg>
              <input name="q" defaultValue={params?.q ?? ""} placeholder="Search suppliers..." style={{ border: "none", background: "none", outline: "none", flex: 1, fontFamily: "inherit", fontSize: 13 }} />
            </div>
            <div className="sel" style={{ minWidth: 140, fontSize: 12.5, padding: "7px 11px", display: "flex", alignItems: "center", gap: 6 }}>
              <select name="category" defaultValue={params?.category ?? ""} style={{ border: "none", background: "none", outline: "none", flex: 1, fontFamily: "inherit", fontSize: 12.5, color: "inherit" }}>
                <option value="">All categories</option>
                {allCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
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
            {(params?.q || params?.category || params?.country || params?.near) && (
              <Link href="/marketplace/suppliers" className="dbtn dBtn-ghost dBtn-sm" style={{ color: "var(--teal-700)" }}>Clear</Link>
            )}
          </form>
        </div>

        <div className="card" style={{ marginTop: 14, padding: 14, borderLeft: "3px solid var(--teal-600)" }}>
          <div style={{ fontSize: 11, color: "var(--teal-700)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Peggy supplier picks</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-700)", lineHeight: 1.45 }}>
            Showing trusted suppliers first, then partners closest to {store.city ? `${store.city}, ` : ""}{store.country}. Use chat to confirm MOQ, samples, and delivery windows before adding products.
          </div>
        </div>

        <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
          {suppliers.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--ink-500)", fontSize: 14 }}>
              No verified suppliers yet. Suppliers appear here once they complete onboarding and get verified by admin.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 14 }}>
              {suppliers.map((s) => (
                <div key={s.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <div style={{
                    height: 80,
                    background: s.bannerUrl
                      ? `url(${s.bannerUrl}) center/cover`
                      : "linear-gradient(135deg, #195754, #0a3835)",
                    position: "relative",
                  }}>
                    {s.logoUrl && (
                      <div style={{
                        position: "absolute", bottom: -24, left: 16,
                        width: 52, height: 52, borderRadius: 12, overflow: "hidden",
                        border: "3px solid white", background: "white",
                      }}>
                        <Image src={s.logoUrl} alt={s.displayName} width={52} height={52} style={{ objectFit: "cover" }} unoptimized />
                      </div>
                    )}
                  </div>
                  <div style={{ padding: s.logoUrl ? "32px 16px 16px" : "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <Link href={`/suppliers/${s.slug}`} style={{ fontWeight: 600, fontSize: 15, color: "inherit", textDecoration: "none" }}>{s.displayName}</Link>
                        <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>
                          {s.city ?? ""}{s.city && s.country ? ", " : ""}{s.country ?? ""}
                          {s.businessType ? ` · ${s.businessType.replace(/_/g, " ")}` : ""}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 20, fontWeight: 500, color: "var(--teal-700)", lineHeight: 1 }}>{s.trustScore}</div>
                        <div style={{ fontSize: 10.5, color: "var(--ink-500)", textTransform: "uppercase" }}>Trust</div>
                      </div>
                    </div>
                    {s.description && (
                      <div style={{ fontSize: 12.5, color: "var(--ink-600)", marginTop: 8, lineHeight: 1.5 }}>
                        {s.description.length > 150 ? `${s.description.slice(0, 150)}...` : s.description}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                      {s.categories.slice(0, 4).map((cat) => (
                        <span key={cat} className="chip" style={{ fontSize: 11 }}>{cat}</span>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                      <Link href={`/suppliers/${s.slug}`} className="dbtn dBtn-soft dBtn-sm" style={{ flex: 1, justifyContent: "center", fontSize: 12 }}>
                        Profile ({s._count.products})
                      </Link>
                      <ChatButton contactId={s.id} />
                      <Link href={`/marketplace?supplier=${s.slug}`} className="dbtn dBtn-mint dBtn-sm" style={{ flex: 1, justifyContent: "center", fontSize: 12 }}>
                        Request quote
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
