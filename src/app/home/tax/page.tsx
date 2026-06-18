import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Icon, MascotAvatar } from "@/components/ui";

export const dynamic = "force-dynamic";

const regions = [
  { r: "🇳🇬 Nigeria", n: "VAT", rate: 7.5, w: "Order placed in NG · subtotal ≥ ₦25M annually", v: "₦142,400", on: true },
  { r: "🇬🇭 Ghana", n: "VAT", rate: 12.5, w: "Order placed in GH", v: "GH₵ 1,840", on: true },
  { r: "🇰🇪 Kenya", n: "VAT", rate: 16, w: "Order placed in KE", v: "KSh 4,820", on: true },
  { r: "🇿🇦 South Africa", n: "VAT", rate: 15, w: "Order placed in ZA · registered ≥ R1M/yr", v: "R 0", on: false },
  { r: "🇪🇬 Egypt", n: "VAT", rate: 14, w: "Cross-border imports", v: "—", on: false },
  { r: "🇪🇺 European Union", n: "OSS / VAT", rate: NaN, w: "B2C cross-border into EU", v: "—", on: false },
];

const exemptions = [
  { l: "Digital services (training)", n: "12 products" },
  { l: "Custom orders > ₦50K", n: "tracked individually" },
  { l: "Wholesale to verified resellers", n: "auto-applied via VAT number check" },
];

function Toggle({ on }: { on: boolean }) {
  return (
    <span style={{
      width: 32, height: 18, borderRadius: 999,
      background: on ? "var(--teal-600)" : "var(--ink-200)",
      position: "relative", display: "inline-block", cursor: "pointer",
    }}>
      <span style={{
        position: "absolute", top: 2, left: on ? 16 : 2,
        width: 14, height: 14, borderRadius: "50%", background: "white",
      }}/>
    </span>
  );
}

export default async function TaxPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  const storeName = workspace?.store?.name ?? "Your Store";
  const storeSlug = workspace?.store?.slug ? `${workspace.store.slug}.shopinbos.shop` : undefined;
  const initials = user.name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);

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
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead
          title="Tax"
          sub="VAT collection rules · per-country · auto-applied at checkout"
          actions={
            <>
              <button className="btn btn-ghost"><Icon name="document" size={14}/> Tax reports</button>
              <button className="btn btn-mint">Save</button>
            </>
          }
        />

        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 18 }}>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Region</th>
                  <th>Tax name</th>
                  <th>Rate</th>
                  <th>Applied when</th>
                  <th>YTD collected</th>
                  <th>On</th>
                </tr>
              </thead>
              <tbody>
                {regions.map((t, i) => (
                  <tr key={i}>
                    <td><strong>{t.r}</strong></td>
                    <td>{t.n}</td>
                    <td><strong className="money">{isNaN(t.rate) ? "varies" : `${t.rate}%`}</strong></td>
                    <td style={{ fontSize: 12, color: "var(--ink-600)" }}>{t.w}</td>
                    <td className="money" style={{ fontWeight: 600 }}>{t.v}</td>
                    <td><Toggle on={t.on}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <div className="card" style={{ padding: 18, marginBottom: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Tax-exempt products</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {exemptions.map((r, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "7px 0",
                    borderTop: i ? "1px solid var(--ink-100)" : "none",
                  }}>
                    <Icon name="check" size={13} color="var(--teal-700)"/>
                    <div style={{ flex: 1, fontSize: 12.5 }}>{r.l}</div>
                    <span style={{ fontSize: 11, color: "var(--ink-500)" }}>{r.n}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card" style={{
              padding: 14, background: "linear-gradient(160deg, var(--teal-50), var(--paper))",
            }}>
              <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
                <MascotAvatar role="seller" size={40}/>
                <div>
                  <div style={{
                    fontSize: 11, color: "var(--teal-700)", fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.06em",
                  }}>Peggy</div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: 3 }}>
                    You crossed the <strong>₦25M annual threshold</strong> last month — VAT registration is now required in Nigeria. Want me to draft the FIRS application?
                  </div>
                  <button className="btn btn-mint btn-sm" style={{ marginTop: 6 }}>Draft application</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
