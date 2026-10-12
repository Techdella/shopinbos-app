import Link from "next/link";
import type { CSSProperties } from "react";
import { CmsShell } from "@/components/cms/storefront/CmsPages";
import { BQ_GROTESK, BQ_SERIF } from "@/components/storefront/boutique/fonts";
import { renderDoc, sanitizeDoc } from "@/lib/cms/richtext";
import { storeLink } from "@/lib/cms/storefront";
import { LEGAL_WIDTHS, legalPagePath, legalToc, type LegalPage, type TocEntry } from "@/lib/legal/pages";
import type { PublicStore } from "@/lib/cms/server";
import type { StoreChromeData } from "@/lib/storefront/product-page.server";

// A legal page on the storefront: the store's header and footer (CmsShell, in the theme's colours and
// fonts), the chosen layout preset, a table of contents with anchors on the headings, and print styles.
// The document is re-sanitised and rendered from JSON here; stored HTML is never trusted.

const LEGAL_CSS = `
.legal{--legal-w:780px}
.legal .cms-prose a{color:var(--legal-accent,var(--cms-accent))}
.legal .cms-prose h2,.legal .cms-prose h3{scroll-margin-top:24px}
.legal-head{margin:0 0 28px}
.legal-updated{font-size:14px;color:var(--cms-muted);margin:0}
.legal-body{width:100%;max-width:var(--legal-w);margin:0 auto;min-width:0}
.legal-toc-title{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--cms-muted);margin:0 0 10px}
.legal-toc ol{list-style:none;margin:0;padding:0;display:grid;gap:2px}
.legal-toc a{display:block;padding:6px 10px;border-radius:10px;text-decoration:none;font-size:14.5px;line-height:1.35;border-left:2px solid transparent}
.legal-toc a:hover{background:var(--cms-soft);border-left-color:var(--legal-accent,var(--cms-accent))}
.legal-toc .legal-toc-3 a{padding-left:24px;font-size:13.5px;color:var(--cms-muted)}
.legal-toc-box{border:1px solid var(--cms-border);background:var(--cms-soft);border-radius:var(--cms-radius);padding:16px 18px;margin:0 0 32px}
.legal-toc-box summary{cursor:pointer;font-weight:700;min-height:28px;list-style:none}
.legal-toc-box summary::-webkit-details-marker{display:none}
.legal-toc-box summary::after{content:" +";color:var(--cms-muted)}
.legal-toc-box[open] summary::after{content:" −"}
.legal-toc-box[open] summary{margin-bottom:8px}
.legal-contents{display:grid;gap:32px}
.legal-contents .legal-side{display:none}
@media(min-width:960px){
  .legal-contents{grid-template-columns:240px minmax(0,var(--legal-w));justify-content:center;gap:56px;align-items:start}
  .legal-contents .legal-side{display:block;position:sticky;top:24px;max-height:calc(100dvh - 48px);overflow:auto}
  .legal-contents .legal-toc-box{display:none}
  .legal-contents .legal-body{margin:0}
}
.legal-centered .legal-card{max-width:calc(var(--legal-w) + 112px);margin:0 auto;background:var(--cms-soft);border:1px solid var(--cms-border);border-radius:var(--cms-radius);padding:clamp(22px,5vw,56px)}
.legal-centered .legal-head{text-align:center}
.legal-centered .legal-crumbs{justify-content:center}
.legal-preview{border:1px dashed var(--cms-ink);border-radius:var(--cms-radius);padding:10px 14px;margin:0 0 22px;font-size:14px;font-weight:600}
.legal-index{list-style:none;margin:0;padding:0;border-top:1px solid var(--cms-border);max-width:780px}
.legal-index li{border-bottom:1px solid var(--cms-border)}
.legal-index a{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:18px 0;min-height:44px;text-decoration:none;font-size:18px;font-weight:700;font-family:var(--cms-heading-font)}
.legal-index a::after{content:"→";color:var(--cms-muted)}
@media print{
  body *{visibility:hidden}
  .legal,.legal *{visibility:visible}
  .legal{position:absolute;left:0;top:0;width:100%}
  .cms-top,.cms-foot,.legal-side,.legal-toc-box,.legal-preview,.cms-crumbs{display:none!important}
  .cms-shell{background:#fff!important;color:#000!important;min-height:0}
  .cms-main{padding:0!important;max-width:none}
  .legal-body{max-width:none}
  .legal-centered .legal-card{border:0;background:none;padding:0;max-width:none}
  .legal .cms-prose{font-size:11.5pt;color:#000}
  .legal .cms-prose a{color:#000}
  .legal .cms-prose a[href^="http"]::after{content:" (" attr(href) ")";font-size:.85em}
  .legal .cms-prose h2,.legal .cms-prose h3{break-after:avoid}
}
`;

const dateText = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

function TocList({ toc }: { toc: TocEntry[] }) {
  return (
    <ol>
      {toc.map((entry) => (
        <li key={entry.id} className={`legal-toc-${entry.level}`}>
          <a href={`#${entry.id}`}>{entry.text}</a>
        </li>
      ))}
    </ol>
  );
}

export function LegalPageView({ store, page, basePath, preview, chrome }: { store: PublicStore; page: LegalPage; basePath: string; preview: boolean; chrome?: StoreChromeData | null }) {
  const style = page.style;
  const doc = sanitizeDoc(page.doc);
  const toc = style.toc ? legalToc(doc) : [];
  // Links to other policies (/policies/…) in templates point at this store, wherever it is served.
  const html = renderDoc(doc).replace(/href="\/policies\//g, `href="${storeLink(basePath, "/policies/")}`);
  const vars = {
    ["--legal-w" as string]: `${LEGAL_WIDTHS[style.width]}px`,
    ...(style.accent ? { ["--legal-accent" as string]: style.accent } : {}),
    ...(style.headingFont === "serif" ? { ["--cms-heading-font" as string]: BQ_SERIF } : style.headingFont === "sans" ? { ["--cms-heading-font" as string]: BQ_GROTESK } : {}),
  } as CSSProperties;

  const head = (
    <header className="legal-head">
      <nav className="cms-crumbs legal-crumbs" aria-label="Breadcrumb">
        <Link href={storeLink(basePath, "/")}>{store.name}</Link><span aria-hidden>/</span>
        <Link href={storeLink(basePath, "/policies")}>Policies</Link>
      </nav>
      <h1 className="cms-h1">{page.title}</h1>
      {style.showUpdated && page.updatedAt ? <p className="legal-updated">Last updated <time dateTime={page.updatedAt}>{dateText(page.updatedAt)}</time></p> : null}
    </header>
  );
  const inlineToc = toc.length ? (
    <details className="legal-toc-box legal-toc" open={style.layout !== "contents"}>
      <summary>On this page</summary>
      <TocList toc={toc} />
    </details>
  ) : null;
  const body = <div className="cms-prose" dangerouslySetInnerHTML={{ __html: html }} />;

  return (
    <CmsShell store={store} basePath={basePath} chrome={chrome}>
      <style>{LEGAL_CSS}</style>
      <article className={`legal legal-${style.layout}`} style={vars}>
        {preview && <p className="legal-preview" role="status">Preview: this page isn&apos;t published, so only you can see it.</p>}
        {style.layout === "contents" ? (
          <div className="legal-contents">
            {toc.length ? (
              <aside className="legal-side legal-toc" aria-label="Contents">
                <p className="legal-toc-title">Contents</p>
                <TocList toc={toc} />
              </aside>
            ) : null}
            <div className="legal-body" style={toc.length ? undefined : { margin: "0 auto" }}>
              {head}
              {inlineToc}
              {body}
            </div>
          </div>
        ) : style.layout === "centered" ? (
          <div className="legal-card">
            {head}
            {inlineToc}
            {body}
          </div>
        ) : (
          <div className="legal-body">
            {head}
            {inlineToc}
            {body}
          </div>
        )}
      </article>
    </CmsShell>
  );
}

export function LegalIndexView({ store, pages, basePath, chrome }: { store: PublicStore; pages: Array<{ key: string; title: string }>; basePath: string; chrome?: StoreChromeData | null }) {
  return (
    <CmsShell store={store} basePath={basePath} chrome={chrome}>
      <style>{LEGAL_CSS}</style>
      <nav className="cms-crumbs" aria-label="Breadcrumb"><Link href={storeLink(basePath, "/")}>{store.name}</Link><span aria-hidden>/</span><span aria-current="page">Policies</span></nav>
      <h1 className="cms-h1">Policies</h1>
      <p className="cms-lede">How {store.name} handles your orders, deliveries, returns and personal data.</p>
      {pages.length ? (
        <ul className="legal-index">
          {pages.map((page) => <li key={page.key}><Link href={storeLink(basePath, legalPagePath(page.key))}>{page.title}</Link></li>)}
        </ul>
      ) : (
        <p className="cms-empty">Nothing here yet.</p>
      )}
    </CmsShell>
  );
}
