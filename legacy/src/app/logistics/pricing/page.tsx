import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { updateLogisticsPricing } from "@/app/actions/logistics";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon } from "@/components/ui";

export const dynamic = "force-dynamic";

function fmt(n: number) { return "₦" + Math.round(n).toLocaleString("en-US"); }

export default async function LogisticsPricingPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);

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
          title="Pricing"
          sub="Per-zone base prices + per-km surcharges. Visible to sellers when they request a quote."
          actions={<>
            <button className="dbtn dBtn-ghost"><Icon name="refresh" size={14} /> Reset to standard</button>
            <button className="dbtn dBtn-mint">Save changes</button>
          </>}
        />

        <div className="design-tabs">
          {["Per-zone", "Weight surcharges", "Special handling", "Cross-border", "Service hours"].map((t, i) => (
            <button key={t} className={`tab${i === 0 ? " on" : ""}`}>{t}</button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 18 }}>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Zone</th>
                  <th>Base · same-day</th>
                  <th>Base · next-day</th>
                  <th>Per-km after 5km</th>
                  <th>Max distance</th>
                  <th>COD fee</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[
                  { z: "Ikeja", sd: partner.basePrice, nd: Math.round(partner.basePrice * 0.67), km: 120, max: 15, cod: "₦200" },
                  { z: "Yaba", sd: Math.round(partner.basePrice * 0.75), nd: Math.round(partner.basePrice * 0.5), km: 100, max: 12, cod: "₦200" },
                  { z: "Lekki Ph 1", sd: Math.round(partner.basePrice * 1.25), nd: Math.round(partner.basePrice * 0.92), km: 150, max: 18, cod: "₦300" },
                  { z: "Surulere (inter-zone)", sd: Math.round(partner.basePrice * 1.17), nd: Math.round(partner.basePrice * 0.83), km: 120, max: 15, cod: "₦200" },
                  { z: "VI (inter-zone)", sd: Math.round(partner.basePrice * 1.25), nd: Math.round(partner.basePrice * 0.92), km: 150, max: 18, cod: "₦300" },
                ].map((p, i) => (
                  <tr key={i}>
                    <td><strong>{p.z}</strong></td>
                    <td><input className="inp" style={{ width: 90, fontSize: 12, padding: "5px 9px" }} defaultValue={fmt(p.sd)} /></td>
                    <td><input className="inp" style={{ width: 90, fontSize: 12, padding: "5px 9px" }} defaultValue={fmt(p.nd)} /></td>
                    <td><input className="inp" style={{ width: 80, fontSize: 12, padding: "5px 9px" }} defaultValue={`${fmt(p.km)}/km`} /></td>
                    <td>{p.max} km</td>
                    <td>{p.cod}</td>
                    <td><button className="dbtn dBtn-ghost" style={{ padding: "3px 7px" }}><Icon name="moreHorizontal" size={12} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <form action={updateLogisticsPricing} className="card" style={{ padding: 18, marginBottom: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Pricing editor</div>
              <label className="field" style={{ marginBottom: 10 }}>
                <span className="label">Pricing model</span>
                <select className="inp" name="pricingModel" defaultValue={partner.pricingModel}>
                  <option value="fixed">Fixed</option>
                  <option value="weight_based">Weight based</option>
                  <option value="distance_based">Distance based</option>
                </select>
              </label>
              <label className="field" style={{ marginBottom: 10 }}>
                <span className="label">Base price</span>
                <input className="inp" name="basePrice" type="number" min="0" step="1" defaultValue={String(partner.basePrice)} />
              </label>
              <label className="field" style={{ marginBottom: 12 }}>
                <span className="label">Estimated delivery speed</span>
                <input className="inp" name="estimatedSpeed" defaultValue={partner.estimatedSpeed ?? "Same-day in active zones"} />
              </label>
              <button className="dbtn dBtn-mint" type="submit" style={{ width: "100%", justifyContent: "center" }}>Save pricing</button>
            </form>

            <div className="card" style={{ padding: 18, marginBottom: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Public preview · sample quote</div>
              <div style={{ padding: 14, background: "var(--ink-50)", borderRadius: 10, marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: "var(--ink-500)", marginBottom: 4 }}>Sample · Sahel Sole order</div>
                <div style={{ fontSize: 13 }}>
                  Yaba <Icon name="chevRight" size={11} color="var(--ink-400)" /> VI · 0.5 kg · 14.2 km · same-day
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>Yaba base (same-day)</span><span className="money">{fmt(Math.round(partner.basePrice * 0.75))}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>Per-km × 9.2 km</span><span className="money">{fmt(Math.round(partner.basePrice * 1.1))}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>VI inter-zone surcharge</span><span className="money">{fmt(Math.round(partner.basePrice * 0.3))}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--success)" }}><span>Seller subscription discount</span><span className="money">−{fmt(Math.round(partner.basePrice * 0.5))}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid var(--ink-150)", fontWeight: 700, fontSize: 14 }}>
                  <span>Total quote</span>
                  <span className="money" style={{ fontFamily: "var(--font-accent)", fontSize: 20, fontWeight: 500 }}>{fmt(partner.basePrice)}</span>
                </div>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--ink-500)", lineHeight: 1.5 }}>
                Sellers see this quote when they pick your company for an order. Update any field above to see the impact.
              </div>
            </div>

            <div className="card" style={{ padding: 18 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Competitive position · Yaba</div>
              {[
                { n: `${partner.displayName} (you)`, v: partner.basePrice, mark: true },
                { n: "Kwik · Lagos", v: Math.round(partner.basePrice * 1.2) },
                { n: "GIG Express", v: Math.round(partner.basePrice * 1.47) },
                { n: "Marketplace avg", v: Math.round(partner.basePrice * 1.17), sub: true },
              ].map((c, i) => (
                <div key={i} style={{ padding: "7px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                    <span style={{ fontWeight: c.mark ? 700 : 500, color: c.mark ? "var(--teal-700)" : c.sub ? "var(--ink-500)" : "var(--ink-700)" }}>
                      {c.n}
                    </span>
                    <strong className="money" style={{ color: c.mark ? "var(--teal-700)" : c.sub ? "var(--ink-500)" : "var(--ink-700)" }}>{fmt(c.v)}</strong>
                  </div>
                  <div style={{ height: 5, background: "var(--ink-100)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ width: `${(c.v / (partner.basePrice * 1.5)) * 100}%`, height: "100%", background: c.mark ? "var(--teal-600)" : c.sub ? "var(--ink-400)" : "var(--ink-300)" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
