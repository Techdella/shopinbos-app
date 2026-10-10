import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { respondToDeliveryQuote } from "@/app/actions/logistics";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon } from "@/components/ui";

export const dynamic = "force-dynamic";

function Av({ name, size = 36, seed = 0, square }: { name: string; size?: number; seed?: number; square?: boolean }) {
  const initials = name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);
  const gradients = [
    ["#D4A574","#6B4A2C"],["#F2C8B4","#D4A574"],["#195754","#0c4a44"],["#E86A4F","#6B4A2C"],
    ["#5b6ad0","#3a4ba6"],["#8aa843","#5a7a28"],["#b14a8a","#7a2a6a"],["#e8a647","#b97511"],
  ];
  const g = gradients[seed % gradients.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: square ? 7 : "50%",
      background: `linear-gradient(135deg, ${g[0]}, ${g[1]})`,
      display: "grid", placeItems: "center",
      color: "white", fontWeight: 700, fontSize: size * 0.38, flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

export default async function LogisticsQuotesPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);

  const quotes = await db.deliveryQuoteRequest.findMany({
    where: { logisticsPartnerId: partner.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true, pickupLocation: true, destination: true,
      preferredDate: true, status: true, quotedPrice: true, partnerResponse: true,
      expiresAt: true, createdAt: true, packageDetails: true,
      seller: { select: { name: true, country: true } },
    },
  });

  const pending = quotes.filter((q) => q.status === "pending");

  return (
    <AppFrame
      role="logistics_partner"
      storeName={partner.displayName}
      storeSlug={`${partner.city ?? "Lagos"} · Fleet`}
      storeInitial={partner.displayName.charAt(0).toUpperCase()}
      userName={user.name}
      userInitials={user.name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2)}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead
          title="Quote requests"
          sub={`${pending.length} sellers asking for delivery quotes · respond fast to win`}
          actions={<button className="dbtn dBtn-ghost"><Icon name="clock" size={14} /> Avg response · 18m</button>}
        />

        <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 16, height: "calc(100vh - 60px - 180px)", minHeight: 500 }}>
          {/* Inbox sidebar */}
          <div className="card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--ink-100)", display: "flex", gap: 6 }}>
              <button className="dbtn dBtn-soft" style={{ fontSize: 12, padding: "5px 10px" }}>Pending <span style={{ fontFamily: "var(--font-mono)", marginLeft: 3, opacity: 0.7, fontSize: 11 }}>{pending.length}</span></button>
              <button className="dbtn dBtn-ghost" style={{ fontSize: 12, padding: "5px 10px", color: "var(--ink-600)" }}>Quoted <span style={{ fontFamily: "var(--font-mono)", marginLeft: 3, fontSize: 11 }}>{quotes.filter((q) => q.status === "responded").length}</span></button>
              <button className="dbtn dBtn-ghost" style={{ fontSize: 12, padding: "5px 10px", color: "var(--ink-600)" }}>Won <span style={{ fontFamily: "var(--font-mono)", marginLeft: 3, fontSize: 11 }}>{quotes.filter((q) => q.status === "accepted").length}</span></button>
            </div>
            <div style={{ flex: 1, overflow: "auto" }}>
              {quotes.map((q, i) => (
                <div key={q.id} style={{
                  padding: "13px 14px", borderTop: i ? "1px solid var(--ink-100)" : "none",
                  display: "flex", gap: 11, cursor: "pointer",
                  background: i === 0 ? "var(--teal-50)" : "transparent",
                  borderLeft: i === 0 ? "3px solid var(--teal-700)" : "3px solid transparent",
                }}>
                  <Av name={q.seller.name} size={34} seed={i + 2} square />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{q.seller.name}</div>
                      <div style={{ fontSize: 11, color: "var(--ink-500)" }}>
                        {Math.round((Date.now() - new Date(q.createdAt).getTime()) / 60000)} min
                      </div>
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-600)", marginBottom: 3 }}>{q.pickupLocation} → {q.destination}</div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>
                      {q.packageDetails && typeof q.packageDetails === "object" 
                        ? `Box · ${(q.packageDetails as { weight?: number }).weight ?? 0.5}kg`
                        : "Package"}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                      {q.quotedPrice && <span style={{ fontSize: 11, color: "var(--ink-500)" }}>quoted <strong style={{ color: "var(--ink-800)" }}>₦{q.quotedPrice}</strong></span>}
                      {(q.status === "responded" || q.status === "accepted") && <Badge variant={q.status === "accepted" ? "mint" : "info"}>{q.status}</Badge>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quote detail */}
          {pending.length > 0 && (() => {
            const q = pending[0];
            const pkg = q.packageDetails && typeof q.packageDetails === "object"
              ? (q.packageDetails as { description?: string; weight?: number; fragile?: boolean; declaredValue?: number })
              : null;
            return (
              <div className="card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--ink-100)", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <Av name={q.seller.name} size={28} seed={2} square />
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{q.seller.name}</div>
                      <Badge variant="mint" dot>Verified seller</Badge>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--ink-500)" }}>{q.seller.country ?? "Lagos, Nigeria"}</div>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-500)" }}>
                    Received {Math.round((Date.now() - new Date(q.createdAt).getTime()) / 60000)} min ago{q.expiresAt ? ` · expires ${new Date(q.expiresAt).toLocaleDateString()}` : ""}
                  </div>
                </div>

                <div style={{ flex: 1, overflow: "auto", padding: "22px 24px" }}>
                  <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
                    <svg viewBox="0 0 600 200" width="100%" height="200" style={{ background: "#eef2ec", display: "block" }}>
                      <defs><pattern id="qdot" x="0" y="0" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="0.5" fill="#c8d4cd"/></pattern></defs>
                      <rect width="600" height="200" fill="url(#qdot)"/>
                      <path d="M120 100 Q300 130 480 80" stroke="var(--teal-700)" strokeWidth="3" fill="none" strokeDasharray="6 3"/>
                      <circle cx="120" cy="100" r="13" fill="var(--success)" stroke="white" strokeWidth="3"/>
                      <text x="120" y="105" textAnchor="middle" fontSize="11" fill="white" fontWeight="700">A</text>
                      <text x="120" y="130" textAnchor="middle" fontSize="11" fontWeight="600">{q.pickupLocation}</text>
                      <circle cx="480" cy="80" r="13" fill="var(--rose-500)" stroke="white" strokeWidth="3"/>
                      <text x="480" y="85" textAnchor="middle" fontSize="11" fill="white" fontWeight="700">B</text>
                      <text x="480" y="110" textAnchor="middle" fontSize="11" fontWeight="600">{q.destination}</text>
                      <text x="300" y="60" textAnchor="middle" fontSize="11" fill="var(--teal-700)" fontWeight="700">est. same-day</text>
                    </svg>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20, fontSize: 13 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--ink-500)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Pickup</div>
                      <div style={{ padding: 12, background: "var(--ink-50)", borderRadius: 10, lineHeight: 1.6 }}>
                        <strong>{q.pickupLocation}</strong><br />
                        <span style={{ color: "var(--ink-500)", fontSize: 11 }}>Window: today</span>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--ink-500)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Delivery</div>
                      <div style={{ padding: 12, background: "var(--ink-50)", borderRadius: 10, lineHeight: 1.6 }}>
                        <strong>{q.destination}</strong><br />
                        <span style={{ color: "var(--ink-500)", fontSize: 11 }}>
                          {q.preferredDate ? `By: ${new Date(q.preferredDate).toLocaleDateString()}` : "Need by: today"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{ padding: 14, background: "var(--ink-50)", borderRadius: 10, marginBottom: 20, fontSize: 13 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8 }}>
                      <span style={{ color: "var(--ink-500)" }}>Package</span>
                      <strong>{pkg?.description ?? "Box"} · {pkg?.weight ?? 0.5}kg</strong>
                      {pkg?.declaredValue && <><span style={{ color: "var(--ink-500)" }}>Declared value</span><strong>₦{pkg.declaredValue.toLocaleString()}</strong></>}
                      <span style={{ color: "var(--ink-500)" }}>Fragile</span>
                      <strong>{pkg?.fragile ? "Yes" : "No · standard handling"}</strong>
                    </div>
                  </div>

                  {/* Quote form */}
                  <div style={{ fontSize: 11, color: "var(--ink-500)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Rex route quote pad</div>
                  <form action={respondToDeliveryQuote} className="card" style={{ padding: 18, background: "var(--paper)", borderColor: "var(--teal-200)" }}>
                    <input type="hidden" name="quoteId" value={q.id} />
                    <input type="hidden" name="intent" value="respond" />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                      <div className="field">
                        <label className="label">Price quoted (₦)</label>
                        <input className="inp" name="quotedPrice" type="number" min="1" step="1" defaultValue={String(partner.basePrice)} required />
                        <div className="help" style={{ color: "var(--success)" }}>Competitive price</div>
                      </div>
                      <div className="field">
                        <label className="label">ETA</label>
                        <div className="sel" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          Today 12-3pm <Icon name="chevDown" size={12} />
                        </div>
                      </div>
                      <div className="field">
                        <label className="label">Service</label>
                        <div className="sel" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          Same-day <Icon name="chevDown" size={12} />
                        </div>
                      </div>
                    </div>
                    <div className="field" style={{ marginBottom: 14 }}>
                      <label className="label">Note to seller</label>
                      <textarea className="ta" rows={2} defaultValue={`Hi — we'd ship for ₦${partner.basePrice}, picks up today, delivers same-day. OTP on delivery.`} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", background: "var(--ink-50)", borderRadius: 10, marginBottom: 14 }}>
                      <div>
                        <div style={{ fontSize: 11, color: "var(--ink-500)" }}>Your margin after fees</div>
                        <div style={{ fontFamily: "var(--font-accent)", fontSize: 22, fontWeight: 500, color: "var(--success)" }}>
                          ₦{Math.round(partner.basePrice * 0.21)}
                        </div>
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>21% margin</div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <button className="dbtn dBtn-ghost" type="submit" form={`decline-${q.id}`}>Decline</button>
                      <div style={{ display: "flex", gap: 7 }}>
                        <button className="dbtn dBtn-ghost" type="button">Save draft</button>
                        <button className="dbtn dBtn-mint" type="submit">Send quote <Icon name="chevRight" size={14} /></button>
                      </div>
                    </div>
                  </form>
                  <form id={`decline-${q.id}`} action={respondToDeliveryQuote}>
                    <input type="hidden" name="quoteId" value={q.id} />
                    <input type="hidden" name="intent" value="reject" />
                    <input type="hidden" name="partnerResponse" value="Thanks for reaching out. This route is not available for us right now." />
                  </form>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </AppFrame>
  );
}
