import { redirect } from "next/navigation";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Icon } from "@/components/ui";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { DomainSettingsPanel } from "@/components/settings/DomainSettingsPanel";
import { PageToast } from "@/components/PageToast";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

const FALLBACK_REGISTRARS = [
  {
    id: "namecheap",
    name: "Namecheap",
    description: "Popular choice with free WhoisGuard privacy and competitive prices.",
    baseUrl: "https://namecheap.com",
    affiliateUrl: "https://namecheap.com",
    logoUrl: null,
  },
  {
    id: "porkbun",
    name: "Porkbun",
    description: "Low prices, free SSL and privacy, excellent for new domain buyers.",
    baseUrl: "https://porkbun.com",
    affiliateUrl: "https://porkbun.com",
    logoUrl: null,
  },
  {
    id: "whogohost",
    name: "Whogohost",
    description: "Nigeria's leading domain registrar — local support and Naira payments.",
    baseUrl: "https://whogohost.com",
    affiliateUrl: "https://whogohost.com",
    logoUrl: null,
  },
  {
    id: "smartweb",
    name: "SmartWeb",
    description: "African-focused registrar with .ng domains and local billing.",
    baseUrl: "https://smartwebng.com",
    affiliateUrl: "https://smartwebng.com",
    logoUrl: null,
  },
  {
    id: "godaddy",
    name: "GoDaddy",
    description: "Largest global registrar with frequent promotional pricing.",
    baseUrl: "https://godaddy.com",
    affiliateUrl: "https://godaddy.com",
    logoUrl: null,
  },
  {
    id: "cloudflare",
    name: "Cloudflare Registrar",
    description: "At-cost domain pricing with free DDoS protection and DNS.",
    baseUrl: "https://cloudflare.com/products/registrar",
    affiliateUrl: "https://cloudflare.com/products/registrar",
    logoUrl: null,
  },
];

type RegistrarRow = {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  affiliateUrl: string | null;
  logoUrl: string | null;
};

export default async function DomainSettingsPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace?.store) redirect("/onboarding?role=seller");

  const store = workspace.store;

  let dbPartners: RegistrarRow[] = [];
  try {
    dbPartners = await db.domainPartner.findMany({
      where: { active: true },
      orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, description: true, baseUrl: true, affiliateUrl: true, logoUrl: true },
    });
  } catch {
    // DomainPartner table may not exist yet — fall back silently
  }

  const registrars: RegistrarRow[] = dbPartners.length > 0 ? dbPartners : FALLBACK_REGISTRARS;

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
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 24 }}>
        <PageToast />
        <PageHead
          title="Domain"
          sub="Your store's address on the web — free Shopinbos subdomain or a custom domain you own."
        />

        {/* Platform subdomain */}
        <div style={{ maxWidth: 760, display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card" style={{ padding: "14px 18px", background: "var(--ink-50)" }}>
            <div style={{ fontSize: 11, color: "var(--ink-500)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
              Platform subdomain (always active)
            </div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "var(--ink-900)" }}>
              {store.slug}.shopinbos.com
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-500)", marginTop: 4 }}>
              This URL is always available — your permanent fallback even when using a custom domain.
            </div>
          </div>

          {/* Custom domain */}
          <DomainSettingsPanel
            storeSlug={store.slug}
            storeName={store.name}
            currentDomain={store.customDomain ?? null}
          />
        </div>

        {/* Buy a domain section */}
        <div style={{ maxWidth: 760, display: "flex", flexDirection: "column", gap: 16, marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--ink-900)" }}>
                Buy a domain
              </h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink-500)" }}>
                Don&apos;t have a domain yet? Purchase one from a trusted registrar below, then connect it here.
              </p>
            </div>
            <div style={{ marginLeft: "auto", flexShrink: 0, padding: "4px 10px", borderRadius: 999, background: "var(--mint)", color: "var(--navy)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Coming soon on Shopinbos
            </div>
          </div>

          <div style={{ padding: "12px 16px", borderRadius: 10, background: "var(--amber-50)", border: "1px solid var(--amber-200)", fontSize: 13, color: "var(--amber-800)", display: "flex", gap: 8, alignItems: "flex-start" }}>
            <Icon name="info" size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              We&apos;re working on native domain purchasing directly on Shopinbos. For now, buy from one of our recommended registrars below, then connect it using the custom domain field above.
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {registrars.map((r) => (
              <a
                key={r.id}
                href={r.affiliateUrl ?? r.baseUrl}
                target="_blank"
                rel="noopener noreferrer sponsored"
                style={{ textDecoration: "none" }}
              >
                <div
                  className="card"
                  style={{
                    padding: "16px 18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    cursor: "pointer",
                    transition: "box-shadow 0.15s",
                    height: "100%",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink-900)" }}>{r.name}</div>
                    <Icon name="link" size={12} style={{ color: "var(--ink-400)" }} />
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-500)", lineHeight: 1.5, flex: 1 }}>
                    {r.description}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--teal-700)", fontWeight: 600 }}>
                    Visit {r.name} →
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
