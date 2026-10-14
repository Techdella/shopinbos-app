import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { parseBrandSettings } from "@/lib/workspace";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { BRAND_COLOURS, headingFont, readStoreLook, toHex6 } from "../../store/look";
import { PrintSheetButton } from "./PrintSheetButton";
import { getT } from "@/lib/i18n/server";

// One-page brand sheet for printers and designers: logo, colours with hex, fonts, voice and web address.
// No app shell, so it prints (or saves as PDF) cleanly on A4 or Letter.

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("store");
  return { title: t("sheet.title") };
}

export default async function BrandSheetPage() {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("store");
  const store = await db.store.findUnique({
    where: { userId: user.id },
    select: { name: true, slug: true, description: true, logoUrl: true, status: true, customDomain: true, brandSettings: true },
  });
  if (!store) redirect("/onboarding?role=seller");

  const look = readStoreLook(store);
  const settings = parseBrandSettings(store.brandSettings);
  const tokens = look.tokens;
  const font = headingFont(tokens);
  const serif = tokens?.headingStyle === "serif";
  const voice = settings.onboardingMemory?.customerProfile?.vibe;
  const host = new URL(buildStorefrontUrl({ slug: store.slug, customDomain: store.customDomain })).host;
  const colours = tokens
    ? [
        ...BRAND_COLOURS.map((colour) => ({ label: t(`colour.${colour.key}.label`), hint: t(`colour.${colour.key}.hint`), value: toHex6(tokens[colour.key]) })),
        { label: t("sheet.buttons"), hint: t("sheet.buttonsHint"), value: toHex6(tokens.ctaBg) },
        { label: t("sheet.banner"), hint: t("sheet.bannerHint"), value: toHex6(tokens.heroBg) },
      ]
    : [];

  return (
    <div className="min-h-dvh bg-app-canvas font-app text-app-ink print:bg-white">
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print { .no-print { display: none !important; } .sheet { box-shadow: none !important; border: 0 !important; } }
      `}</style>

      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-app-line bg-white px-4 py-3 sm:px-6">
        <Link href="/home/brand-kit" className="text-[14px] font-extrabold text-app-ink no-underline">{t("sheet.back")}</Link>
        <PrintSheetButton label={t("sheet.print")} />
      </div>

      <div className="px-4 py-6 sm:px-6 print:p-0">
        <article className="sheet mx-auto w-full max-w-[210mm] rounded-[22px] border border-app-line bg-white p-6 sm:p-10 print:rounded-none print:p-0">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-app-line pb-5">
            <div className="min-w-0">
              <p className="m-0 text-[13px] text-app-ink-soft">{t("sheet.title")}</p>
              <h1 className="m-0 mt-1 break-words text-[30px] leading-tight" style={{ fontFamily: font, fontWeight: serif ? 500 : 800 }}>{store.name}</h1>
              <p className="m-0 mt-1 text-[13.5px] text-app-ink-soft">{host}</p>
            </div>
            {store.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={store.logoUrl} alt={t("bk.logoAlt", { name: store.name })} className="h-[72px] w-[72px] shrink-0 rounded-[16px] border border-app-line bg-white object-cover" />
            )}
          </header>

          <section className="mt-6">
            <h2 className="m-0 text-[16px] font-extrabold">{t("bk.logo")}</h2>
            {store.logoUrl ? (
              <div className="mt-3 grid grid-cols-3 gap-3">
                {/* Fixed-size tiles that clip: an uploaded photo of any shape stays inside its tile. */}
                {[
                  { label: t("sheet.onLight"), bg: tokens?.paperBg ?? "#FFFFFF", border: true, round: false },
                  { label: t("sheet.onDark"), bg: tokens?.ink ?? "#16141F", border: false, round: false },
                  { label: t("sheet.appIcon"), bg: tokens?.accent ?? "#FF6A2B", border: false, round: true },
                ].map((tile) => (
                  <figure key={tile.label} className="m-0" style={{ breakInside: "avoid" }}>
                    <div
                      className={`relative h-[120px] overflow-hidden rounded-[14px] ${tile.border ? "border border-app-line" : ""}`}
                      style={{ background: tile.bg, printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={store.logoUrl ?? undefined}
                        alt=""
                        className={tile.round
                          ? "absolute left-1/2 top-1/2 h-[72px] w-[72px] -translate-x-1/2 -translate-y-1/2 rounded-[18px] bg-white object-cover"
                          : "absolute inset-0 m-auto h-[84px] w-[84%] object-contain"}
                      />
                    </div>
                    <figcaption className="mt-1.5 text-[12px] text-app-ink-soft">{tile.label}</figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">{t("sheet.noLogo")}</p>
            )}
          </section>

          <section className="mt-6">
            <h2 className="m-0 text-[16px] font-extrabold">{t("bk.colours")}</h2>
            {colours.length ? (
              <ul className="m-0 mt-3 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3">
                {colours.map((colour) => (
                  <li key={colour.label} className="min-w-0 overflow-hidden rounded-[14px] border border-app-line" style={{ breakInside: "avoid" }}>
                    <div className="h-[72px] border-b border-app-line" style={{ background: colour.value, printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }} />
                    <div className="px-3 py-2.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[13.5px] font-bold">{colour.label}</span>
                        <span className="font-mono text-[11.5px] uppercase text-app-ink-soft">{colour.value}</span>
                      </div>
                      <div className="mt-0.5 text-[12px] text-app-ink-soft">{colour.hint}</div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">{t("sheet.noColours")}</p>
            )}
          </section>

          <section className="mt-6 grid gap-6 sm:grid-cols-2">
            <div>
              <h2 className="m-0 text-[16px] font-extrabold">{t("bk.fonts")}</h2>
              <p className="mb-0 mt-2 text-[24px] leading-tight" style={{ fontFamily: font, fontWeight: serif ? 500 : 800 }}>{t("bk.headlines")}</p>
              <p className="mb-0 mt-1 text-[14px]">{t("bk.body")}</p>
              <p className="mb-0 mt-1 text-[12.5px] text-app-ink-soft">{serif ? t("sheet.serif") : t("sheet.sans")}</p>
            </div>
            <div>
              <h2 className="m-0 text-[16px] font-extrabold">{t("sheet.howWeSound")}</h2>
              <p className="mb-0 mt-2 text-[14px] leading-[1.55]">{voice || t("sheet.notWritten")}</p>
            </div>
          </section>

          {store.description && (
            <section className="mt-6">
              <h2 className="m-0 text-[16px] font-extrabold">{t("sheet.about")}</h2>
              <p className="mb-0 mt-2 text-[14px] leading-[1.55]">{store.description}</p>
            </section>
          )}
        </article>
      </div>
    </div>
  );
}
