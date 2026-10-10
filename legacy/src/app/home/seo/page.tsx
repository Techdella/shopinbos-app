import { redirect } from "next/navigation";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead } from "@/components/ui";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace, parseBrandSettings } from "@/lib/workspace";
import { saveStoreSeoSettings, saveStoreIntegrationSettings } from "@/app/actions/workspace";
import { PageToast } from "@/components/PageToast";

export const dynamic = "force-dynamic";

type SeoPageProps = { searchParams?: Promise<{ saved?: string; tab?: string }> };

export default async function SeoSettingsPage({ searchParams }: SeoPageProps) {
  const params = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace?.store) redirect("/onboarding?role=seller");

  const store = workspace.store;
  const settings = parseBrandSettings(store.brandSettings);
  const seo = settings.seo && typeof settings.seo === "object" ? (settings.seo as Record<string, string>) : {};
  const integrations =
    settings.integrations && typeof settings.integrations === "object"
      ? (settings.integrations as Record<string, string>)
      : {};

  const activeTab = params?.tab === "integrations" ? "integrations" : "seo";

  return (
    <AppFrame
      role="seller"
      storeName={store.name}
      storeSlug={store.slug}
      storeInitial={store.name?.[0]?.toUpperCase()}
      storeLogoUrl={store.logoUrl}
      userName={user.name ?? "You"}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageToast />
        {params?.saved && (
          <div style={{ padding: "10px 16px", borderRadius: 10, background: "var(--teal-50)", border: "1px solid var(--teal-200)", color: "var(--teal-800)", fontSize: 13, fontWeight: 600 }}>
            Settings saved successfully.
          </div>
        )}
        <PageHead
          title="SEO & Analytics"
          sub="Control how your store appears in Google, add analytics tracking, and verify your site with Google tools."
        />

        {/* Tab switcher */}
        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--ink-100)", marginBottom: 8 }}>
          {(["seo", "integrations"] as const).map((tab) => (
            <a
              key={tab}
              href={`/home/seo${tab === "integrations" ? "?tab=integrations" : ""}`}
              style={{
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 600,
                color: activeTab === tab ? "var(--teal-700)" : "var(--ink-500)",
                borderBottom: activeTab === tab ? "2px solid var(--teal-600)" : "2px solid transparent",
                textDecoration: "none",
                marginBottom: -1,
              }}
            >
              {tab === "seo" ? "SEO" : "Google Integrations"}
            </a>
          ))}
        </div>

        {activeTab === "seo" ? (
          <form action={saveStoreSeoSettings} style={{ maxWidth: 760, display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--ink-900)" }}>Search engine listing</h2>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink-500)" }}>
                  This appears as the title and description in Google search results.
                </p>
              </div>
              <div className="field">
                <label className="label">SEO title</label>
                <input
                  name="seoTitle"
                  className="inp"
                  title="SEO title"
                  placeholder={store.name}
                  defaultValue={seo.title ?? store.name}
                  maxLength={70}
                />
                <div className="help">Optimal length: 50–70 characters.</div>
              </div>
              <div className="field">
                <label className="label">Meta description</label>
                <textarea
                  name="seoDescription"
                  className="ta"
                  title="Meta description"
                  placeholder="Describe your store in 120–160 characters…"
                  rows={3}
                  defaultValue={seo.description ?? store.description ?? ""}
                  maxLength={180}
                />
                <div className="help">Optimal length: 120–160 characters.</div>
              </div>
              <div className="field">
                <label className="label">Keywords</label>
                <input
                  name="seoKeywords"
                  className="inp"
                  title="SEO keywords"
                  placeholder="e.g. African fashion, wholesale clothing, Lagos boutique"
                  defaultValue={seo.keywords ?? ""}
                />
                <div className="help">Separate with commas.</div>
              </div>
            </div>

            <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--ink-900)" }}>Social media preview</h2>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink-500)" }}>
                  The image shown when your store link is shared on WhatsApp, Twitter, or Facebook.
                </p>
              </div>
              <div className="field">
                <label className="label">Preview image URL</label>
                <input
                  name="socialImage"
                  className="inp"
                  title="Social preview image URL"
                  placeholder="https://your-storage.supabase.co/..."
                  defaultValue={seo.socialImage ?? store.logoUrl ?? ""}
                  type="url"
                />
                <div className="help">Recommended size: 1200×630 px.</div>
              </div>
              {(seo.socialImage || store.logoUrl) ? (
                <div>
                  <div style={{ fontSize: 11, color: "var(--ink-500)", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Preview</div>
                  <div style={{ border: "1px solid var(--ink-100)", borderRadius: 8, overflow: "hidden", maxWidth: 360 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={seo.socialImage ?? store.logoUrl ?? ""}
                      alt="Social preview"
                      style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }}
                    />
                    <div style={{ padding: "8px 12px", background: "var(--paper)" }}>
                      <div style={{ fontSize: 11, color: "var(--ink-400)", textTransform: "uppercase" }}>shopinbos.com</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-900)", marginTop: 2 }}>
                        {seo.title ?? store.name}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 2 }}>
                        {seo.description ?? store.description ?? ""}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div>
              <button className="dbtn dBtn-mint" type="submit">Save SEO settings</button>
            </div>
          </form>
        ) : (
          <form action={saveStoreIntegrationSettings} style={{ maxWidth: 760, display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--ink-900)" }}>Google Analytics 4</h2>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink-500)" }}>
                  Track visitors, sessions, and conversions on your storefront. Get your Measurement ID from{" "}
                  <strong>Google Analytics → Admin → Data Streams → Web stream → Measurement ID</strong>.
                </p>
              </div>
              <div className="field">
                <label className="label">GA4 Measurement ID</label>
                <input
                  name="googleAnalyticsId"
                  className="inp"
                  title="Google Analytics 4 Measurement ID"
                  placeholder="G-XXXXXXXXXX"
                  defaultValue={integrations.googleAnalyticsId ?? ""}
                  pattern="G-[A-Z0-9]+"
                />
                <div className="help">
                  Format: <code>G-XXXXXXXXXX</code>. Leave blank to disable analytics tracking.
                </div>
              </div>
              {integrations.googleAnalyticsId && (
                <div style={{ padding: "10px 14px", borderRadius: 8, background: "var(--teal-50)", border: "1px solid var(--teal-200)", fontSize: 12.5, color: "var(--teal-800)" }}>
                  GA4 is connected — tracking is active on your live storefront.
                </div>
              )}
            </div>

            <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--ink-900)" }}>Google Search Console</h2>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink-500)" }}>
                  Verify your store with Google Search Console to monitor search rankings, index coverage, and submit your sitemap.
                  In Search Console, choose <strong>HTML tag</strong> verification and paste the content value below.
                </p>
              </div>
              <div className="field">
                <label className="label">Verification meta tag content</label>
                <input
                  name="gaSiteVerification"
                  className="inp"
                  title="Google Search Console verification token"
                  placeholder="Paste the content= value from the meta tag, e.g. abc123xyz..."
                  defaultValue={integrations.gaSiteVerification ?? ""}
                />
                <div className="help">
                  Copy only the value inside <code>content="..."</code>, not the full tag. Example:{" "}
                  <code>{"<meta name=\"google-site-verification\" content=\"PASTE_THIS_PART\" />"}</code>
                </div>
              </div>
              {integrations.gaSiteVerification && (
                <div style={{ padding: "10px 14px", borderRadius: 8, background: "var(--teal-50)", border: "1px solid var(--teal-200)", fontSize: 12.5, color: "var(--teal-800)" }}>
                  Verification tag is set. Verify in Google Search Console to confirm ownership.
                </div>
              )}
            </div>

            <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--ink-900)" }}>Google Merchant Center</h2>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink-500)" }}>
                  Your products are automatically structured for Google Merchant Center via JSON-LD markup on your storefront — no extra setup needed. To activate Shopping ads, create a free Google Merchant Center account and submit your store URL.
                </p>
              </div>
              <div style={{ padding: "10px 14px", borderRadius: 8, background: "var(--ink-50)", border: "1px solid var(--ink-100)", fontSize: 12.5, color: "var(--ink-600)" }}>
                Product schema (JSON-LD) is injected on every page of your live storefront. Google can read your product catalogue for Shopping results and rich snippets.
              </div>
            </div>

            <div>
              <button className="dbtn dBtn-mint" type="submit">Save integration settings</button>
            </div>
          </form>
        )}
      </div>
    </AppFrame>
  );
}
