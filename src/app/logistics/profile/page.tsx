import { updateLogisticsProfile } from "@/app/actions/logistics";
import { requireRole } from "@/lib/server-auth";
import { getLogisticsWorkspace } from "@/lib/workspace";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon } from "@/components/ui";
import { LogoUploadForm } from "./LogoUploadForm";
import { CoverImageUpload } from "./CoverImageUpload";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ tab?: string; limit?: string }>;
};

export default async function LogisticsProfilePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const activeTab = params?.tab ?? "Profile";
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const workspace = await getLogisticsWorkspace(user.id);
  if (!workspace) return null;
  const { partner } = workspace;

  const onboardingState = (partner.onboardingState as any) || {};
  const hours = onboardingState.serviceHours || [
    { day: "Mon-Fri", open: "08:00", close: "20:00", cutoff: "16:00", active: true },
    { day: "Saturday", open: "09:00", close: "18:00", cutoff: "14:00", active: true },
    { day: "Sunday", open: "10:00", close: "16:00", cutoff: "12:00", active: false },
  ];
  const isVerified = partner.verificationStatus === "verified";

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
          title="Company profile"
          sub="What sellers see when they request a quote from your company"
          actions={
            <>
              <a href={`/logistics/partners/${partner.slug}`} target="_blank" className="dbtn dBtn-ghost" style={{ textDecoration: "none" }}>
                <Icon name="eye" size={14} /> Public preview
              </a>
              <button className="dbtn dBtn-mint" form="profile-form">Save</button>
            </>
          }
        />

        <form id="profile-form" action={updateLogisticsProfile} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card" style={{ overflow: "hidden", padding: 0 }}>
            <CoverImageUpload currentBanner={partner.bannerUrl ?? null} displayName={partner.displayName} city={partner.city ?? "Lagos"} />
            <div style={{ padding: "18px 18px 14px", display: "flex", gap: 16, alignItems: "flex-end", marginTop: -30, position: "relative", zIndex: 1 }}>
              <LogoUploadForm currentLogo={partner.logoUrl ?? null} displayName={partner.displayName} />
              <div style={{ flex: 1 }}>
                <div className="field">
                  <label className="label">Display name</label>
                  <input className="inp" name="displayName" defaultValue={partner.displayName} />
                </div>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label className="label">Tagline</label>
                <input className="inp" name="tagline" defaultValue={`${partner.city ?? "Lagos"} · ${partner.estimatedSpeed ?? "same-day"} · ${partner.reliabilityScore}% on-time`} />
              </div>
            </div>
            <div style={{ padding: "0 18px 18px" }}>
              <div className="field">
                <label className="label">About</label>
                <textarea className="ta" name="description" rows={3} defaultValue={partner.description ?? ""} />
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Service hours</div>
            <table className="tbl" style={{ fontSize: 12.5 }}>
              <thead>
                <tr><th>Day</th><th>Open</th><th>Close</th><th>Cutoff</th><th>Active</th></tr>
              </thead>
              <tbody>
                {hours.map((r: any, i: number) => (
                  <tr key={i}>
                    <td>
                      <strong>{r.day}</strong>
                      <input type="hidden" name={`hours_${i}_day`} value={r.day} />
                    </td>
                    <td><input className="inp" name={`hours_${i}_open`} defaultValue={r.open} style={{ width: 70, fontSize: 12 }} /></td>
                    <td><input className="inp" name={`hours_${i}_close`} defaultValue={r.close} style={{ width: 70, fontSize: 12 }} /></td>
                    <td><input className="inp" name={`hours_${i}_cutoff`} defaultValue={r.cutoff} style={{ width: 70, fontSize: 12 }} /></td>
                    <td>
                      <input type="checkbox" name={`hours_${i}_active`} defaultChecked={r.active} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Contact & account</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div className="field"><label className="label">Account name</label><input className="inp" name="name" defaultValue={user.name} /></div>
              <div className="field"><label className="label">City</label><input className="inp" name="city" defaultValue={partner.city} /></div>
              <div className="field"><label className="label">Country</label><input className="inp" name="country" defaultValue={partner.country} /></div>
              <div className="field"><label className="label">WhatsApp</label><input className="inp" name="whatsappNumber" defaultValue={partner.whatsappNumber ?? ""} /></div>
              <div className="field"><label className="label">Pricing model</label><input className="inp" name="pricingModel" defaultValue={partner.pricingModel} /></div>
              <div className="field"><label className="label">Base price (₦)</label><input className="inp" name="basePrice" type="number" defaultValue={partner.basePrice} /></div>
            </div>
            <div className="field" style={{ marginTop: 14 }}>
              <label className="label">Estimated speed</label>
              <input className="inp" name="estimatedSpeed" defaultValue={partner.estimatedSpeed ?? "Same day within Lagos"} />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Public profile preview</div>
            <div style={{
              height: 80, borderRadius: 10, marginBottom: 14,
              background: partner.bannerUrl ? `url(${partner.bannerUrl}) center/cover` : "linear-gradient(135deg, #5b6ad0, #3a4ba6 60%, #1f2872)",
            }} />
            <div style={{ display: "flex", gap: 11, alignItems: "center", marginBottom: 10 }}>
              <div style={{ width: 46, height: 46, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: "var(--ink-200)" }}>
                {partner.logoUrl ? <img src={partner.logoUrl} alt="" style={{ width: 46, height: 46, objectFit: "cover" }} /> : null}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{partner.displayName}</div>
                  {isVerified && <Icon name="check" size={13} color="var(--teal-700)" />}
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-500)" }}>{partner.city ?? "Lagos"} · {partner.vehicleTypes.join(" · ")}</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5, marginBottom: 10, fontSize: 11 }}>
              <div style={{ padding: "7px 9px", background: "var(--paper)", borderRadius: 7, textAlign: "center" }}>
                <div style={{ color: "var(--ink-500)", fontSize: 10 }}>Rating</div>
                <strong>★ {partner.rating.toFixed(1)}</strong>
              </div>
              <div style={{ padding: "7px 9px", background: "var(--paper)", borderRadius: 7, textAlign: "center" }}>
                <div style={{ color: "var(--ink-500)", fontSize: 10 }}>On-time</div>
                <strong>{partner.reliabilityScore}%</strong>
              </div>
              <div style={{ padding: "7px 9px", background: "var(--paper)", borderRadius: 7, textAlign: "center" }}>
                <div style={{ color: "var(--ink-500)", fontSize: 10 }}>From</div>
                <strong>₦{partner.basePrice}</strong>
              </div>
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {partner.deliveryTypes.slice(0, 4).map((t) => (
                <span key={t} className="chip" style={{ fontSize: 10 }}>{t}</span>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 14, background: "linear-gradient(160deg, var(--teal-50), var(--paper))" }}>
            <div style={{ fontSize: 11, color: "var(--teal-700)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Discovery</div>
            <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontFamily: "var(--font-accent)", fontSize: 28, fontWeight: 500 }}>{workspace.metrics.activeBookingCount + workspace.metrics.pendingQuoteCount}</div>
              <div style={{ flex: 1, fontSize: 11.5, color: "var(--ink-600)" }}>
                profile views this week · <strong style={{ color: "var(--success)" }}>+18%</strong>
              </div>
            </div>
            <hr className="hr" />
            <div style={{ fontSize: 11.5, color: "var(--ink-600)", lineHeight: 1.5 }}>
              Sellers find you mostly via <strong>&ldquo;{partner.city ?? "Lagos"} same-day&rdquo;</strong> and <strong>&ldquo;{partner.city ?? "Yaba"} pickup&rdquo;</strong> queries.
            </div>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 10 }}>Compliance</div>
            {[
              ["CAC business registration", isVerified ? "Verified" : "Pending verification"],
              ["Vehicle insurance", isVerified ? "Verified" : "Pending verification"],
              ["Commercial transport permit", isVerified ? "Verified" : "Pending verification"],
              ["Riders licensed", isVerified ? `Verified (${partner.vehicleTypes.length} vehicles)` : "Pending verification"],
            ].map((c, i) => {
              const statusText = c[1];
              const done = statusText.startsWith("Verified");
              return (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderTop: i ? "1px solid var(--ink-100)" : "none" }}>
                  <Icon name={done ? "check" : "clock"} size={13} color={done ? "var(--teal-700)" : "var(--ink-400)"} />
                  <span style={{ flex: 1, fontSize: 12 }}>{c[0]}</span>
                  <span style={{ fontSize: 10.5, color: done ? "var(--teal-700)" : "var(--ink-400)" }}>{statusText}</span>
                </div>
              );
            })}
          </div>
        </div>
        </form>
      </div>
    </AppFrame>
  );
}
