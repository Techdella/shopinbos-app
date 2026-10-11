import { updateSupplierProfile } from "@/app/actions/supplier";
import { billingEmail } from "@/lib/auth/billing-email";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { getSupplierWorkspace } from "@/lib/workspace";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon } from "@/components/ui";
import { PlanUpgradeSection } from "@/components/payments/PlanUpgradeSection";
import { SupplierCoverUpload, SupplierLogoUpload, SupplierPhotoUpload } from "@/components/supplier/SupplierProfileUploads";
import { db } from "@/lib/db/client";
import { isProPlan } from "@/lib/role-queries";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ tab?: string; limit?: string }>;
};

export default async function SupplierProfilePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const activeTab = params?.tab ?? "Profile";
  const user = await requireRole(["supplier"], "/supplier/login");
  const workspace = await getSupplierWorkspace(user.id);

  if (!workspace) redirect("/supplier/onboarding");

  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { aiCredits: true },
  });
  const aiCredits = dbUser?.aiCredits ?? 5;
  const isPro = isProPlan({ aiCredits });

  const { supplier } = workspace;

  return (
    <AppFrame
      role="supplier"
      storeName={supplier.displayName}
      storeSlug={`${supplier.city ?? "Aba"} · ${supplier.country ?? "Nigeria"}`}
      storeInitial={supplier.displayName.charAt(0).toUpperCase()}
      userName={user.name}
      userInitials={user.name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2)}
      avatarUrl={user.avatarUrl}
      userEmail={billingEmail(user)}
    >
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        {supplier.verificationStatus !== "verified" && (
          <div className="card" style={{ padding: 14, background: "var(--amber-100)", borderColor: "var(--amber-300)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--amber-900)", fontSize: 13, fontWeight: 600 }}>
              <Icon name="flag" size={16} />
              Finish onboarding and wait for manual admin verification before your public page or supplier tools become active.
            </div>
          </div>
        )}
        <PageHead
          title={activeTab === "Billing & Plan" ? "Billing & plan" : "Supplier profile"}
          sub={activeTab === "Billing & Plan" ? "Manage your AI credits, subscriptions, and invoicing details." : "What sellers see when they discover you on the marketplace"}
          actions={
            activeTab === "Profile" ? (
              <>
                <Link href={`/suppliers/${supplier.slug}`} className="dbtn dBtn-ghost" style={{ textDecoration: "none" }}><Icon name="eye" size={14} /> Public preview</Link>
                <button className="dbtn dBtn-mint" form="profile-form">Save</button>
              </>
            ) : null
          }
        />

        <div className="design-tabs" style={{ display: "flex", gap: 12, borderBottom: "1px solid var(--ink-100)", paddingBottom: 8, marginBottom: 8 }}>
          {["Profile", "Billing & Plan"].map((t) => (
            <a
              key={t}
              href={`/supplier/profile?tab=${encodeURIComponent(t)}`}
              className={`tab${t === activeTab ? " on" : ""}`}
              style={{
                textDecoration: "none",
                cursor: "pointer",
                padding: "6px 12px",
                fontSize: 14,
                fontWeight: t === activeTab ? 600 : 500,
                color: t === activeTab ? "var(--teal-700)" : "var(--ink-600)",
                borderBottom: t === activeTab ? "2px solid var(--teal-600)" : "none",
              }}
            >
              {t}
            </a>
          ))}
        </div>

        {activeTab === "Billing & Plan" ? (
          <div>
            <PlanUpgradeSection
              userEmail={billingEmail(user)}
              userName={user.name}
              aiCredits={aiCredits}
              productCount={workspace.metrics.productCount}
            />
          </div>
        ) : (
          <form id="profile-form" action={updateSupplierProfile} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Hero & cover */}
            <div className="card" style={{ padding: 18 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Hero & cover</div>

              <SupplierCoverUpload bannerUrl={supplier.bannerUrl} />

              {/* Logo and display name */}
              <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 14, marginBottom: 14 }}>
                <SupplierLogoUpload logoUrl={supplier.logoUrl} displayName={supplier.displayName} />
                <div className="field">
                  <label className="label">Display name</label>
                  <input className="inp" name="displayName" defaultValue={supplier.displayName} style={{ fontFamily: "var(--font-accent)", fontSize: 16 }} />
                  <div className="help">Public · how sellers see you</div>
                </div>
              </div>
              <div className="field" style={{ marginBottom: 14 }}>
                <label className="label">Tagline · one line</label>
                <input className="inp" name="tagline" defaultValue={supplier.description?.split("\n")[0] ?? "Hand-stitched leather goods · Aba, Nigeria · since 2019"} />
              </div>
              <div className="field">
                <label className="label">About · 2-3 paragraphs</label>
                <textarea className="ta" name="description" rows={5} defaultValue={supplier.description ?? ""} />
                <div className="help">Sellers reference this when stocking you · Peggy uses it to suggest you for matches</div>
              </div>
            </div>

            {/* Capabilities */}
            <div className="card" style={{ padding: 18 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Capabilities · what sellers can search</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {["Dropship", "Bulk wholesale", "Sample first", "Custom orders", "Private label (50+)", "Hand-stitched", "Heritage leather", "Earth tones", "Made-to-measure", "Cross-border shipping", "Insurance covered", "Rush production"].map((t) => (
                  <span key={t} className="chip on close" style={{ fontSize: 11.5 }}>{t} <Icon name="x" size={10} /></span>
                ))}
                <button type="button" className="chip" style={{ fontSize: 11.5 }}><Icon name="plus" size={11} /> Add</button>
              </div>
            </div>

            {/* Workshop photos */}
            <div className="card" style={{ padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Workshop photos</div>
                <SupplierPhotoUpload />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
                {[
                  ["#3a2614", "#6B4A2C"], ["#D4A574", "#3a2614"], ["#6B4A2C", "#1a1208"],
                  ["#E86A4F", "#6B4A2C"], ["#D4A574", "#F2C8B4"], ["#3a2614", "#D4A574"],
                ].map((c, i) => (
                  <div key={i} style={{
                    aspectRatio: "1/1", borderRadius: 8,
                    background: `linear-gradient(135deg, ${c[0]}, ${c[1]})`,
                    position: "relative",
                  }}>
                    <div style={{
                      position: "absolute", top: 5, right: 5,
                      padding: "2px 5px", background: "rgba(0,0,0,0.5)", color: "white",
                      fontSize: 9, fontWeight: 600, borderRadius: 3,
                    }}>
                      {i + 1}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Default terms */}
            <div className="card" style={{ padding: 18 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Default terms</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                <div className="field">
                  <label className="label">Default MOQ</label>
                  <input className="inp" name="moq" defaultValue="1 (dropship)" />
                </div>
                <div className="field">
                  <label className="label">Lead time</label>
                  <input className="inp" name="leadTime" defaultValue="3 days (in stock)" />
                </div>
                <div className="field">
                  <label className="label">Returns window</label>
                  <input className="inp" name="returnsWindow" defaultValue="14 days · defects only" />
                </div>
              </div>
            </div>

            {/* Contact info */}
            <div className="card" style={{ padding: 18 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Contact & account</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div className="field">
                  <label className="label">Account name</label>
                  <input className="inp" name="name" defaultValue={user.name} />
                </div>
                <div className="field">
                  <label className="label">City</label>
                  <input className="inp" name="city" defaultValue={supplier.city ?? ""} />
                </div>
                <div className="field">
                  <label className="label">Country</label>
                  <input className="inp" name="country" defaultValue={supplier.country ?? ""} />
                </div>
                <div className="field">
                  <label className="label">WhatsApp number</label>
                  <input className="inp" name="whatsappNumber" defaultValue={supplier.whatsappNumber ?? ""} />
                </div>
                <div className="field">
                  <label className="label">Response time label</label>
                  <input className="inp" name="responseTimeLabel" defaultValue={supplier.responseTimeLabel ?? "Usually responds within 2 hours"} />
                </div>
                <div className="field">
                  <label className="label">Website</label>
                  <input className="inp" name="website" defaultValue={supplier.website ?? ""} placeholder="https://example.com" />
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Preview */}
            <div className="card" style={{ padding: 18 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>What sellers see · preview</div>
              <div style={{
                height: 80, borderRadius: 8,
                background: supplier.bannerUrl ? `url(${supplier.bannerUrl}) center/cover` : "linear-gradient(135deg, #D4A574, #6B4A2C 50%, #3a2614)",
                marginBottom: 0, position: "relative",
              }} />
              <div style={{ padding: "0 12px 14px", marginTop: -22, position: "relative" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                  <div style={{
                    width: 54, height: 54, borderRadius: 10,
                    background: supplier.logoUrl ? `url(${supplier.logoUrl}) center/cover` : "linear-gradient(135deg, var(--amber-500), var(--rose-500))",
                    border: "3px solid var(--paper)",
                    display: "grid", placeItems: "center", color: "white",
                    fontFamily: "var(--font-accent)", fontWeight: 600, fontSize: 20,
                  }}>
                    {!supplier.logoUrl && supplier.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, paddingBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{supplier.displayName}</div>
                      {supplier.verificationStatus === "verified" && <Icon name="check" size={12} color="var(--teal-700)" />}
                    </div>
                    <div style={{ fontSize: 10.5, color: "var(--ink-500)" }}>
                      {supplier.city ?? "Aba"} · {workspace.metrics.publishedProductCount} products · since 2019
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-700)", marginTop: 8, lineHeight: 1.5 }}>
                  {supplier.description?.split("\n")[0] ?? "Hand-stitched leather goods · Aba, Nigeria · since 2019"}
                </div>
                <div style={{ display: "flex", gap: 5, marginTop: 8, flexWrap: "wrap" }}>
                  {["Dropship", "Bulk", "Sample", "Heritage"].map((t) => (
                    <span key={t} className="chip" style={{ fontSize: 10 }}>{t}</span>
                  ))}
                </div>
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  marginTop: 10, padding: "8px 10px",
                  background: "var(--ink-50)", borderRadius: 8, fontSize: 11,
                }}>
                  <div><div style={{ color: "var(--ink-500)", fontSize: 9.5 }}>Trust</div><strong>{supplier.trustScore ?? 94}</strong></div>
                  <div><div style={{ color: "var(--ink-500)", fontSize: 9.5 }}>On-time</div><strong>96%</strong></div>
                  <div><div style={{ color: "var(--ink-500)", fontSize: 9.5 }}>★</div><strong>{supplier.rating.toFixed(1)}</strong></div>
                </div>
              </div>
            </div>

            {/* Approval status */}
            <div className="card" style={{ padding: 18 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Approval status</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
                {[
                  ["Verification", supplier.verificationStatus],
                  ["Public status", supplier.status],
                  ["Catalog count", `${workspace.metrics.productCount} products`],
                  ["Published", `${workspace.metrics.publishedProductCount} products`],
                  ["Slug", supplier.slug],
                  ["Categories", supplier.categories?.join(", ") || "Not set"],
                ].map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: i ? "1px solid var(--ink-100)" : "none" }}>
                    <span style={{ color: "var(--ink-500)" }}>{r[0]}</span>
                    <strong style={{ fontSize: 12.5 }}>{r[1]}</strong>
                  </div>
                ))}
              </div>
            </div>

            {/* Discovery */}
            <div className="card" style={{ padding: 14, background: "linear-gradient(160deg, var(--teal-50), var(--paper))" }}>
              <div style={{ fontSize: 11, color: "var(--teal-700)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                Discovery this week
              </div>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <div style={{ fontFamily: "var(--font-accent)", fontSize: 30, fontWeight: 500 }}>1,284</div>
                <div style={{ flex: 1, fontSize: 11.5, color: "var(--ink-600)" }}>
                  profile views · <strong style={{ color: "var(--success)" }}>+22%</strong> from last week
                </div>
              </div>
              <hr className="hr" />
              <div style={{ fontSize: 11.5, color: "var(--ink-600)", lineHeight: 1.45 }}>
                Sellers find you mostly via <strong>&ldquo;hand-stitched leather&rdquo;</strong> and <strong>&ldquo;Aba dropship&rdquo;</strong> searches.
              </div>
            </div>
          </div>
        </form>
        )}
      </div>
    </AppFrame>
  );
}
