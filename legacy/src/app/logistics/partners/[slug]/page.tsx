import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { Icon } from "@/components/ui";

export const dynamic = "force-dynamic";

function fmtMoney(n: number) { return "₦" + n.toLocaleString("en-NG"); }

export default async function PublicLogisticsPartnerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const partner = await db.logisticsPartner.findUnique({
    where: { slug },
    include: {
      user: { select: { name: true } },
      payoutAccount: { select: { verificationStatus: true } },
    },
  });

  if (!partner || partner.status !== "active" || partner.verificationStatus !== "verified") {
    notFound();
  }

  const bookingsCount = await db.deliveryBooking.count({ where: { logisticsPartnerId: partner.id, status: "delivered" } });
  const teamCount = await db.logisticsTeamMember.count({ where: { logisticsPartnerId: partner.id, status: "active" } });

  return (
    <div style={{ minHeight: "100vh", background: "var(--canvas)" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 24px" }}>
        <Link href="/marketplace/logistics" style={{ fontSize: 13, color: "var(--teal-700)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 24 }}>
          <Icon name="arrowLeft" size={13} /> Back to logistics marketplace
        </Link>

        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 24, alignItems: "start" }}>
          <div>
            <div
              style={{
                height: 140, borderRadius: 14,
                background: "linear-gradient(135deg, #5b6ad0, #3a4ba6 60%, #1f2872)",
                position: "relative", overflow: "hidden", marginBottom: 20,
              }}
            >
              {partner.logoUrl && (
                <img src={partner.logoUrl} alt={partner.displayName}
                  style={{ position: "absolute", bottom: 16, left: 16, width: 64, height: 64, borderRadius: 14, border: "3px solid white", objectFit: "cover" }}
                />
              )}
              <div style={{ position: "absolute", bottom: partner.logoUrl ? 20 : 16, left: partner.logoUrl ? 92 : 20, color: "white" }}>
                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{partner.displayName}</h1>
                <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>
                  {partner.city}{partner.city && partner.country ? ", " : ""}{partner.country} · {partner.estimatedSpeed ?? "Same-day delivery"}
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: 20, marginBottom: 16 }}>
              <h2 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600 }}>About</h2>
              <p style={{ fontSize: 13, color: "var(--ink-600)", lineHeight: 1.6, margin: 0 }}>
                {partner.description || "Professional logistics partner on the Shopinbos platform. Dedicated to reliable and timely delivery services."}
              </p>
            </div>

            <div className="card" style={{ padding: 20, marginBottom: 16 }}>
              <h2 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600 }}>Service areas</h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {partner.coverageZones.map((z) => (
                  <span key={z} className="chip on" style={{ fontSize: 12 }}>{z}</span>
                ))}
              </div>
            </div>

            <div className="card" style={{ padding: 20, marginBottom: 16 }}>
              <h2 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600 }}>Vehicle types</h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {partner.vehicleTypes.map((v) => (
                  <span key={v} className="chip" style={{ fontSize: 12 }}>{v}</span>
                ))}
              </div>
            </div>

            <div className="card" style={{ padding: 20 }}>
              <h2 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600 }}>Delivery types</h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {partner.deliveryTypes.map((d) => (
                  <span key={d} className="chip" style={{ fontSize: 12 }}>{d.replace(/_/g, " ")}</span>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="card" style={{ padding: 20, marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div style={{ textAlign: "center", padding: "12px 8px", background: "var(--ink-50)", borderRadius: 10 }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: "var(--teal-700)" }}>{partner.reliabilityScore}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 4 }}>Reliability</div>
                </div>
                <div style={{ textAlign: "center", padding: "12px 8px", background: "var(--ink-50)", borderRadius: 10 }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: "var(--indigo-500)" }}>{partner.rating.toFixed(1)}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 4 }}>Rating</div>
                </div>
                <div style={{ textAlign: "center", padding: "12px 8px", background: "var(--ink-50)", borderRadius: 10 }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: "var(--success)" }}>{bookingsCount}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 4 }}>Deliveries</div>
                </div>
                <div style={{ textAlign: "center", padding: "12px 8px", background: "var(--ink-50)", borderRadius: 10 }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: "var(--warning)" }}>{teamCount}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 4 }}>Team</div>
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: 20, marginBottom: 16 }}>
              <h2 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600 }}>Pricing</h2>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--ink-100)" }}>
                <span style={{ fontSize: 13, color: "var(--ink-600)" }}>Model</span>
                <span style={{ fontSize: 13, fontWeight: 600, textTransform: "capitalize" }}>{partner.pricingModel ?? "Per delivery"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--ink-100)" }}>
                <span style={{ fontSize: 13, color: "var(--ink-600)" }}>Base price</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{partner.basePrice > 0 ? fmtMoney(partner.basePrice) : "Contact for pricing"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
                <span style={{ fontSize: 13, color: "var(--ink-600)" }}>Speed</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{partner.estimatedSpeed ?? "Same-day"}</span>
              </div>
            </div>

            {partner.whatsappNumber && (
              <div className="card" style={{ padding: 20, marginBottom: 16 }}>
                <h2 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600 }}>Contact</h2>
                <a href={`https://wa.me/${partner.whatsappNumber.replace(/[^0-9]/g, "")}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--teal-700)", textDecoration: "none" }}
                >
                  <Icon name="message" size={14} /> WhatsApp
                </a>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Link href={`/home/logistics?partner=${partner.slug}`}
                className="dbtn dBtn-mint"
                style={{ textDecoration: "none", textAlign: "center", justifyContent: "center", padding: "12px 20px" }}
              >
                <Icon name="truck" size={14} /> Request a quote
              </Link>
              <Link href={`/home/logistics?partner=${partner.slug}`}
                className="dbtn dBtn-soft"
                style={{ textDecoration: "none", textAlign: "center", justifyContent: "center", padding: "12px 20px" }}
              >
                <Icon name="cart" size={14} /> Book a delivery
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
