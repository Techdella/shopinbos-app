import { BOUTIQUE_FONT_CLASS } from "@/components/storefront/boutique/fonts";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { parseBrandSettings } from "@/lib/workspace";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { THEME_LIBRARY } from "@/lib/store-templates";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { Card, EmptyState, PillLink, cx } from "@/components/app-kit";
import { Icon, type IconName } from "@/components/ui/Icon";
import { StorePreviewCard } from "./StorePreviewCard";
import { ShareStoreButton } from "./ShareStoreButton";
import { REBRAND_PROMPT, contentSectionCount, hasPage, headingFont, readStoreLook } from "./look";

export const dynamic = "force-dynamic";

export default async function YourStorePage() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      logoUrl: true,
      city: true,
      country: true,
      currency: true,
      status: true,
      customDomain: true,
      brandSettings: true,
    },
  });
  if (!store) redirect("/onboarding?role=seller");

  const [products, pages] = await Promise.all([
    db.storeProduct.findMany({
      where: { storeId: store.id, status: "published" },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        name: true,
        description: true,
        images: true,
        retailPrice: true,
        compareAtPrice: true,
        currency: true,
        category: { select: { id: true, name: true, slug: true } },
      },
    }),
    db.storePage.findMany({
      where: { storeId: store.id, archivedAt: null },
      orderBy: { order: "asc" },
      select: { id: true, type: true, title: true, isPublished: true },
    }),
  ]);

  const look = readStoreLook(store);
  const settings = parseBrandSettings(store.brandSettings);
  const legal = settings.legal && typeof settings.legal === "object" ? (settings.legal as Record<string, unknown>) : {};
  const hasDeliveryText = ["shippingPolicy", "returnPolicy"].some((key) => typeof legal[key] === "string" && (legal[key] as string).trim());

  const storeUrl = buildStorefrontUrl({ slug: store.slug, customDomain: store.customDomain });
  const host = new URL(storeUrl).host;
  const tokens = look.tokens;
  const sub = [host, look.themeName ? `${look.themeName} template` : null, look.live ? "live" : "draft"].filter(Boolean).join(" · ");

  const homeSections = contentSectionCount(look.snapshot, "home");
  const pageRow = (type: string) => pages.find((page) => page.type === type) ?? null;
  const writtenPage = (type: string, title: string): PageItem => {
    const row = pageRow(type);
    const inStore = hasPage(look.snapshot, type) || Boolean(row);
    return {
      title,
      status: inStore ? (row?.isPublished ? "Live" : look.live && hasPage(look.snapshot, type) ? "Live" : "Draft") : "Not written yet",
      href: row ? `/home/pages/${row.id}` : `/studio?prompt=${encodeURIComponent(`Write my ${title} page.`)}`,
    };
  };

  const pageItems: Array<PageItem & { icon: IconName }> = [
    {
      icon: "home",
      title: "Home",
      status: homeSections === null ? "Not built yet" : `${homeSections} ${homeSections === 1 ? "section" : "sections"}`,
      href: "/seller/store/builder",
    },
    { icon: "document", ...writtenPage("about", "About us") },
    { icon: "truck", title: "Delivery and returns", status: hasDeliveryText ? "From your settings" : "Not written yet", href: "/home/legal" },
    { icon: "info", ...writtenPage("faq", "Questions") },
  ];

  const colourDots = tokens ? [tokens.paperBg, tokens.ink, tokens.accent] : [];

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Your store"
      sub={sub}
      actions={
        <>
          <a
            href={storeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-app-line bg-white px-5 text-[14px] font-extrabold text-app-ink no-underline transition hover:border-app-line-strong"
          >
            <Icon name="eye" size={16} /> View store
          </a>
          <ShareStoreButton url={storeUrl} storeName={store.name} />
        </>
      }
    >
      <div className={BOUTIQUE_FONT_CLASS}>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,430px)]">
        <div className="grid min-w-0 content-start gap-4">
          {look.snapshot ? (
            <div className="grid gap-2">
              <StorePreviewCard
                store={{
                  id: store.id,
                  name: store.name,
                  slug: store.slug,
                  description: store.description,
                  logoUrl: store.logoUrl,
                  city: store.city,
                  country: store.country,
                  currency: store.currency,
                  storeProducts: products,
                }}
                snapshot={look.snapshot}
                href={storeUrl}
                label={`Open ${store.name} in a new tab`}
              />
              {look.source !== "published" && (
                <p className="m-0 text-[13px] text-app-ink-soft">
                  {look.source === "draft" ? "This is your draft. Shoppers see it once you publish." : "This is your template before any changes. Build it with Rex or the builder."}
                </p>
              )}
            </div>
          ) : (
            <EmptyState icon="store" title="Your store isn't built yet" action={<PillLink href="/builder" tone="ink" icon="sparkle">Build it with Rex</PillLink>}>
              Tell Rex what you sell and he builds your home page, product pages and payment page. You can change everything after.
            </EmptyState>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <ActionCard href="/studio" tone="dark" icon="chat" title="Rex Studio" sub="Build and change your store by chatting" />
            <ActionCard href={`/studio?prompt=${encodeURIComponent(REBRAND_PROMPT)}`} tone="mint" icon="sparkle" title="Rebrand with Rex" sub="New logo, colours, homepage" />
            <ActionCard href="/seller/store/builder" tone="white" icon="monitor" title="Edit your store" sub="Pages, words and colours" />
          </div>
        </div>

        <div className="grid min-w-0 content-start gap-4">
          <Link href="/home/brand-kit" className="block rounded-[22px] border border-app-line bg-white p-5 text-app-ink no-underline transition hover:border-app-line-strong">
            <span className="flex items-center justify-between gap-2">
              <span className="text-[17px] font-extrabold">Brand kit</span>
              <Icon name="chevRight" size={18} className="text-app-ink-soft" />
            </span>
            <span className="mt-3 flex min-h-[62px] items-center justify-between gap-3 rounded-[16px] px-4 py-3" style={{ background: tokens?.paperBg ?? "#F6F5F9" }}>
              <span className="flex min-w-0 items-center gap-2.5">
                {store.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={store.logoUrl} alt="" className="h-8 w-8 shrink-0 rounded-[8px] object-contain" />
                )}
                <span className="truncate text-[21px] leading-tight" style={{ fontFamily: headingFont(tokens), color: tokens?.ink ?? "#16141F", fontWeight: tokens?.headingStyle === "serif" ? 500 : 800 }}>
                  {store.name}
                </span>
              </span>
              {colourDots.length > 0 && (
                <span className="flex shrink-0 gap-1.5" aria-label="Brand colours">
                  {colourDots.map((colour, index) => (
                    <span key={`${colour}-${index}`} className="h-6 w-6 rounded-full" style={{ background: colour, boxShadow: "inset 0 0 0 1px rgba(22,20,31,0.1)" }} />
                  ))}
                </span>
              )}
            </span>
            <span className="mt-3 block text-[13.5px] text-app-ink-soft">Used on your store and shipping labels.</span>
          </Link>

          <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
            <TileLink href="/builder/templates" icon="grid" title="How your shop looks" sub={look.themeName ? `${look.themeName} · ${THEME_LIBRARY.length} looks` : `${THEME_LIBRARY.length} looks to choose from`} />
            <TileLink href="/home/domain" icon="globe" title="Web address" sub={host} />
          </div>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="m-0 text-[17px] font-extrabold">Pages</h2>
              <Link href="/home/pages" className="text-[13.5px] font-extrabold text-app-accent-ink no-underline hover:underline">All pages</Link>
            </div>
            <ul className="m-0 mt-2 list-none divide-y divide-app-line p-0">
              {pageItems.map((page) => (
                <li key={page.title}>
                  <Link href={page.href} className="flex min-h-[52px] items-center gap-3 py-2 text-app-ink no-underline hover:text-app-accent-ink">
                    <Icon name={page.icon} size={18} className="shrink-0 text-app-ink-soft" />
                    <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{page.title}</span>
                    <span className={cx("shrink-0 text-[13px]", page.status === "Not written yet" || page.status === "Not built yet" ? "text-app-accent-ink" : "text-app-ink-soft")}>{page.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
      </div>
    </SellerPage>
  );
}

type PageItem = { title: string; status: string; href: string };

const ACTION_TONE = {
  dark: { card: "bg-app-ink text-white border-transparent hover:bg-black", icon: "bg-white/10 text-white", sub: "text-white/75" },
  mint: { card: "bg-app-mint text-app-ink border-transparent hover:brightness-[0.98]", icon: "bg-white text-app-forest", sub: "text-app-ink-soft" },
  white: { card: "bg-white text-app-ink border-app-line hover:border-app-line-strong", icon: "border border-app-line bg-white text-app-ink", sub: "text-app-ink-soft" },
} as const;

function ActionCard({ href, tone, icon, title, sub }: { href: string; tone: keyof typeof ACTION_TONE; icon: IconName; title: string; sub: string }) {
  const style = ACTION_TONE[tone];
  return (
    <Link href={href} className={cx("flex min-h-[140px] flex-col rounded-[22px] border p-4 no-underline transition", style.card)}>
      <span className={cx("grid h-10 w-10 place-items-center rounded-[12px]", style.icon)}>
        <Icon name={icon} size={18} />
      </span>
      <span className="mt-auto pt-4 text-[16px] font-extrabold">{title}</span>
      <span className={cx("mt-1 text-[13.5px] leading-[1.4]", style.sub)}>{sub}</span>
    </Link>
  );
}

function TileLink({ href, icon, title, sub }: { href: string; icon: IconName; title: string; sub: ReactNode }) {
  return (
    <Link href={href} className="flex min-w-0 flex-col rounded-[22px] border border-app-line bg-white p-4 text-app-ink no-underline transition hover:border-app-line-strong">
      <span className="grid h-10 w-10 place-items-center rounded-[12px] border border-app-line"><Icon name={icon} size={18} /></span>
      <span className="mt-3 text-[16px] font-extrabold">{title}</span>
      <span className="mt-0.5 truncate text-[13px] text-app-ink-soft">{sub}</span>
    </Link>
  );
}
