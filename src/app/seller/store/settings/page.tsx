import Link from "next/link";
import { redirect } from "next/navigation";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageToast } from "@/components/PageToast";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace, parseBrandSettings } from "@/lib/workspace";
import {
  saveStoreBrandKitSettings,
  saveStoreCartSettings,
  saveStoreLegalSettings,
  saveStoreNavigationSettings,
  saveStoreSeoSettings,
} from "@/app/actions/workspace";
import { DomainSettingsPanel } from "@/components/settings/DomainSettingsPanel";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ tab?: string; saved?: string }>;
};

const tabs = [
  { id: "domain", label: "Domain" },
  { id: "brand", label: "Brand kit" },
  { id: "commerce", label: "Commerce" },
  { id: "seo", label: "SEO" },
  { id: "navigation", label: "Navigation" },
  { id: "legal", label: "Legal pages" },
] as const;

function field(label: string, name: string, defaultValue = "", help?: string) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      <input name={name} className="inp" defaultValue={defaultValue} />
      {help ? <div className="help">{help}</div> : null}
    </div>
  );
}

function area(label: string, name: string, defaultValue = "", rows = 5) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      <textarea name={name} className="ta" rows={rows} defaultValue={defaultValue} />
    </div>
  );
}

export default async function SellerStoreSettingsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const activeTab = tabs.some((tab) => tab.id === params?.tab) ? params!.tab! : "domain";
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace?.store) redirect("/onboarding?role=seller");

  const store = workspace.store;
  const settings = parseBrandSettings(store.brandSettings);
  const brandKit = settings.brandKit && typeof settings.brandKit === "object" ? settings.brandKit as Record<string, string> : {};
  const seo = settings.seo && typeof settings.seo === "object" ? settings.seo as Record<string, string> : {};
  const navigation = settings.navigation && typeof settings.navigation === "object" ? settings.navigation as Record<string, unknown> : {};
  const legal = settings.legal && typeof settings.legal === "object" ? settings.legal as Record<string, string> : {};
  const mainMenu = Array.isArray(navigation.mainMenu) ? navigation.mainMenu.join(", ") : "Home, Shop, About, Contact";
  const footerMenu = Array.isArray(navigation.footerMenu) ? navigation.footerMenu.join(", ") : "Privacy, Terms, Returns, Contact";
  const cartConfig = settings.cartConfig && typeof settings.cartConfig === "object"
    ? settings.cartConfig as Record<string, string | boolean>
    : {};
  const addToCartLabel = String(cartConfig.addToCartLabel || "add_to_cart");
  const addToCartBehavior = String(cartConfig.addToCartBehavior || "drawer");
  const cartStyle = String(cartConfig.cartStyle || "right-drawer");
  const enableWishlist = cartConfig.enableWishlist !== false;

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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "var(--color-navy,#0E2A38)" }}>Store settings</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "#6E6E68" }}>Domain, brand, SEO, navigation, and legal content for your storefront.</p>
          </div>
          <Link href="/seller/store" className="dbtn dBtn-ghost" style={{ textDecoration: "none" }}>Back to store</Link>
        </div>

        <div className="design-tabs">
          {tabs.map((tab) => (
            <Link key={tab.id} href={`/seller/store/settings?tab=${tab.id}`} className={`tab${activeTab === tab.id ? " on" : ""}`} style={{ textDecoration: "none" }}>
              {tab.label}
            </Link>
          ))}
        </div>

        {params?.saved ? (
          <div className="card" style={{ padding: "12px 14px", borderColor: "rgba(15,164,147,.25)", color: "#0F766E", fontSize: 13, fontWeight: 700 }}>
            Settings saved.
          </div>
        ) : null}

        {activeTab === "domain" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 780 }}>
            <div className="card" style={{ padding: "12px 16px", background: "var(--ink-50)" }}>
              <div style={{ fontSize: 12, color: "var(--ink-500)", marginBottom: 2 }}>Platform subdomain</div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{store.slug}.shopinbos.com</div>
              <div style={{ fontSize: 11.5, color: "var(--ink-400)", marginTop: 2 }}>
                Always available — your store's permanent fallback URL.
              </div>
            </div>
            <DomainSettingsPanel
              storeSlug={store.slug}
              storeName={store.name}
              currentDomain={store.customDomain ?? null}
            />
          </div>
        ) : null}

        {activeTab === "brand" ? (
          <form action={saveStoreBrandKitSettings} className="card" style={{ padding: 20, display: "grid", gap: 14, maxWidth: 880 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {field("Store name", "storeName", store.name)}
              {field("Tagline", "tagline", String(settings.tagline ?? ""))}
            </div>
            {area("Store description", "description", store.description ?? "", 4)}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {field("City", "city", store.city ?? "")}
              {field("Country", "country", store.country ?? "Nigeria")}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {field("Primary colour", "primaryColor", brandKit.primaryColor ?? settings.themeTokens?.heroBg ?? "#16302B")}
              {field("Accent colour", "accentColor", brandKit.accentColor ?? settings.themeTokens?.accent ?? "#0FA493")}
            </div>
            <button className="dbtn dBtn-mint" type="submit">Save brand kit</button>
          </form>
        ) : null}

        {activeTab === "commerce" ? (
          <form action={saveStoreCartSettings} className="card" style={{ padding: 20, display: "grid", gap: 16, maxWidth: 780 }}>
            <div className="field">
              <label className="label">Add to Cart button label</label>
              <select name="addToCartLabel" defaultValue={addToCartLabel} className="inp">
                <option value="add_to_cart">Add to Cart</option>
                <option value="add_to_bag">Add to Bag</option>
                <option value="add_to_basket">Add to Basket</option>
                <option value="buy_now">Buy Now</option>
                <option value="order_now">Order Now</option>
              </select>
              <div className="help">This label appears on product pages and cards across your storefront.</div>
            </div>
            <div className="field">
              <label className="label">When a customer adds to cart</label>
              <select name="addToCartBehavior" defaultValue={addToCartBehavior} className="inp">
                <option value="drawer">Open cart drawer</option>
                <option value="toast">Show mini confirmation toast</option>
                <option value="stay">Stay on page (no feedback)</option>
                <option value="redirect_cart">Redirect to cart page</option>
                <option value="redirect_checkout">Redirect to checkout</option>
              </select>
            </div>
            <div className="field">
              <label className="label">Cart drawer style</label>
              <select name="cartStyle" defaultValue={cartStyle} className="inp">
                <option value="right-drawer">Right slide drawer</option>
                <option value="bottom-drawer">Bottom mobile drawer</option>
                <option value="fullscreen">Full-screen mobile cart</option>
                <option value="minimal">Minimal cart drawer</option>
                <option value="upsell">Upsell cart drawer</option>
                <option value="luxury">Luxury / fashion bag style</option>
                <option value="marketplace">Marketplace cart style</option>
              </select>
            </div>
            <div className="field">
              <label className="checkbox-label" style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <input type="checkbox" name="enableWishlist" defaultChecked={enableWishlist} style={{ width: 18, height: 18 }} />
                <span style={{ fontWeight: 600, color: "#0E2A38" }}>Enable wishlist</span>
              </label>
              <div className="help">Show heart icon on product cards and enable the wishlist page. Disabling hides all wishlist features.</div>
            </div>
            <button className="dbtn dBtn-mint" type="submit">Save commerce settings</button>
          </form>
        ) : null}

        {activeTab === "seo" ? (
          <form action={saveStoreSeoSettings} className="card" style={{ padding: 20, display: "grid", gap: 14, maxWidth: 880 }}>
            {field("SEO title", "seoTitle", seo.title ?? store.name)}
            {area("Meta description", "seoDescription", seo.description ?? store.description ?? "", 3)}
            {field("Keywords", "seoKeywords", seo.keywords ?? "", "Separate keywords with commas.")}
            {field("Social preview image URL", "socialImage", seo.socialImage ?? store.logoUrl ?? "")}
            <button className="dbtn dBtn-mint" type="submit">Save SEO</button>
          </form>
        ) : null}

        {activeTab === "navigation" ? (
          <form action={saveStoreNavigationSettings} className="card" style={{ padding: 20, display: "grid", gap: 14, maxWidth: 880 }}>
            {field("Main menu", "mainMenu", mainMenu, "Comma-separated page labels, for example: Home, Shop, About, Contact.")}
            {field("Footer menu", "footerMenu", footerMenu, "Comma-separated links for footer navigation.")}
            <button className="dbtn dBtn-mint" type="submit">Save navigation</button>
          </form>
        ) : null}

        {activeTab === "legal" ? (
          <form action={saveStoreLegalSettings} className="card" style={{ padding: 20, display: "grid", gap: 14, maxWidth: 980 }}>
            {area("Privacy policy", "privacyPolicy", legal.privacyPolicy ?? "")}
            {area("Terms and conditions", "terms", legal.terms ?? "")}
            {area("Return policy", "returnPolicy", legal.returnPolicy ?? "", 4)}
            {area("Shipping policy", "shippingPolicy", legal.shippingPolicy ?? "", 4)}
            <button className="dbtn dBtn-mint" type="submit">Save legal pages</button>
          </form>
        ) : null}
      </div>
    </AppFrame>
  );
}
