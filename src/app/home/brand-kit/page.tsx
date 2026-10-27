import { BOUTIQUE_FONT_CLASS } from "@/components/storefront/boutique/fonts";
import { BrandAssetsPanel } from "./BrandAssets";
import { LogoDisplayPanel } from "./LogoDisplay";
import { readLogoDisplay } from "@shared/store-logo";
import { readBrandAssets } from "@shared/brand-assets";
import { readBrandBook } from "@shared/brand-book";
import Link from "next/link";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { Card, EmptyState, MoreActions, PillLink, Pill, cx } from "@/components/app-kit";
import { Icon, type IconName } from "@/components/ui/Icon";
import { BRAND_COLOURS, LINKED_TOKENS, headingFont, readStoreLook, toHex6 } from "../store/look";
import { ColourSwatches, DownloadLogoButton, UploadLogoButton, VoiceNote } from "./BrandKitControls";
import { getT } from "@/lib/i18n/server";
import { PageTip } from "@/components/learn/PageTip";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT("store");
  return { title: t("bk.title") };
}

// Where the brand really shows up today (checked in code): the storefront theme + logo, and the logo and
// name on printed shipping labels (/home/labels/print). The rest are listed honestly as not yet.
const USED_ON: Array<{ icon: IconName; key: "store" | "labels" | "video" | "ads" | "whatsapp" | "emails"; used: boolean; href?: string }> = [
  { icon: "store", key: "store", used: true, href: "/home/store" },
  { icon: "tag", key: "labels", used: true, href: "/home/labels" },
  { icon: "play", key: "video", used: false, href: "/home/video" },
  { icon: "megaphone", key: "ads", used: false },
  { icon: "whatsapp", key: "whatsapp", used: false },
  { icon: "mail", key: "emails", used: false },
];

export default async function BrandKitPage() {
  const user = await requireRole(["seller"], "/login");
  const tipT = await getT("tips");
  const t = await getT("store", "common");
  const workspace = await getSellerWorkspace(user.id);
  const store = workspace?.store ?? null;

  if (!store) {
    return (
      <SellerPage user={user} store={null} title={t("bk.title")} sub={t("bk.subEmpty")}>
        <EmptyState icon="palette" title={t("bk.noStore")} action={<PillLink href="/onboarding" tone="ink">{t("bk.setUp")}</PillLink>}>
          {t("bk.noStoreSub")}
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
  const hasBook = Boolean(readBrandBook((store.brandSettings as Record<string, unknown> | null)?.styleBook));

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("bk.title")}
      sub={t("bk.sub")}
      actions={
        <>
          <UploadLogoButton hasLogo={Boolean(store.logoUrl)} />
          {/* Phones: these fold into a "⋯" menu so the header stays one row (sheet and book are also linked below). */}
          <MoreActions>
            <PillLink href="/home/brand-kit/sheet" icon="document">{t("bk.sheet")}</PillLink>
            <PillLink href="/home/brand-kit/book" icon="book">{t("ba.bookTitle")}</PillLink>
            <PillLink href="/studio/logo" tone="ink" icon="sparkle">{t("bk.newLogo")}</PillLink>
          </MoreActions>
        </>
      }
    >
      <PageTip className="mb-5">{tipT("brandKit")}</PageTip>
      <div className={BOUTIQUE_FONT_CLASS}>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,430px)]">
        <div className="grid min-w-0 content-start gap-5">
          <figure className="m-0">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <LogoTile background={paper} className="col-span-2 aspect-[16/10] sm:col-span-1 sm:aspect-auto sm:h-[200px]">
                {store.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={store.logoUrl} alt={t("bk.logoAlt", { name: store.name })} className="max-h-[120px] max-w-full object-contain" />
                ) : (
                  <span className="max-w-full truncate text-[34px] leading-tight" style={{ fontFamily: font, color: ink, fontWeight: serif ? 500 : 800 }}>{store.name}</span>
                )}
              </LogoTile>
              <LogoTile background={ink} className="aspect-square sm:aspect-auto sm:h-[200px]">
                {store.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={store.logoUrl} alt="" className="max-h-[90px] max-w-full rounded-[10px] bg-white/95 object-contain p-2" />
                ) : (
                  <span className="max-w-full truncate text-[20px] leading-tight" style={{ fontFamily: font, color: paper, fontWeight: serif ? 500 : 800 }}>{store.name}</span>
                )}
              </LogoTile>
              <LogoTile background="#FFFFFF" className="aspect-square border border-app-line sm:aspect-auto sm:h-[200px]">
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
              {t("bk.caption")}{store.logoUrl ? "" : ` · ${t("bk.captionNoLogo")}`}
            </figcaption>
          </figure>

          <BrandAssetsPanel initial={readBrandAssets(store)} storeName={store.name} accent={accent} fileBase={fileBase} />

          <LogoDisplayPanel initial={readLogoDisplay(store.brandSettings)} logoUrl={store.logoUrl} brandSettings={store.brandSettings} storeName={store.name} />

          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="m-0 text-[17px] font-extrabold">{t("ba.bookTitle")}</h2>
                <p className="m-0 mt-1 text-[13.5px] leading-[1.5] text-app-ink-soft">{hasBook ? t("ba.bookReady") : t("ba.bookEmpty")}</p>
              </div>
              <PillLink href="/home/brand-kit/book" tone="ink" icon={hasBook ? "document" : "sparkle"}>{hasBook ? t("ba.bookOpen") : t("ba.bookMake")}</PillLink>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="m-0 text-[17px] font-extrabold">{t("bk.colours")}{paletteName ? ` · ${paletteName}` : ""}</h2>
              <Link href="/seller/store/builder" className="text-[13.5px] font-extrabold text-app-accent-ink no-underline hover:underline">{t("bk.allColours")}</Link>
            </div>
            {tokens ? (
              <ColourSwatches
                storeLive={look.live}
                linked={LINKED_TOKENS as Record<string, string[]>}
                colours={BRAND_COLOURS.map((colour) => ({ ...colour, label: t(`colour.${colour.key}.label`), hint: t(`colour.${colour.key}.hint`), value: toHex6(tokens[colour.key]) }))}
              />
            ) : (
              <p className="mb-0 mt-3 text-[14px] text-app-ink-soft">
                {t("bk.noTheme")} <Link href="/builder/templates" className="font-bold text-app-accent-ink">{t("bk.pickTemplate")}</Link> {t("bk.coloursShow")}
              </p>
            )}
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="m-0 text-[17px] font-extrabold">{t("bk.fonts")}</h2>
              <p className="mb-0 mt-3 text-[30px] leading-[1.1]" style={{ fontFamily: font, fontWeight: serif ? 500 : 800, letterSpacing: serif ? "-0.01em" : "-0.03em" }}>
                {t("bk.headlines")}
              </p>
              <p className="mb-0 mt-3 text-[15px] leading-[1.55]">{t("bk.body")}</p>
              <p className="mb-0 mt-3 text-[13px] text-app-ink-soft">{serif ? t("bk.serifLine") : t("bk.sansLine")} · {t("bk.changeFonts")}</p>
            </Card>
            <Card className="p-5">
              <h2 className="m-0 text-[17px] font-extrabold">{t("bk.voice")}</h2>
              <VoiceNote initial={voice} />
              <p className="mb-0 mt-3 text-[13px] text-app-ink-soft">{t("bk.voiceNote")}</p>
            </Card>
          </div>
        </div>

        <div className="grid min-w-0 content-start gap-5">
          <Card className="p-5">
            <h2 className="m-0 text-[17px] font-extrabold">{t("bk.usedOn")}</h2>
            <ul className="m-0 mt-2 list-none divide-y divide-app-line p-0">
              {USED_ON.map((place) => {
                const row = (
                  <>
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-app-canvas"><Icon name={place.icon} size={17} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-bold">{t(`used.${place.key}.title`)}</span>
                      <span className="block text-[13px] text-app-ink-soft sm:truncate">{t(`used.${place.key}.sub`)}</span>
                    </span>
                    {place.used ? (
                      <span className="flex shrink-0 items-center gap-1 text-[12.5px] font-bold text-app-success"><Icon name="check" size={16} /><span className="sr-only">{t("bk.usesBrand")}</span></span>
                    ) : (
                      <Pill>{t("bk.notYet")}</Pill>
                    )}
                  </>
                );
                return (
                  <li key={place.key}>
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
            <h2 className="m-0 text-[17px] font-extrabold">{t("bk.files")}</h2>
            <ul className="m-0 mt-2 list-none divide-y divide-app-line p-0">
              <FileRow icon="image" title={t("bk.logo")} sub={store.logoUrl ? t("bk.uploadedLogo") : t("bk.uploadFirst")}>
                {store.logoUrl ? (
                  <DownloadLogoButton url={store.logoUrl} fileName={`${fileBase}-logo`} label={t("bk.download")} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-app-line bg-white px-4 text-[13.5px] font-extrabold text-app-ink hover:border-app-line-strong disabled:opacity-60" />
                ) : null}
              </FileRow>
              <FileRow icon="document" title={t("ba.bookTitle")} sub={hasBook ? t("bk.printPdf") : t("ba.bookShort")}>
                <PillLink href="/home/brand-kit/book" size="sm">{t("bk.open")}</PillLink>
              </FileRow>
              <FileRow icon="tag" title={t("ba.printTitle")} sub={t("ba.printSub")}>
                <PillLink href="/home/labels/studio" size="sm">{t("bk.open")}</PillLink>
              </FileRow>
              <FileRow icon="document" title={t("bk.sheet")} sub={t("bk.printPdf")}>
                <PillLink href="/home/brand-kit/sheet" size="sm">{t("bk.open")}</PillLink>
              </FileRow>
              <FileRow icon="image" title={t("bk.photos")} sub={photoCount === 0 ? t("bk.noPhotos") : t("bk.photoCount", { count: photoCount })}>
                <PillLink href="/products" size="sm">{t("bk.open")}</PillLink>
              </FileRow>
            </ul>
          </Card>

          <p className="m-0 text-[13px] leading-[1.5] text-app-ink-soft">{t("bk.savedNote")}</p>
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
        <span className="block text-[13px] text-app-ink-soft sm:truncate">{sub}</span>
      </span>
      {children}
    </li>
  );
}
