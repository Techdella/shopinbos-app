import Link from "next/link";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Icon, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

type RateTier = { label?: string; price?: number | string; minOrder?: number; freeOver?: number };

function formatRate(rate: RateTier, currency = "NGN") {
  const symbol = currency === "GHS" ? "GH₵" : currency === "KES" ? "KSh" : "₦";
  if (rate.freeOver != null) return `Free over ${symbol}${Number(rate.freeOver).toLocaleString()}`;
  if (rate.price === 0 || rate.price === "0") return "Free";
  if (rate.price == null) return "Quote";
  return `${symbol}${Number(rate.price).toLocaleString()}`;
}

export default async function ShippingPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  const storeName = workspace?.store?.name ?? "Your Store";
  const storeSlug = workspace?.store?.slug ? `${workspace.store.slug}.shopinbos.shop` : undefined;
  const store = workspace?.store;
  const currency = store?.currency ?? "NGN";
  const initials = user.name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);

  const [shippingZones, logisticsPartners] = await Promise.all([
    store
      ? db.shippingZone.findMany({
          where: { storeId: store.id },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        })
      : Promise.resolve([]),
    db.logisticsPartner.findMany({
      where: { status: "active" },
      orderBy: { reliabilityScore: "desc" },
      take: 6,
      select: {
        id: true,
        displayName: true,
        city: true,
        country: true,
        coverageZones: true,
        reliabilityScore: true,
        rating: true,
        logoUrl: true,
        description: true,
      },
    }),
  ]);

  return (
    <AppFrame
      role="seller"
      storeName={storeName}
      storeSlug={storeSlug}
      storeInitial={storeName.charAt(0).toUpperCase()}
      userName={user.name}
      userInitials={initials}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 24 }}>
        <PageHead
          title="Delivery & Shipping"
          sub="Shipping zones shown at checkout, and logistics partners you can book through Shopinbos."
          actions={
            <Link href="/home/shipping/new" className="dbtn dBtn-mint" style={{ textDecoration: "none" }}>
              <Icon name="plus" size={14} /> Add zone
            </Link>
          }
        />

        {/* Custom shipping zones */}
        <section>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-500)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
            Your shipping zones
          </div>

          {shippingZones.length === 0 ? (
            <div className="card" style={{ padding: 28, textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--ink-800)" }}>No shipping zones set up</div>
              <div style={{ fontSize: 13, color: "var(--ink-500)", marginTop: 6, maxWidth: 400, marginInline: "auto", lineHeight: 1.6 }}>
                Add shipping zones to define delivery rates shown to customers at checkout. You can set flat-rate, free, or tiered pricing per region.
              </div>
              <Link href="/home/shipping/new" className="dbtn dBtn-mint" style={{ textDecoration: "none", display: "inline-flex", marginTop: 16 }}>
                <Icon name="plus" size={14} /> Create shipping zone
              </Link>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              {shippingZones.map((zone, i) => {
                const rates = Array.isArray(zone.rates) ? (zone.rates as RateTier[]) : [];
                return (
                  <div
                    key={zone.id}
                    style={{
                      borderTop: i > 0 ? "1px solid var(--ink-100)" : "none",
                      padding: "16px 20px",
                      opacity: zone.active ? 1 : 0.6,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: rates.length > 0 ? 10 : 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--teal-50)", color: "var(--teal-700)", display: "grid", placeItems: "center" }}>
                          <Icon name="pin" size={15} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink-900)" }}>{zone.name}</div>
                          {zone.regions.length > 0 && (
                            <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 1 }}>
                              {zone.regions.slice(0, 4).join(" · ")}{zone.regions.length > 4 ? ` +${zone.regions.length - 4} more` : ""}
                            </div>
                          )}
                        </div>
                        <Badge variant={zone.active ? "mint" : "ghost"}>{zone.active ? "Active" : "Inactive"}</Badge>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Link href={`/home/shipping/${zone.id}`} className="dbtn dBtn-ghost dBtn-sm" style={{ textDecoration: "none" }}>
                          <Icon name="edit" size={12} /> Edit
                        </Link>
                      </div>
                    </div>
                    {rates.length > 0 && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {rates.map((rate, j) => (
                          <div key={j} style={{ padding: "8px 12px", background: "var(--ink-50)", borderRadius: 8, minWidth: 130 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-800)" }}>
                              {rate.label ?? `Rate ${j + 1}`}
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: rate.price === 0 || rate.freeOver != null ? "var(--teal-700)" : "var(--ink-900)", marginTop: 2 }}>
                              {formatRate(rate, currency)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Marketplace logistics partners */}
        {logisticsPartners.length > 0 && (
          <section>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-500)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Logistics partners on Shopinbos
              </div>
              <Link href="/home/logistics" className="dbtn dBtn-ghost dBtn-sm" style={{ textDecoration: "none" }}>
                View all <Icon name="arrow" size={11} />
              </Link>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {logisticsPartners.map((partner) => (
                <div key={partner.id} className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--navy)", display: "grid", placeItems: "center", flexShrink: 0, overflow: "hidden" }}>
                      {partner.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={partner.logoUrl} alt={partner.displayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <span style={{ color: "var(--mint)", fontSize: 18, fontWeight: 800 }}>{partner.displayName[0]}</span>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink-900)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {partner.displayName}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--ink-500)" }}>
                        {partner.city}{partner.country ? `, ${partner.country}` : ""}
                        {partner.rating ? ` · ★ ${Number(partner.rating).toFixed(1)}` : ""}
                      </div>
                    </div>
                  </div>
                  {partner.coverageZones && partner.coverageZones.length > 0 && (
                    <div style={{ fontSize: 12, color: "var(--ink-600)" }}>
                      Covers: {(partner.coverageZones as string[]).slice(0, 3).join(", ")}
                      {(partner.coverageZones as string[]).length > 3 ? ` +${(partner.coverageZones as string[]).length - 3}` : ""}
                    </div>
                  )}
                  <Link href={`/home/logistics?partner=${partner.id}`} className="dbtn dBtn-ghost dBtn-sm" style={{ textDecoration: "none", marginTop: "auto" }}>
                    Get quote
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </AppFrame>
  );
}
