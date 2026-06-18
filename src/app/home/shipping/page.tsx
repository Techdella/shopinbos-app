import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Icon } from "@/components/ui";

export const dynamic = "force-dynamic";

const zones = [
  {
    z: "Lagos · within zone", on: true,
    r: [
      ["Standard (Swift Riders)", "₦1,500", "Same-day"],
      ["Express (Kwik)", "₦2,200", "Within 2 hrs"],
      ["Free pickup (Yaba)", "Free", "By appointment"],
    ],
  },
  {
    z: "Lagos · inter-zone", on: true,
    r: [
      ["Standard (Swift Riders)", "₦2,200", "Same-day"],
      ["Express", "₦3,500", "Same-day < 4 hrs"],
    ],
  },
  {
    z: "Nigeria · nationwide", on: true,
    r: [
      ["GIG Express", "₦3,500", "2-3 days"],
      ["GIG · large item", "₦8,000+", "3-5 days"],
      ["Free over ₦50K", "Free", "GIG · 2-3 days"],
    ],
  },
  {
    z: "Ghana", on: true,
    r: [
      ["Cross-border air", "GH₵ 145", "4-5 days"],
      ["Wholesale freight", "Quote per order", "7-10 days"],
    ],
  },
  { z: "Kenya", on: true, r: [["Cross-border air", "KSh 1,400", "5-7 days"]] },
  { z: "Rest of Africa", on: false, r: [["Quote on request", "Variable", "10+ days"]] },
  { z: "Rest of world", on: false, r: [["Quote on request", "Variable", "14+ days"]] },
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

export default async function ShippingPage() {
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
          title="Shipping rules"
          sub="What customers see at checkout · per region"
          actions={<button className="btn btn-mint"><Icon name="plus" size={14}/> Add zone</button>}
        />

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {zones.map((z, i) => (
            <div key={i} style={{
              borderTop: i ? "1px solid var(--ink-100)" : "none",
              padding: "16px 18px",
            }}>
              <div style={{
                display: "flex", justifyContent: "space-between",
                marginBottom: z.on ? 12 : 0,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Icon name="pin" size={15} color="var(--teal-700)"/>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{z.z}</div>
                  {!z.on && <span className="badge badge-soft" style={{ fontSize: 10 }}>Inactive</span>}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-ghost btn-sm">Edit</button>
                  <Toggle on={z.on}/>
                </div>
              </div>
              {z.on && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {z.r.map((r, j) => (
                    <div key={j} style={{
                      padding: "10px 12px", background: "var(--ink-50)", borderRadius: 10,
                      display: "flex", flexDirection: "column", gap: 3,
                    }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{r[0]}</div>
                      <div style={{
                        display: "flex", justifyContent: "space-between",
                        fontSize: 11.5, color: "var(--ink-600)",
                      }}>
                        <span>{r[2]}</span>
                        <strong className="money" style={{
                          color: r[1] === "Free" ? "var(--success)" : "var(--ink-800)",
                        }}>{r[1]}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </AppFrame>
  );
}
