import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, Pill } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { PageToast } from "@/components/PageToast";
import { db } from "@/lib/db/client";
import { buildPlatformSubdomainOrigin } from "@/lib/domains/storefront";
import { hasVercelDomainConfig } from "@/lib/domains/vercel";
import { getDomainSettings } from "@/lib/domains/ownership.server";
import { DomainConnect } from "./DomainConnect";

export const dynamic = "force-dynamic";

const FALLBACK_REGISTRARS = [
  {
    id: "namecheap",
    name: "Namecheap",
    description: "Popular, with fair prices and free privacy.",
    baseUrl: "https://namecheap.com",
    affiliateUrl: "https://namecheap.com",
    logoUrl: null,
  },
  {
    id: "porkbun",
    name: "Porkbun",
    description: "Low prices. Good for your first web address.",
    baseUrl: "https://porkbun.com",
    affiliateUrl: "https://porkbun.com",
    logoUrl: null,
  },
  {
    id: "whogohost",
    name: "Whogohost",
    description: "Nigerian company. Local support and you pay in Naira.",
    baseUrl: "https://whogohost.com",
    affiliateUrl: "https://whogohost.com",
    logoUrl: null,
  },
  {
    id: "smartweb",
    name: "SmartWeb",
    description: "Sells .ng web addresses. You pay in Naira.",
    baseUrl: "https://smartwebng.com",
    affiliateUrl: "https://smartwebng.com",
    logoUrl: null,
  },
  {
    id: "godaddy",
    name: "GoDaddy",
    description: "Big global company, often has discounts.",
    baseUrl: "https://godaddy.com",
    affiliateUrl: "https://godaddy.com",
    logoUrl: null,
  },
  {
    id: "cloudflare",
    name: "Cloudflare Registrar",
    description: "Sells at cost price.",
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
  const freeOrigin = buildPlatformSubdomainOrigin(store.slug);
  const freeHost = new URL(freeOrigin).host;
  const live = store.status === "active" || store.status === "published";

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Web address"
      sub="Where customers open your shop. You have a free one already, and you can use your own."
    >
      <PageToast />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,400px)]">
        <div className="grid min-w-0 content-start gap-4">
          <div className="flex flex-wrap items-center gap-3 rounded-[22px] border border-app-line bg-white p-4 sm:p-5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-app-canvas"><Icon name="globe" size={18} /></span>
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[13px] text-app-ink-soft">Your free address</p>
              <a href={freeOrigin} target="_blank" rel="noopener noreferrer" className="break-all text-[16px] font-extrabold text-app-ink no-underline hover:underline">
                {freeHost}
              </a>
            </div>
            <Pill tone={live ? "success" : "muted"} dot>{live ? "Live" : "Not published yet"}</Pill>
          </div>

          <DomainConnect
            storeSlug={store.slug}
            storeName={store.name}
            configured={hasVercelDomainConfig()}
            initialState={await getDomainSettings(user.id)}
            registrars={registrars.map(({ id, name, description, baseUrl, affiliateUrl }) => ({ id, name, description, baseUrl, affiliateUrl }))}
          />
        </div>

        <aside className="min-w-0 xl:pt-1">
          <AssistantNote who="rex">
            Not sure what to do? Choose &quot;Ask the Shopinbos team to do it&quot; and we&apos;ll set it up for you. Your free address works the whole time.
          </AssistantNote>
        </aside>
      </div>
    </SellerPage>
  );
}
