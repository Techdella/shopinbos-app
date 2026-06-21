import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { updateSellerProfile, saveNotificationPreferences, saveStoreSettings, uploadStoreLogo, closeStore, inviteTeamMember } from "@/app/actions/workspace";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon, MascotAvatar } from "@/components/ui";
import { PageToast } from "@/components/PageToast";
import Link from "next/link";
import Image from "next/image";
import { SellerBillingSection } from "@/components/payments/SellerBillingSection";
import { StoreLaunchBalanceCard } from "@/components/billing/StoreLaunchBalanceCard";
import { PeggyPreferencesForm } from "@/components/settings/PeggyPreferencesForm";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ tab?: string }>;
};

export default async function SellerSettingsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const activeTab = params?.tab ?? "Store";
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);

  if (!workspace) return null;

  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { aiCredits: true },
  });
  const aiCredits = dbUser?.aiCredits ?? 5;
  const brandSettings = (workspace.store?.brandSettings ?? {}) as Record<string, any>;
  const launchBilling = brandSettings.launchBilling && typeof brandSettings.launchBilling === "object"
    ? brandSettings.launchBilling as { balanceDue?: number; dueAt?: string | null }
    : null;
  const peggyPrefs = brandSettings.peggyPreferences ?? {};
  const savedCommStyle = peggyPrefs.communicationStyle ?? "Friendly";
  const savedDailyBrief = peggyPrefs.dailyBrief ?? "Morning only";

  const storeName = workspace.store?.name ?? "Your Store";
  const storeSlug = workspace.store?.slug ? `${workspace.store.slug}.shopinbos.shop` : undefined;
  const storeLogoUrl = workspace.store?.logoUrl;

  return (
    <AppFrame
      role="seller"
      storeName={storeName}
      storeSlug={storeSlug}
      storeInitial={storeName.charAt(0).toUpperCase()}
      storeLogoUrl={storeLogoUrl}
      userName={user.name}
      userInitials={user.name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2)}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageToast />
        <PageHead
          title="Settings"
          sub="Store profile · Peggy memory · billing · team"
        />

        <div className="design-tabs">
          {["Store", "Peggy & AI", "Team", "Billing", "Notifications"].map((t) => (
            <a key={t} href={`/home/settings?tab=${encodeURIComponent(t)}`} className={`tab${t === activeTab ? " on" : ""}`} style={{ textDecoration: "none", cursor: "pointer" }}>{t}</a>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {activeTab === "Store" && (
            <>
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Store logo</div>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                {storeLogoUrl ? (
                  <Image src={storeLogoUrl} alt="Store logo" width={64} height={64} style={{ borderRadius: 12, objectFit: "cover" }} unoptimized />
                ) : (
                  <div style={{ width: 64, height: 64, borderRadius: 12, background: "var(--ink-100)", display: "grid", placeItems: "center", color: "var(--ink-400)", fontSize: 24 }}>{storeName.charAt(0).toUpperCase()}</div>
                )}
                <form action={uploadStoreLogo} style={{ display: "flex", gap: 8, alignItems: "center", flex: 1 }}>
                  <input type="file" name="logo" accept="image/*" required style={{ fontSize: 12, flex: 1 }} />
                  <button type="submit" className="dbtn dBtn-mint dBtn-sm">Upload</button>
                </form>
              </div>
            </div>

            <form action={saveStoreSettings}>
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Store information</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div className="field">
                  <label className="label">Store name</label>
                  <input name="storeName" className="inp" defaultValue={storeName} />
                </div>
                <div className="field">
                  <label className="label">Store slug</label>
                  <input name="slug" className="inp" defaultValue={workspace.store?.slug ?? ""} />
                  <div className="help">Your URL: {storeSlug}</div>
                </div>
              </div>
              <div className="field" style={{ marginBottom: 14 }}>
                <label className="label">Tagline</label>
                <input name="tagline" className="inp" defaultValue={(workspace.store as any)?.tagline ?? ""} />
              </div>
              <div className="field" style={{ marginBottom: 14 }}>
                <label className="label">About your store</label>
                <textarea name="description" className="ta" rows={4} defaultValue={workspace.store?.description ?? ""} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div className="field">
                  <label className="label">City</label>
                  <input name="city" className="inp" defaultValue={workspace.store?.city ?? ""} />
                </div>
                <div className="field">
                  <label className="label">Country</label>
                  <div className="sel" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>{workspace.store?.country ?? "Nigeria"}</span>
                    <Icon name="chevDown" size={12} />
                  </div>
                </div>
              </div>
              <button type="submit" className="dbtn dBtn-mint" style={{ marginTop: 14 }}>Save store info</button>
            </div>
            </form>

            <form action={updateSellerProfile}>
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Contact details</div>
              <div className="field" style={{ marginBottom: 14 }}>
                <label className="label">Email</label>
                <input name="email" className="inp" defaultValue={user.email ?? ""} />
              </div>
              <div className="field" style={{ marginBottom: 14 }}>
                <label className="label">Phone</label>
                <input name="phone" className="inp" defaultValue={"+234 " + (user.phone ?? "800 000 0000")} />
              </div>
              <button type="submit" className="dbtn dBtn-mint" style={{ alignSelf: "flex-start" }}>Save changes</button>
            </div>
            </form>
            </>
            )}

            {activeTab === "Peggy & AI" && (
              <PeggyPreferencesForm
                defaultMemory={(workspace.settings.onboardingMemory as any)?.notes ?? ""}
                defaultCommStyle={savedCommStyle}
                defaultDailyBrief={savedDailyBrief}
              />
            )}

            {activeTab === "Team" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div className="card" style={{ padding: 20 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Team members</div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-600)", lineHeight: 1.5, marginBottom: 14 }}>
                    Invite team members to help manage your store.
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: "var(--ink-50)", borderRadius: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--teal-600)", color: "white", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 14 }}>{user.name.split(" ").map((p: string) => p[0]).join("").toUpperCase().slice(0, 2)}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{user.name}</div>
                        <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>{user.email} · Owner</div>
                      </div>
                      <Badge variant="mint">You</Badge>
                    </div>
                    {((brandSettings.pendingInvites ?? []) as string[]).map((email: string) => (
                      <div key={email} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: "var(--ink-50)", borderRadius: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--ink-200)", display: "grid", placeItems: "center", fontSize: 16 }}>✉</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: "var(--ink-700)" }}>{email}</div>
                          <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>Invite pending</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <form action={inviteTeamMember} className="card" style={{ padding: 20 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 10 }}>Invite a team member</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input name="email" type="email" className="inp" placeholder="colleague@email.com" required style={{ flex: 1 }} />
                    <button type="submit" className="dbtn dBtn-mint"><Icon name="plus" size={12} /> Send invite</button>
                  </div>
                </form>
              </div>
            )}

            {activeTab === "Billing" && (
              <>
                <StoreLaunchBalanceCard balanceDue={Number(launchBilling?.balanceDue ?? 0)} dueAt={launchBilling?.dueAt} />
                <SellerBillingSection
                  userEmail={user.email}
                  userName={user.name}
                  aiCredits={aiCredits}
                  productCount={workspace.storeProducts.length}
                />
              </>
            )}

            {activeTab === "Notifications" && (
              <form action={saveNotificationPreferences} className="card" style={{ padding: 20 }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Notification preferences</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { e: "orderPlaced", l: "New orders", d: "When a customer places an order" },
                    { e: "orderShipped", l: "Order shipped", d: "When an order is marked as shipped" },
                    { e: "orderDelivered", l: "Order delivered", d: "When a delivery is confirmed" },
                    { e: "paymentConfirmed", l: "Payment received", d: "When a payout is processed" },
                  ].map((n, i) => (
                    <label key={i} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "10px 12px", borderRadius: 10,
                      background: "var(--ink-50)",
                      cursor: "pointer",
                    }}>
                      <input type="checkbox" name={n.e} defaultChecked style={{
                        width: 20, height: 20, borderRadius: 6, accentColor: "var(--teal-600)",
                      }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink-900)" }}>{n.l}</div>
                        <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>{n.d}</div>
                      </div>
                    </label>
                  ))}
                </div>
                <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
                  <div className="field" style={{ flex: 1 }}>
                    <label className="label">SMS alerts</label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input type="checkbox" name="smsChannel" defaultChecked style={{ accentColor: "var(--teal-600)" }} />
                      <span style={{ fontSize: 13 }}>Enable SMS</span>
                    </label>
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label className="label">Email alerts</label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input type="checkbox" name="emailChannel" defaultChecked style={{ accentColor: "var(--teal-600)" }} />
                      <span style={{ fontSize: 13 }}>Enable email</span>
                    </label>
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label className="label">WhatsApp</label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input type="checkbox" name="whatsappChannel" style={{ accentColor: "var(--teal-600)" }} />
                      <span style={{ fontSize: 13 }}>Enable WhatsApp</span>
                    </label>
                  </div>
                </div>
                <button type="submit" className="dbtn dBtn-mint" style={{ marginTop: 10 }}>
                  <Icon name="check" size={14} /> Save preferences
                </button>
              </form>
            )}
          </div>

          {/* Right sidebar */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Peggy memory card */}
            <div className="card" style={{
              padding: 16,
              background: "linear-gradient(160deg, var(--teal-50), var(--teal-100))",
            }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <MascotAvatar role="seller" size={40} />
                <div>
                  <div style={{
                    fontSize: 11, color: "var(--teal-700)", fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3,
                  }}>
                    Peggy memory
                  </div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-800)" }}>
                    Peggy remembers your preferences, frequent suppliers, and brand voice. You can review or clear what she knows at any time.
                  </div>
                  <Link href="/home/settings?tab=Peggy+%26+AI" className="dbtn dBtn-mint dBtn-sm" style={{ marginTop: 6 }}>
                    <Icon name="eye" size={12} /> Review memory
                  </Link>
                </div>
              </div>
            </div>

            {/* Quick stats */}
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 12 }}>Store stats</div>
              {[
                { l: "Products", v: String(workspace.storeProducts.length) },
                { l: "Delivery bookings", v: String(workspace.deliveryBookings.length) },
              ].map((s, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between",
                  padding: "8px 0", borderTop: i ? "1px solid var(--ink-100)" : "none",
                  fontSize: 13,
                }}>
                  <span style={{ color: "var(--ink-600)" }}>{s.l}</span>
                  <strong>{s.v}</strong>
                </div>
              ))}
            </div>

            {/* Danger zone */}
            <form action={closeStore} className="card" style={{ padding: 16, borderColor: "var(--danger-bg)" }}>
              <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--danger)", marginBottom: 8 }}>Danger zone</div>
              <div style={{ fontSize: 12, color: "var(--ink-600)", lineHeight: 1.5, marginBottom: 12 }}>
                Type <strong>CLOSE</strong> below and confirm to close your store. This will hide your store from customers.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input name="confirm" className="inp" placeholder="Type CLOSE to confirm" style={{ flex: 1, fontSize: 12 }} />
                <button type="submit" className="dbtn dBtn-ghost dBtn-sm" style={{ color: "var(--danger)", borderColor: "var(--danger-bg)" }}>
                  <Icon name="x" size={12} /> Close store
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
