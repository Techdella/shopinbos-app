import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { updateLogisticsCoverage } from "@/app/actions/logistics";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon } from "@/components/ui";

export const dynamic = "force-dynamic";

function fmt(n: number) { return "₦" + Math.round(n).toLocaleString("en-US"); }

export default async function LogisticsCoveragePage() {
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
          title="Coverage map"
          sub={`${partner.coverageZones.length} zones · ${partner.vehicleTypes.length} vehicles · ~120 sellers in range`}
          actions={<>
            <button className="dbtn dBtn-ghost"><Icon name="upload" size={14} /> Import KML</button>
            <button className="dbtn dBtn-mint"><Icon name="plus" size={14} /> Add zone</button>
          </>}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 18 }}>
          {/* Map */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <svg viewBox="0 0 800 540" width="100%" height="540" style={{ background: "#eef2ec", display: "block" }}>
              <defs><pattern id="cdot" x="0" y="0" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="0.6" fill="#c8d4cd"/></pattern></defs>
              <rect width="800" height="540" fill="url(#cdot)"/>
              <path d="M0 320 Q200 280 380 320 Q540 360 720 320 L800 340 L800 400 Q600 380 400 400 Q200 420 0 400 Z" fill="#bcd2e0" opacity="0.7"/>
              <path d="M40 100 Q220 140 400 100 T780 80" stroke="#fff" strokeWidth="3" fill="none" opacity="0.7"/>
              <path d="M100 460 Q300 420 480 460 T780 440" stroke="#fff" strokeWidth="3" fill="none" opacity="0.7"/>
              <polygon points="80,80 220,60 280,150 200,200 100,180" fill="rgba(42,174,160,0.25)" stroke="var(--teal-700)" strokeWidth="2"/>
              <text x="170" y="130" textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--teal-800)">Ikeja</text>
              <text x="170" y="148" textAnchor="middle" fontSize="11" fill="var(--teal-700)">{partner.vehicleTypes[0] ?? "4 bikes"} · {fmt(partner.basePrice)} base</text>
              {[[80,80],[220,60],[280,150],[200,200],[100,180]].map((p,i)=><circle key={i} cx={p[0]} cy={p[1]} r="5" fill="var(--paper)" stroke="var(--teal-700)" strokeWidth="2"/>)}
              <polygon points="340,80 460,90 480,180 360,200 320,150" fill="rgba(42,174,160,0.25)" stroke="var(--teal-700)" strokeWidth="2"/>
              <text x="400" y="135" textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--teal-800)">Yaba</text>
              <text x="400" y="153" textAnchor="middle" fontSize="11" fill="var(--teal-700)}">6 bikes · {fmt(partner.basePrice)} base</text>
              <polygon points="540,90 660,80 720,170 620,200 540,180" fill="rgba(42,174,160,0.25)" stroke="var(--teal-700)" strokeWidth="2"/>
              <text x="620" y="135" textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--teal-800)">Lekki Ph 1</text>
              <text x="620" y="153" textAnchor="middle" fontSize="11" fill="var(--teal-700)">2 vans · {fmt(partner.basePrice + 300)} base</text>
              <polygon points="120,440 260,420 300,480 180,500" fill="rgba(184,116,17,0.18)" stroke="#b97511" strokeWidth="2" strokeDasharray="6 4"/>
              <text x="210" y="465" textAnchor="middle" fontSize="13" fontWeight="700" fill="#b97511">+ Apapa</text>
              <text x="210" y="481" textAnchor="middle" fontSize="10.5" fill="#b97511">23 sellers requesting</text>
              <polygon points="540,440 700,430 720,500 580,500" fill="rgba(184,116,17,0.18)" stroke="#b97511" strokeWidth="2" strokeDasharray="6 4"/>
              <text x="630" y="465" textAnchor="middle" fontSize="13" fontWeight="700" fill="#b97511">+ Ajah</text>
              <text x="630" y="481" textAnchor="middle" fontSize="10.5" fill="#b97511">No partners · high demand</text>
              <circle cx="380" cy="320" r="13" fill="var(--rose-500)" stroke="white" strokeWidth="3"/>
              <text x="380" y="345" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--ink-900)">Depot · {partner.city ?? "Yaba"}</text>
            </svg>
            <div style={{ padding: "12px 16px", borderTop: "1px solid var(--ink-100)", display: "flex", gap: 8 }}>
              <button className="dbtn dBtn-soft" style={{ fontSize: 12, padding: "5px 10px" }}><Icon name="edit" size={12} /> Edit polygon</button>
              <button className="dbtn dBtn-ghost" style={{ fontSize: 12, padding: "5px 10px" }}><Icon name="plus" size={12} /> Add zone</button>
              <button className="dbtn dBtn-ghost" style={{ fontSize: 12, padding: "5px 10px" }}><Icon name="layers" size={12} /> Layers: traffic, demand</button>
              <div style={{ marginLeft: "auto", display: "flex", gap: 4, padding: 5, background: "var(--paper)", border: "1px solid var(--ink-150)", borderRadius: 10 }}>
                <button className="dbtn dBtn-soft" style={{ padding: "3px 9px", fontSize: 11.5 }}>Zones</button>
                <button className="dbtn dBtn-ghost" style={{ padding: "3px 9px", fontSize: 11.5, color: "var(--ink-600)" }}>Riders</button>
                <button className="dbtn dBtn-ghost" style={{ padding: "3px 9px", fontSize: 11.5, color: "var(--ink-600)" }}>Demand heatmap</button>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div>
            <div className="card" style={{ padding: 14, marginBottom: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Your zones</div>
              {[
                ...partner.coverageZones.map((z) => ({ n: z, b: fmt(partner.basePrice), v: `${partner.vehicleTypes.length} vehicles`, on: true })),
                { n: "Apapa (suggested)", b: "—", v: "1 partner here", on: false },
                { n: "Ajah (suggested)", b: "—", v: "0 partners", on: false },
              ].map((z, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: i ? "1px solid var(--ink-100)" : "none" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: z.on ? "var(--teal-600)" : "var(--ink-300)" }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{z.n}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-500)" }}>{z.v}</div>
                  </div>
                  <div style={{ fontFamily: "var(--font-accent)", fontSize: 14, fontWeight: 500 }}>{z.b}</div>
                  <button className="dbtn dBtn-ghost" style={{ padding: "4px 9px", fontSize: 12 }}>
                    <Icon name={z.on ? "edit" : "plus"} size={13} />
                  </button>
                </div>
              ))}
            </div>

            <form action={updateLogisticsCoverage} className="card" style={{ padding: 14, marginBottom: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Coverage editor</div>
              <label className="field" style={{ marginBottom: 10 }}>
                <span className="label">Coverage zones</span>
                <textarea className="ta" name="coverageZones" rows={4} defaultValue={partner.coverageZones.join("\n")} />
              </label>
              <label className="field" style={{ marginBottom: 10 }}>
                <span className="label">Vehicle types</span>
                <input className="inp" name="vehicleTypes" defaultValue={partner.vehicleTypes.join(", ")} />
              </label>
              <label className="field" style={{ marginBottom: 10 }}>
                <span className="label">Delivery types</span>
                <input className="inp" name="deliveryTypes" defaultValue={partner.deliveryTypes.join(", ")} />
              </label>
              <label className="field" style={{ marginBottom: 10 }}>
                <span className="label">Coverage map rows</span>
                <textarea
                  className="ta font-mono"
                  name="coverageRows"
                  rows={4}
                  defaultValue={partner.coverageZones.map((zone) => `${zone}|Same-day|${partner.basePrice}`).join("\n")}
                />
              </label>
              <label className="field" style={{ marginBottom: 12 }}>
                <span className="label">Depot</span>
                <input className="inp" name="depot" defaultValue={partner.city ?? ""} />
              </label>
              <button className="dbtn dBtn-mint" type="submit" style={{ width: "100%", justifyContent: "center" }}>Save coverage</button>
            </form>

            <div className="card" style={{ padding: 14, background: "linear-gradient(160deg, #fbeed4, #f6dfb0)", borderColor: "#f6dfb0" }}>
              <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: "rgba(255,255,255,0.6)", color: "#b97511", display: "grid", placeItems: "center", flexShrink: 0 }}>
                  <Icon name="bolt" size={17} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#b97511", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Demand alert</div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-800)" }}>
                    <strong>Ajah</strong> has no verified courier — 23 sellers requested deliveries there last week. Adding it could add <strong>~8 jobs/day · ₦9,000/day</strong>.
                  </div>
                  <button className="dbtn dBtn-mint" style={{ marginTop: 8, fontSize: 12, padding: "5px 10px" }}>Add Ajah zone</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
