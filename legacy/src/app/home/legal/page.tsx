import { redirect } from "next/navigation";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead } from "@/components/ui";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace, parseBrandSettings } from "@/lib/workspace";
import { saveStoreLegalSettings } from "@/app/actions/workspace";
import { PageToast } from "@/components/PageToast";

export const dynamic = "force-dynamic";

const LEGAL_PAGES = [
  {
    key: "privacyPolicy",
    label: "Privacy policy",
    help: "Explain what data you collect, how it's used, and how customers can request deletion.",
    rows: 8,
  },
  {
    key: "terms",
    label: "Terms and conditions",
    help: "Define the rules for using your store, payment obligations, and dispute resolution.",
    rows: 8,
  },
  {
    key: "returnPolicy",
    label: "Return & refund policy",
    help: "State your return window, conditions for returns, and how refunds are processed.",
    rows: 6,
  },
  {
    key: "shippingPolicy",
    label: "Shipping policy",
    help: "Describe your delivery zones, timelines, and how shipping costs are calculated.",
    rows: 6,
  },
] as const;

export default async function LegalSettingsPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace?.store) redirect("/onboarding?role=seller");

  const store = workspace.store;
  const settings = parseBrandSettings(store.brandSettings);
  const legal = settings.legal && typeof settings.legal === "object"
    ? settings.legal as Record<string, string>
    : {};

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
        <PageHead
          title="Legal pages"
          sub="These appear as footer links and dedicated pages on your storefront."
        />

        <form action={saveStoreLegalSettings} style={{ maxWidth: 860, display: "flex", flexDirection: "column", gap: 16 }}>
          {LEGAL_PAGES.map((page) => (
            <div key={page.key} className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--ink-900)" }}>{page.label}</h2>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink-500)" }}>{page.help}</p>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <textarea
                  name={page.key}
                  className="ta"
                  rows={page.rows}
                  defaultValue={legal[page.key] ?? ""}
                  placeholder={`Enter your ${page.label.toLowerCase()} here…`}
                />
              </div>
            </div>
          ))}

          <div>
            <button className="dbtn dBtn-mint" type="submit">Save legal pages</button>
          </div>
        </form>
      </div>
    </AppFrame>
  );
}
