import { redirect } from "next/navigation";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead } from "@/components/ui";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace, parseBrandSettings } from "@/lib/workspace";
import { saveStoreNavigationSettings } from "@/app/actions/workspace";
import { PageToast } from "@/components/PageToast";

export const dynamic = "force-dynamic";

type NavPageProps = { searchParams?: Promise<{ saved?: string }> };

export default async function NavigationSettingsPage({ searchParams }: NavPageProps) {
  const params = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace?.store) redirect("/onboarding?role=seller");

  const store = workspace.store;
  const settings = parseBrandSettings(store.brandSettings);
  const navigation = settings.navigation && typeof settings.navigation === "object"
    ? settings.navigation as Record<string, unknown>
    : {};
  const mainMenu = Array.isArray(navigation.mainMenu)
    ? navigation.mainMenu.join(", ")
    : "Home, Shop, About, Contact";
  const footerMenu = Array.isArray(navigation.footerMenu)
    ? navigation.footerMenu.join(", ")
    : "Privacy, Terms, Returns, Contact";

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
            Navigation settings saved.
          </div>
        )}
        <PageHead
          title="Navigation"
          sub="Configure the main menu and footer links for your storefront."
        />

        <form action={saveStoreNavigationSettings} style={{ maxWidth: 760, display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--ink-900)" }}>Main menu</h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink-500)" }}>
                The top navigation links visible on every page of your storefront.
              </p>
            </div>
            <div className="field">
              <label className="label">Menu items</label>
              <input
                name="mainMenu"
                className="inp"
                title="Main menu items"
                placeholder="Home, Shop, About, Contact"
                defaultValue={mainMenu}
              />
              <div className="help">Enter comma-separated labels, e.g. <em>Home, Shop, About, Contact</em>. Labels link to matching page slugs automatically.</div>
            </div>
          </div>

          <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--ink-900)" }}>Footer menu</h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink-500)" }}>
                Links in the footer navigation bar, typically policies and support links.
              </p>
            </div>
            <div className="field">
              <label className="label">Footer links</label>
              <input
                name="footerMenu"
                className="inp"
                title="Footer menu items"
                placeholder="Privacy, Terms, Returns, Contact"
                defaultValue={footerMenu}
              />
              <div className="help">Enter comma-separated labels, e.g. <em>Privacy, Terms, Returns, Contact</em>.</div>
            </div>
          </div>

          <div>
            <button className="dbtn dBtn-mint" type="submit">Save navigation</button>
          </div>
        </form>
      </div>
    </AppFrame>
  );
}
