import { Suspense } from "react";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { updateSellerProfile, uploadAvatar } from "@/app/actions/workspace";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon, MascotAvatar } from "@/components/ui";
import { PageToast } from "@/components/PageToast";

export const dynamic = "force-dynamic";

export default async function SellerProfilePage() {
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
        <Suspense fallback={null}><PageToast /></Suspense>
        <PageHead title="Profile" sub="Manage your seller profile and public presence" />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.8fr", gap: 20 }}>
          {/* Left - Avatar + Identity */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", margin: "0 auto 12px", display: "block" }} />
              ) : (
                <div style={{
                  width: 72, height: 72, borderRadius: "50%",
                  background: "var(--teal-600)", color: "white",
                  display: "grid", placeItems: "center",
                  fontSize: 26, fontWeight: 700, margin: "0 auto 12px",
                  fontFamily: "var(--font-accent)",
                }}>
                  {initials}
                </div>
              )}
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2, color: "var(--ink-900)" }}>{user.name}</div>
              <div style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 10 }}>{storeName} · Seller</div>
              <Badge variant="mint">Verified seller</Badge>
            </div>
            <form action={uploadAvatar} className="card" style={{ padding: 16, textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--ink-700)" }}>Change avatar</div>
              <input type="file" name="avatar" accept="image/*" style={{ fontSize: 12, marginBottom: 8, width: "100%" }} />
              <button type="submit" className="dbtn dBtn-mint dBtn-sm">Upload</button>
            </form>

            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: "var(--ink-700)" }}>Account info</div>
              {[
                { label: "Email", value: user.email ?? "—" },
                { label: "Phone", value: user.phone ?? "—" },
                { label: "Joined", value: "Recently" },
              ].map((info, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between",
                  padding: "7px 0", borderTop: i ? "1px solid var(--ink-100)" : "none",
                  fontSize: 13,
                }}>
                  <span style={{ color: "var(--ink-500)" }}>{info.label}</span>
                  <span style={{ color: "var(--ink-800)", fontWeight: 500 }}>{info.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right - Stats + Public profile */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14, color: "var(--ink-900)" }}>Store performance</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                {[
                  { label: "Products", value: String(workspace?.storeProducts.length ?? 0), icon: "box" },
                  { label: "Orders", value: "12", icon: "cart", note: "this month" },
                  { label: "Reviews", value: "8", icon: "star", note: "4.5 avg" },
                  { label: "Rating", value: "4.5", icon: "star", note: "★ 5.0" },
                ].map((stat, i) => (
                  <div key={i} className="card" style={{ padding: "14px 12px", textAlign: "center", border: "1px solid var(--ink-100)" }}>
                    <Icon name={stat.icon as any} size={16} color="var(--teal-600)" />
                    <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ink-900)", marginTop: 4 }}>{stat.value}</div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>{stat.label}</div>
                    {"note" in stat && <div style={{ fontSize: 10.5, color: "var(--ink-400)" }}>{stat.note}</div>}
                  </div>
                ))}
              </div>
            </div>

            <form action={updateSellerProfile} className="card" style={{ padding: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, color: "var(--ink-900)" }}>Public profile</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="field">
                  <label className="label">Display name</label>
                  <input name="name" className="inp" defaultValue={user.name} />
                </div>
                <div className="field">
                  <label className="label">Bio</label>
                  <textarea name="description" className="ta" rows={3} defaultValue={workspace?.store?.description ?? ""} placeholder="Tell buyers about your store…" />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div className="field">
                    <label className="label">City</label>
                    <input name="city" className="inp" defaultValue={workspace?.store?.city ?? user.city ?? ""} />
                  </div>
                  <div className="field">
                    <label className="label">Country</label>
                    <input name="country" className="inp" defaultValue={workspace?.store?.country ?? user.country ?? "Nigeria"} />
                  </div>
                </div>
                <div className="field">
                  <label className="label">Phone</label>
                  <input name="phone" className="inp" defaultValue={user.phone ?? ""} />
                </div>
                <button type="submit" className="dbtn dBtn-mint" style={{ alignSelf: "flex-start" }}>
                  <Icon name="check" size={14} /> Save profile
                </button>
              </div>
            </form>

            <div className="card" style={{
              padding: 16,
              background: "linear-gradient(160deg, var(--teal-50), var(--teal-100))",
            }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <MascotAvatar role="seller" size={40} />
                <div>
                  <div style={{ fontSize: 11, color: "var(--teal-700)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>
                    Peggy's tip
                  </div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-800)" }}>
                    A complete profile with a bio and location helps build trust with customers. Stores with complete profiles get 2x more orders.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
