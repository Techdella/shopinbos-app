import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { parseBrandSettings } from "@/lib/workspace";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { BRAND_COLOURS, headingFont, readStoreLook, toHex6 } from "../../store/look";
import { PrintSheetButton } from "./PrintSheetButton";

// One-page brand sheet for printers and designers: logo, colours with hex, fonts, voice and web address.
// No app shell, so it prints (or saves as PDF) cleanly on A4 or Letter.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Brand sheet" };

export default async function BrandSheetPage() {
  const user = await requireRole(["seller"], "/login");
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
        ...BRAND_COLOURS.map((colour) => ({ label: colour.label, hint: colour.hint, value: toHex6(tokens[colour.key]) })),
        { label: "Buttons", hint: "Button background", value: toHex6(tokens.ctaBg) },
        { label: "Banner", hint: "Hero banner background", value: toHex6(tokens.heroBg) },
      ]
    : [];

  return (
    <div className="min-h-dvh bg-app-canvas font-app text-app-ink print:bg-white">
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print { .no-print { display: none !important; } .sheet { box-shadow: none !important; border: 0 !important; } }
      `}</style>

      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-app-line bg-white px-4 py-3 sm:px-6">
        <Link href="/home/brand-kit" className="text-[14px] font-extrabold text-app-ink no-underline">← Back to brand kit</Link>
        <PrintSheetButton />
      </div>

      <div className="px-4 py-6 sm:px-6 print:p-0">
        <article className="sheet mx-auto w-full max-w-[210mm] rounded-[22px] border border-app-line bg-white p-6 sm:p-10 print:rounded-none print:p-0">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-app-line pb-5">
            <div className="min-w-0">
              <p className="m-0 text-[13px] text-app-ink-soft">Brand sheet</p>
              <h1 className="m-0 mt-1 break-words text-[30px] leading-tight" style={{ fontFamily: font, fontWeight: serif ? 500 : 800 }}>{store.name}</h1>
              <p className="m-0 mt-1 text-[13.5px] text-app-ink-soft">{host}</p>
            </div>
            {store.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={store.logoUrl} alt={`${store.name} logo`} className="h-[72px] w-[72px] shrink-0 rounded-[16px] border border-app-line bg-white object-cover" />
            )}
          </header>

          <section className="mt-6">
            <h2 className="m-0 text-[16px] font-extrabold">Logo</h2>
            {store.logoUrl ? (
              <div className="mt-3 grid grid-cols-3 gap-3">
                {/* Fixed-size tiles that clip: an uploaded photo of any shape stays inside its tile. */}
                {[
                  { label: "On light", bg: tokens?.paperBg ?? "#FFFFFF", border: true, round: false },
                  { label: "On dark", bg: tokens?.ink ?? "#16141F", border: false, round: false },
                  { label: "App icon", bg: tokens?.accent ?? "#FF6A2B", border: false, round: true },
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
              <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">No logo uploaded yet. The store name above is used in its place.</p>
            )}
          </section>

          <section className="mt-6">
            <h2 className="m-0 text-[16px] font-extrabold">Colours</h2>
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
              <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">No shop colours set yet.</p>
            )}
          </section>

          <section className="mt-6 grid gap-6 sm:grid-cols-2">
            <div>
              <h2 className="m-0 text-[16px] font-extrabold">Fonts</h2>
              <p className="mb-0 mt-2 text-[24px] leading-tight" style={{ fontFamily: font, fontWeight: serif ? 500 : 800 }}>Headlines look like this</p>
              <p className="mb-0 mt-1 text-[14px]">Body text looks like this.</p>
              <p className="mb-0 mt-1 text-[12.5px] text-app-ink-soft">{serif ? "Serif headlines, sans-serif body" : "Sans-serif headlines and body"}</p>
            </div>
            <div>
              <h2 className="m-0 text-[16px] font-extrabold">How we sound</h2>
              <p className="mb-0 mt-2 text-[14px] leading-[1.55]">{voice || "Not written yet."}</p>
            </div>
          </section>

          {store.description && (
            <section className="mt-6">
              <h2 className="m-0 text-[16px] font-extrabold">About</h2>
              <p className="mb-0 mt-2 text-[14px] leading-[1.55]">{store.description}</p>
            </section>
          )}
        </article>
      </div>
    </div>
  );
}
