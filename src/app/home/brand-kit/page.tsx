import { BOUTIQUE_FONT_CLASS } from "@/components/storefront/boutique/fonts";
import Link from "next/link";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { Card, EmptyState, PillLink, Pill, cx } from "@/components/app-kit";
import { Icon, type IconName } from "@/components/ui/Icon";
import { BRAND_COLOURS, LINKED_TOKENS, headingFont, readStoreLook, toHex6 } from "../store/look";
import { ColourSwatches, DownloadLogoButton, UploadLogoButton, VoiceNote } from "./BrandKitControls";

export const dynamic = "force-dynamic";

// Where the brand really shows up today (checked in code): the storefront theme + logo, and the logo and
// name on printed shipping labels (/home/labels/print). The rest are listed honestly as not yet.
const USED_ON: Array<{ icon: IconName; title: string; sub: string; used: boolean; href?: string }> = [
  { icon: "store", title: "Your store", sub: "Header, buttons, product pages", used: true, href: "/home/store" },
  { icon: "tag", title: "Shipping labels", sub: "Logo and store name on every label", used: true, href: "/home/labels" },
  { icon: "play", title: "Posts and videos", sub: "Reels show your store name", used: false, href: "/home/video" },
  { icon: "megaphone", title: "Ads", sub: "Instagram, Facebook, TikTok", used: false },
  { icon: "whatsapp", title: "WhatsApp", sub: "Catalogue cover, broadcasts", used: false },
  { icon: "mail", title: "Emails", sub: "Order and delivery messages", used: false },
];

export default async function BrandKitPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  const store = workspace?.store ?? null;

  if (!store) {
    return (
      <SellerPage user={user} store={null} title="Brand kit" sub="Your logo, colours, fonts and voice.">
        <EmptyState icon="palette" title="No store yet" action={<PillLink href="/onboarding" tone="ink">Set up your store</PillLink>}>
          Your brand kit fills in once Rex has built your store.
        </EmptyState>
      </SellerPage>
    );
  }

  const settings = workspace?.settings ?? {};
  const look = readStoreLook(store);
  const tokens = look.tokens;
  const memory = settings.onboardingMemory;
  const paletteName = memory?.palette?.name;
  const voice = memory?.customerProfile?.vibe ?? "";

  const photoRows = await db.storeProduct.findMany({ where: { storeId: store.id, status: { not: "archived" } }, select: { images: true } });
  const photoCount = photoRows.reduce((sum, row) => sum + row.images.length, 0);

  const paper = toHex6(tokens?.paperBg, "#F6F5F9");
  const ink = toHex6(tokens?.ink, "#16141F");
  const accent = toHex6(tokens?.accent, "#FF6A2B");
  const font = headingFont(tokens);
  const serif = tokens?.headingStyle === "serif";
  const initial = store.name.trim().charAt(0).toUpperCase() || "S";
  const fileBase = store.slug || "logo";

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Brand kit"
      sub="Your logo, colours, fonts and voice, in one place."
      actions={
        <>
          <UploadLogoButton hasLogo={Boolean(store.logoUrl)} />
          <PillLink href="/home/brand-kit/sheet" icon="document">Brand sheet</PillLink>
          <PillLink href="/studio/logo" tone="ink" icon="sparkle">New logo with Rex</PillLink>
        </>
      }
    >
      <div className={BOUTIQUE_FONT_CLASS}>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,430px)]">
        <div className="grid min-w-0 content-start gap-5">
          <figure className="m-0">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <LogoTile background={paper} className="aspect-[16/10] sm:aspect-auto sm:h-[200px]">
                {store.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={store.logoUrl} alt={`${store.name} logo`} className="max-h-[120px] max-w-full object-contain" />
                ) : (
                  <span className="max-w-full truncate text-[34px] leading-tight" style={{ fontFamily: font, color: ink, fontWeight: serif ? 500 : 800 }}>{store.name}</span>
                )}
              </LogoTile>
              <LogoTile background={ink} className="aspect-[16/10] sm:aspect-auto sm:h-[200px]">
                {store.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={store.logoUrl} alt="" className="max-h-[90px] max-w-full rounded-[10px] bg-white/95 object-contain p-2" />
                ) : (
                  <span className="max-w-full truncate text-[20px] leading-tight" style={{ fontFamily: font, color: paper, fontWeight: serif ? 500 : 800 }}>{store.name}</span>
                )}
              </LogoTile>
              <LogoTile background="#FFFFFF" className="aspect-[16/10] border border-app-line sm:aspect-auto sm:h-[200px]">
                <span className="grid h-[76px] w-[76px] place-items-center overflow-hidden rounded-[20px] text-[36px]" style={{ background: accent, color: "#FFFFFF", fontFamily: font, fontWeight: serif ? 500 : 800 }}>
                  {store.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={store.logoUrl} alt="" className="h-full w-full bg-white object-contain p-1.5" />
                  ) : (
                    initial
                  )}
                </span>
              </LogoTile>
            </div>
            <figcaption className="mt-2 text-[13px] text-app-ink-soft">
              Main logo · on dark · app icon and profile picture{store.logoUrl ? "" : " · no logo uploaded yet, so your store shows its name"}
            </figcaption>
          </figure>

          <Card className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="m-0 text-[17px] font-extrabold">Colours{paletteName ? ` · ${paletteName}` : ""}</h2>
              <Link href="/seller/store/builder" className="text-[13.5px] font-extrabold text-app-accent-ink no-underline hover:underline">All your shop colours</Link>
            </div>
            {tokens ? (
              <ColourSwatches
                storeLive={look.live}
                linked={LINKED_TOKENS as Record<string, string[]>}
                colours={BRAND_COLOURS.map((colour) => ({ ...colour, value: toHex6(tokens[colour.key]) }))}
              />
            ) : (
              <p className="mb-0 mt-3 text-[14px] text-app-ink-soft">
                Your shop doesn&apos;t have a look yet. <Link href="/builder/templates" className="font-bold text-app-accent-ink">Choose how your shop looks</Link> and its colours show here.
              </p>
            )}
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="m-0 text-[17px] font-extrabold">Fonts</h2>
              <p className="mb-0 mt-3 text-[30px] leading-[1.1]" style={{ fontFamily: font, fontWeight: serif ? 500 : 800, letterSpacing: serif ? "-0.01em" : "-0.03em" }}>
                Headlines look like this
              </p>
              <p className="mb-0 mt-3 text-[15px] leading-[1.55]">Body text looks like this.</p>
              <p className="mb-0 mt-3 text-[13px] text-app-ink-soft">{serif ? "Serif headlines with a clean sans-serif body" : "Bold sans-serif headlines and body"} · change it in the builder&apos;s theme settings</p>
            </Card>
            <Card className="p-5">
              <h2 className="m-0 text-[17px] font-extrabold">How you sound</h2>
              <VoiceNote initial={voice} />
              <p className="mb-0 mt-3 text-[13px] text-app-ink-soft">Rex writes your store copy in this voice.</p>
            </Card>
          </div>
        </div>

        <div className="grid min-w-0 content-start gap-5">
          <Card className="p-5">
            <h2 className="m-0 text-[17px] font-extrabold">Used on</h2>
            <ul className="m-0 mt-2 list-none divide-y divide-app-line p-0">
              {USED_ON.map((place) => {
                const row = (
                  <>
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-app-canvas"><Icon name={place.icon} size={17} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-bold">{place.title}</span>
                      <span className="block truncate text-[13px] text-app-ink-soft">{place.sub}</span>
                    </span>
                    {place.used ? (
                      <span className="flex shrink-0 items-center gap-1 text-[12.5px] font-bold text-app-success"><Icon name="check" size={16} /><span className="sr-only">Uses your brand</span></span>
                    ) : (
                      <Pill>Not yet</Pill>
                    )}
                  </>
                );
                return (
                  <li key={place.title}>
                    {place.href ? (
                      <Link href={place.href} className="flex min-h-[56px] items-center gap-3 py-2 text-app-ink no-underline hover:text-app-accent-ink">{row}</Link>
                    ) : (
                      <div className="flex min-h-[56px] items-center gap-3 py-2">{row}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card className="p-5">
            <h2 className="m-0 text-[17px] font-extrabold">Files</h2>
            <ul className="m-0 mt-2 list-none divide-y divide-app-line p-0">
              <FileRow icon="image" title="Logo" sub={store.logoUrl ? "Your uploaded logo" : "Upload a logo first"}>
                {store.logoUrl ? (
                  <DownloadLogoButton url={store.logoUrl} fileName={`${fileBase}-logo`} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-app-line bg-white px-4 text-[13.5px] font-extrabold text-app-ink hover:border-app-line-strong disabled:opacity-60" />
                ) : null}
              </FileRow>
              <FileRow icon="document" title="Brand sheet" sub="Print it or save it as a PDF">
                <PillLink href="/home/brand-kit/sheet" size="sm">Open</PillLink>
              </FileRow>
              <FileRow icon="image" title="Photo library" sub={photoCount === 0 ? "No product photos yet" : `${photoCount} product ${photoCount === 1 ? "photo" : "photos"}`}>
                <PillLink href="/products" size="sm">Open</PillLink>
              </FileRow>
            </ul>
          </Card>

          <p className="m-0 text-[13px] leading-[1.5] text-app-ink-soft">Saved with your store. Change a colour or logo here and your store and labels follow.</p>
        </div>
      </div>
      </div>
    </SellerPage>
  );
}

function LogoTile({ background, className, children }: { background: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cx("grid min-w-0 place-items-center overflow-hidden rounded-[22px] p-5", className)} style={{ background }}>
      {children}
    </div>
  );
}

function FileRow({ icon, title, sub, children }: { icon: IconName; title: string; sub: string; children?: React.ReactNode }) {
  return (
    <li className="flex min-h-[60px] items-center gap-3 py-2">
      <Icon name={icon} size={18} className="shrink-0 text-app-ink-soft" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-bold">{title}</span>
        <span className="block truncate text-[13px] text-app-ink-soft">{sub}</span>
      </span>
      {children}
    </li>
  );
}
