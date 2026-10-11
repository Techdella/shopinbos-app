import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { Card, CardHead, Pill } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { DomainConnect } from "./DomainConnect";
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
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Domain"
      sub="Your store's address on the web: a free Shopinbos address, or your own domain."
    >
      <PageToast />
      <div className="grid gap-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="min-w-0 p-5">
            <CardHead title="Free Shopinbos address" action={<Pill tone="success" dot>Always on</Pill>} />
            <div className="mt-3 break-all text-[20px] font-extrabold tracking-[-0.3px]">{store.slug}.shopinbos.com</div>
            <p className="mb-0 mt-1.5 text-[13.5px] text-app-ink-soft">This address always works, even after you connect your own domain.</p>
          </Card>
          <Card className="min-w-0 p-5">
            <CardHead title="Your own domain" action={<Pill tone={store.customDomain ? "success" : "muted"} dot>{store.customDomain ? "Connected" : "Not connected"}</Pill>} />
            {store.customDomain ? (
              <>
                <div className="mt-3 break-all text-[20px] font-extrabold tracking-[-0.3px]">{store.customDomain}</div>
                <p className="mb-0 mt-1.5 text-[13.5px] text-app-ink-soft">
                  Your store is live at{" "}
                  <a href={`https://${store.customDomain}`} target="_blank" rel="noopener noreferrer" className="font-bold text-app-accent-ink">
                    https://{store.customDomain}
                  </a>
                </p>
              </>
            ) : (
              <p className="mb-0 mt-3 text-[13.5px] text-app-ink-soft">Connect a domain you own below, like yourbrand.com.ng.</p>
            )}
          </Card>
        </div>

        <Card className="min-w-0 p-5">
          <CardHead title="Connect a domain" sub="Add your domain, then copy the records into your registrar." />
          <div className="mt-4 min-w-0 overflow-x-auto">
            <DomainConnect storeSlug={store.slug} storeName={store.name} />
          </div>
        </Card>

        <section className="grid gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 className="m-0 text-[20px] font-extrabold">Buy a domain</h2>
              <p className="mb-0 mt-1 text-[14px] text-app-ink-soft">No domain yet? Buy one from a registrar below, then connect it above.</p>
            </div>
            <Pill tone="info">Buying on Shopinbos is coming soon</Pill>
          </div>
          <Notice tone="info">We&apos;re building domain buying into Shopinbos. Until then, these registrars are a good place to start.</Notice>
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {registrars.map((r) => (
              <li key={r.id} className="min-w-0">
                <a
                  href={r.affiliateUrl ?? r.baseUrl}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className="flex h-full flex-col gap-2 rounded-[22px] border border-app-line bg-white p-5 text-app-ink no-underline transition hover:border-app-line-strong"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[15px] font-extrabold">{r.name}</span>
                    <Icon name="link" size={14} className="shrink-0 text-app-ink-soft" />
                  </span>
                  <span className="flex-1 text-[13.5px] leading-[1.5] text-app-ink-soft">{r.description}</span>
                  <span className="text-[13.5px] font-extrabold text-app-accent-ink">Visit {r.name} →</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </SellerPage>
  );
}
