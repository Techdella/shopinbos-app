import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { getT } from "@/lib/i18n/server";
import { readBrandAssets } from "@shared/brand-assets";
import { readBrandBook, readableOn } from "@shared/brand-book";
import { BookActions } from "./BookActions";

// The brand style book (Brand kit > Style book): what Rex wrote for the store, laid out to print on A4 or save as a
// PDF for designers and printers. Colours, type, voice, logo and photo rules, do's and don'ts.

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("store");
  return { title: t("book.title") };
}

export default async function BrandBookPage() {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("store");
  const store = await db.store.findUnique({
    where: { userId: user.id },
    select: { name: true, slug: true, customDomain: true, logoUrl: true, brandSettings: true },
  });
  if (!store) redirect("/onboarding?role=seller");
  const settings = (store.brandSettings && typeof store.brandSettings === "object" ? store.brandSettings : {}) as Record<string, unknown>;
  const book = readBrandBook(settings.styleBook);
  const assets = readBrandAssets(store);
  const host = buildStorefrontUrl({ slug: store.slug, customDomain: store.customDomain }).replace(/^https?:\/\//, "").replace(/\/$/, "");
  const colourRows = book
    ? ([
        ["primary", book.colours.primary],
        ["secondary", book.colours.secondary],
        ["accent", book.colours.accent],
        ["background", book.colours.background],
        ["surface", book.colours.surface],
        ["text", book.colours.text],
      ] as const)
    : [];
  const fontLink = book
    ? `https://fonts.googleapis.com/css2?family=${encodeURIComponent(book.typography.headings)}:wght@500;700&family=${encodeURIComponent(book.typography.body)}:wght@400;600&display=swap`
    : null;

  return (
    <div className="min-h-dvh bg-app-canvas font-app text-app-ink print:bg-white">
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      {fontLink ? <link rel="stylesheet" href={fontLink} /> : null}
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print { .no-print { display: none !important; } .sheet { box-shadow: none !important; border: 0 !important; } .page-break { break-before: page; } }
      `}</style>

      <div className="no-print sticky top-0 z-10 border-b border-app-line bg-white px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-3">
          <Link href="/home/brand-kit" className="text-[14px] font-extrabold text-app-ink no-underline">{t("sheet.back")}</Link>
          <BookActions hasBook={Boolean(book)} colours={book?.colours ?? null} headingStyle={book?.typography.style ?? null} />
        </div>
      </div>

      <div className="px-4 py-6 sm:px-6 print:p-0">
        {!book ? (
          <article className="mx-auto w-full max-w-[210mm] rounded-[22px] border border-dashed border-app-line-strong bg-white p-10 text-center">
            <h1 className="m-0 text-[24px] font-extrabold">{t("book.emptyTitle")}</h1>
            <p className="mx-auto mb-0 mt-2 max-w-[460px] text-[14.5px] leading-[1.55] text-app-ink-soft">{t("book.emptyBody")}</p>
          </article>
        ) : (
          <article className="sheet mx-auto w-full max-w-[210mm] rounded-[22px] border border-app-line bg-white p-6 sm:p-10 print:rounded-none print:p-0" style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
            <header className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] p-6" style={{ background: book.colours.secondary, color: readableOn(book.colours.secondary) }}>
              <div className="min-w-0">
                <p className="m-0 text-[12px] font-bold uppercase tracking-[0.16em] opacity-80">{t("book.title")}</p>
                <h1 className="m-0 mt-1 break-words text-[34px] leading-tight" style={{ fontFamily: `'${book.typography.headings}', serif`, fontWeight: 700 }}>{store.name}</h1>
                <p className="m-0 mt-1 text-[15px] opacity-90">{book.tagline}</p>
                <p className="m-0 mt-1 text-[12.5px] opacity-75">{host}</p>
              </div>
              {assets.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={assets.logo} alt="" className="h-[84px] w-[84px] shrink-0 rounded-[18px] bg-white object-contain p-2" />
              ) : null}
            </header>

            <Section title={t("book.mission")}>
              <p className="m-0 text-[15px] leading-[1.6]">{book.mission}</p>
            </Section>

            <Section title={t("book.marks")}>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: t("ba.logo"), url: assets.logo, bg: book.colours.background },
                  { label: t("ba.icon"), url: assets.shown.icon, bg: book.colours.primary },
                  { label: t("ba.favicon"), url: assets.shown.favicon, bg: "#FFFFFF" },
                ].map((mark) => (
                  <figure key={mark.label} className="m-0">
                    <div className="grid h-[110px] place-items-center overflow-hidden rounded-[14px] border border-app-line" style={{ background: mark.bg }}>
                      {mark.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={mark.url} alt="" className="max-h-[80px] max-w-[85%] rounded-[10px] object-contain" />
                      ) : (
                        <span className="text-[12px] text-app-ink-soft">{t("ba.none")}</span>
                      )}
                    </div>
                    <figcaption className="mt-1.5 text-[12.5px] font-bold">{mark.label}</figcaption>
                  </figure>
                ))}
              </div>
              <List items={book.logoRules} />
            </Section>

            <Section title={`${t("book.colours")} · ${book.paletteName}`}>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                {colourRows.map(([key, value]) => (
                  <div key={key}>
                    <div className="h-[64px] rounded-[12px] border border-app-line" style={{ background: value }} />
                    <p className="m-0 mt-1.5 text-[12.5px] font-bold">{t(`book.colour.${key}`)}</p>
                    <p className="m-0 font-mono text-[12px] text-app-ink-soft">{value.toUpperCase()}</p>
                  </div>
                ))}
              </div>
              <List items={book.colourNotes} />
            </Section>

            <Section title={t("book.type")}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="m-0 text-[12px] font-bold uppercase tracking-[0.12em] text-app-ink-soft">{t("book.headings")} · {book.typography.headings}</p>
                  <p className="m-0 mt-1 text-[30px] leading-tight" style={{ fontFamily: `'${book.typography.headings}', serif`, fontWeight: 700 }}>{book.tagline}</p>
                </div>
                <div>
                  <p className="m-0 text-[12px] font-bold uppercase tracking-[0.12em] text-app-ink-soft">{t("book.bodyFont")} · {book.typography.body}</p>
                  <p className="m-0 mt-1 text-[15px] leading-[1.6]" style={{ fontFamily: `'${book.typography.body}', sans-serif` }}>{book.mission}</p>
                </div>
              </div>
              <p className="m-0 mt-3 text-[13.5px] text-app-ink-soft">{book.typography.note}</p>
            </Section>

            <Section title={t("book.voice")} breakBefore>
              <p className="m-0 text-[15px] leading-[1.6]">{book.voice.summary}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {book.voice.traits.map((trait) => <span key={trait} className="rounded-full px-3 py-1 text-[13px] font-bold" style={{ background: book.colours.surface, border: `1px solid ${book.colours.primary}` }}>{trait}</span>)}
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="m-0 text-[13px] font-extrabold">{t("book.wordsUse")}</p>
                  <List items={book.voice.wordsWeUse} />
                </div>
                <div>
                  <p className="m-0 text-[13px] font-extrabold">{t("book.wordsAvoid")}</p>
                  <List items={book.voice.wordsWeAvoid} />
                </div>
              </div>
              <blockquote className="m-0 mt-4 rounded-[14px] p-4 text-[14.5px] italic leading-[1.6]" style={{ background: book.colours.surface, borderLeft: `4px solid ${book.colours.primary}` }}>{book.voice.sampleCaption}</blockquote>
            </Section>

            <Section title={t("book.photos")}>
              <List items={book.photoStyle} />
            </Section>

            <Section title={t("book.dosDonts")}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[14px] border-2 border-app-success p-4">
                  <p className="m-0 text-[13px] font-extrabold text-app-success">{t("book.do")}</p>
                  <List items={book.dos} />
                </div>
                <div className="rounded-[14px] border-2 border-app-danger p-4">
                  <p className="m-0 text-[13px] font-extrabold text-app-danger">{t("book.dont")}</p>
                  <List items={book.donts} />
                </div>
              </div>
            </Section>

            <p className="m-0 mt-8 border-t border-app-line pt-4 text-[12px] text-app-ink-soft">
              {store.name} · {host}{book.updatedAt ? ` · ${new Date(book.updatedAt).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })}` : ""}
            </p>
          </article>
        )}
      </div>
    </div>
  );
}

function Section({ title, children, breakBefore = false }: { title: string; children: React.ReactNode; breakBefore?: boolean }) {
  return (
    <section className={breakBefore ? "page-break mt-8" : "mt-8"}>
      <h2 className="m-0 mb-3 text-[17px] font-extrabold">{title}</h2>
      {children}
    </section>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="m-0 mt-3 grid list-disc gap-1.5 pl-5 text-[14px] leading-[1.55]">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}
