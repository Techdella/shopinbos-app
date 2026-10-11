import Link from "next/link";
import type { ReactNode } from "react";
import { BOUTIQUE_FONT_CLASS } from "@/components/storefront/boutique/fonts";
import { CMS_PROSE_CSS } from "@/components/cms/prose-css";
import { CmsContactForm, CmsSignupForm } from "@/components/cms/storefront/CmsForms";
import { readStoreLook, toHex6 } from "@/app/home/store/look";
import { readDesign, readFields as readFormFields } from "@/lib/marketing/forms";
import { mainRichField, videoValue, type CalloutValue, type CmsField, type FileValue, type FormValue, type LinkValue, type MediaValue, type PriceValue, type RichValue, type StatValue, type TableValue } from "@/lib/cms/fields";
import { escapeHtml, renderDoc, safeImageUrl, safeLinkUrl, sanitizeDoc, wordCount, type ProductCardData } from "@/lib/cms/richtext";
import { itemJsonLd, jsonLdString, listJsonLd } from "@/lib/cms/jsonld";
import { cmsTheme, storeLink } from "@/lib/cms/storefront";
import { loadStoreForm, type PublicStore } from "@/lib/cms/server";
import { naira } from "@shared/onboarding";

// Storefront pages for CMS collections (list and item), drawn in the store's theme colours and fonts.
// Rich text is re-sanitised and rendered from JSON here, so stored HTML is never trusted.

const SHELL_CSS = `
.cms-shell{min-height:100dvh;display:flex;flex-direction:column;font-family:var(--font-jakarta),'Plus Jakarta Sans',system-ui,sans-serif}
.cms-shell a{color:inherit}
.cms-top{border-bottom:1px solid var(--cms-border);background:var(--cms-paper)}
.cms-top-inner,.cms-main,.cms-foot-inner{width:100%;max-width:1180px;margin:0 auto;padding-left:16px;padding-right:16px}
@media(min-width:640px){.cms-top-inner,.cms-main,.cms-foot-inner{padding-left:28px;padding-right:28px}}
.cms-top-inner{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:64px}
.cms-brand{display:flex;align-items:center;gap:10px;text-decoration:none;font-family:var(--cms-heading-font);font-size:20px;font-weight:700;min-width:0}
.cms-brand span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cms-brand img{width:36px;height:36px;border-radius:8px;object-fit:cover}
.cms-nav{display:flex;gap:6px;flex-shrink:0}
.cms-nav a{display:inline-flex;align-items:center;min-height:40px;padding:0 14px;border-radius:999px;text-decoration:none;font-weight:600;font-size:14px}
.cms-nav a:hover{background:var(--cms-soft)}
.cms-main{flex:1;padding-top:28px;padding-bottom:56px}
.cms-crumbs{font-size:13.5px;color:var(--cms-muted);margin:0 0 18px;display:flex;flex-wrap:wrap;gap:6px}
.cms-crumbs a{text-decoration:none}.cms-crumbs a:hover{text-decoration:underline}
.cms-h1{font-family:var(--cms-heading-font);font-size:clamp(30px,5vw,48px);line-height:1.08;letter-spacing:-.02em;margin:0 0 12px;font-weight:700}
.cms-h2{font-family:var(--cms-heading-font);font-size:clamp(21px,3vw,26px);line-height:1.2;margin:0 0 14px;font-weight:700}
.cms-lede{font-size:18px;line-height:1.6;color:var(--cms-muted);margin:0 0 28px;max-width:720px}
.cms-meta{font-size:14px;color:var(--cms-muted);margin:0 0 24px;display:flex;flex-wrap:wrap;gap:8px}
.cms-grid{display:grid;gap:22px;grid-template-columns:1fr}
@media(min-width:640px){.cms-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(min-width:1024px){.cms-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
.cms-card{display:flex;flex-direction:column;text-decoration:none;border-radius:var(--cms-radius);overflow:hidden;background:var(--cms-soft);border:1px solid var(--cms-border);height:100%}
.cms-card:hover{border-color:var(--cms-ink)}
.cms-card img,.cms-card .cms-ph{aspect-ratio:16/10;width:100%;object-fit:cover;display:block;background:var(--cms-border)}
.cms-card-body{padding:16px 18px 20px;display:flex;flex-direction:column;gap:6px}
.cms-card-title{font-family:var(--cms-heading-font);font-size:19px;font-weight:700;line-height:1.25;margin:0}
.cms-card-text{font-size:14.5px;line-height:1.55;color:var(--cms-muted);margin:0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.cms-small{font-size:13px;color:var(--cms-muted)}
.cms-list{list-style:none;margin:0;padding:0;border-top:1px solid var(--cms-border)}
.cms-list li{border-bottom:1px solid var(--cms-border)}
.cms-row{display:flex;gap:16px;align-items:center;padding:18px 0;text-decoration:none}
.cms-row img{width:96px;height:72px;object-fit:cover;border-radius:calc(var(--cms-radius) * .6);flex-shrink:0}
.cms-num{display:grid;place-items:center;width:40px;height:40px;border-radius:999px;background:var(--cms-soft);font-weight:700;flex-shrink:0}
.cms-faq details{border-bottom:1px solid var(--cms-border);padding:4px 0}
.cms-faq summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:16px;padding:16px 0;font-weight:700;font-size:17px;min-height:44px}
.cms-faq summary::-webkit-details-marker{display:none}
.cms-faq summary::after{content:"+";font-size:22px;line-height:1;color:var(--cms-muted)}
.cms-faq details[open] summary::after{content:"−"}
.cms-faq .cms-prose{padding:0 0 18px}
.cms-article{max-width:760px;margin:0 auto}
.cms-hero-img{width:100%;max-height:520px;object-fit:cover;border-radius:var(--cms-radius);margin:0 0 28px;display:block}
.cms-block{margin:0 0 34px}
.cms-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:0 0 30px}
.cms-fact{background:var(--cms-soft);border:1px solid var(--cms-border);border-radius:var(--cms-radius);padding:12px 14px}
.cms-fact dt{font-size:12.5px;color:var(--cms-muted);margin:0}
.cms-fact dd{margin:2px 0 0;font-size:19px;font-weight:700}
.cms-chips{display:flex;flex-wrap:wrap;gap:8px;list-style:none;margin:0;padding:0}
.cms-chips li{padding:6px 12px;border-radius:999px;background:var(--cms-soft);border:1px solid var(--cms-border);font-size:13.5px;font-weight:600}
.cms-gallery{display:grid;gap:10px;grid-template-columns:repeat(2,minmax(0,1fr))}
@media(min-width:768px){.cms-gallery{grid-template-columns:repeat(3,minmax(0,1fr))}}
.cms-gallery img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:var(--cms-radius)}
.cms-btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 24px;border-radius:999px;background:var(--cms-cta);color:var(--cms-cta-text)!important;font-weight:700;text-decoration:none;border:0;cursor:pointer;font-size:15px}
.cms-btn[disabled]{opacity:.6}
.cms-btn-outline{background:transparent;color:var(--cms-ink)!important;border:1.5px solid currentColor}
.cms-products{display:grid;gap:14px;grid-template-columns:repeat(2,minmax(0,1fr))}
@media(min-width:768px){.cms-products{grid-template-columns:repeat(4,minmax(0,1fr))}}
.cms-product-tile{text-decoration:none;display:flex;flex-direction:column;gap:6px}
.cms-product-tile img,.cms-product-tile .cms-ph{width:100%;aspect-ratio:1;object-fit:cover;border-radius:var(--cms-radius);background:var(--cms-soft)}
.cms-product-tile strong{font-size:14.5px;line-height:1.3}
.cms-video{position:relative;padding-top:56.25%;border-radius:var(--cms-radius);overflow:hidden;background:#000}
.cms-video iframe,.cms-video video{position:absolute;inset:0;width:100%;height:100%;border:0}
.cms-form-card{border:1px solid var(--cms-border);background:var(--cms-soft);border-radius:var(--cms-radius);padding:22px}
.cms-form{display:grid;gap:8px;max-width:520px}
.cms-form label{font-weight:600;font-size:14px;margin-top:6px}
.cms-form input,.cms-form textarea{width:100%;min-height:46px;border:1px solid var(--cms-border);border-radius:12px;padding:10px 14px;font:inherit;background:var(--cms-paper);color:var(--cms-ink)}
.cms-form .cms-btn{margin-top:10px;justify-self:start}
.cms-form-error{color:#B42318;margin:4px 0 0;font-size:14px}
.cms-more{margin-top:56px;padding-top:28px;border-top:1px solid var(--cms-border)}
.cms-foot{border-top:1px solid var(--cms-border);padding:22px 0;font-size:13.5px;color:var(--cms-muted)}
.cms-empty{padding:56px 20px;text-align:center;color:var(--cms-muted);border:1px dashed var(--cms-border);border-radius:var(--cms-radius)}
`;

export function CmsShell({ store, basePath, children, collection }: { store: PublicStore; basePath: string; collection?: { name: string; slug: string }; children: ReactNode }) {
  const theme = cmsTheme(store);
  return (
    <div className={`cms-shell ${BOUTIQUE_FONT_CLASS}`} style={theme.vars}>
      <style>{CMS_PROSE_CSS + SHELL_CSS}</style>
      <header className="cms-top">
        <div className="cms-top-inner">
          <Link href={storeLink(basePath, "/")} className="cms-brand">
            {store.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={store.logoUrl} alt="" />
            ) : null}
            <span>{store.name}</span>
          </Link>
          <nav className="cms-nav" aria-label="Store">
            {collection && <Link href={storeLink(basePath, `/${collection.slug}`)}>{collection.name}</Link>}
            <Link href={storeLink(basePath, "/")}>Shop</Link>
          </nav>
        </div>
      </header>
      <main className="cms-main" id="main">{children}</main>
      <footer className="cms-foot">
        <div className="cms-foot-inner">© {new Date().getFullYear()} {store.name}</div>
      </footer>
    </div>
  );
}

const dateText = (value: Date | string | null | undefined) => (value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "");

interface ListItem {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  featuredImage: string | null;
  author: string;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  data: unknown;
  sortOrder: number;
}

export function CmsCollectionView({
  store,
  collection,
  items,
  fields,
  layout,
  basePath,
  canonical,
}: {
  store: PublicStore;
  collection: { name: string; slug: string; description: string; template: string };
  items: ListItem[];
  fields: CmsField[];
  layout: "grid" | "list";
  basePath: string;
  canonical: string;
}) {
  const href = (item: ListItem) => storeLink(basePath, `/${collection.slug}/${item.slug}`);
  const jsonLd = listJsonLd(
    collection,
    items.map((item) => ({ ...item, data: (item.data ?? {}) as Record<string, unknown> })),
    { template: collection.template, url: canonical, storeName: store.name, storeUrl: canonical.replace(/\/[^/]+$/, ""), logo: store.logoUrl, fields },
  );
  const main = mainRichField(fields);
  return (
    <CmsShell store={store} basePath={basePath}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <nav className="cms-crumbs" aria-label="Breadcrumb"><Link href={storeLink(basePath, "/")}>{store.name}</Link><span aria-hidden>/</span><span aria-current="page">{collection.name}</span></nav>
      <h1 className="cms-h1">{collection.name}</h1>
      {collection.description && <p className="cms-lede">{collection.description}</p>}
      {items.length === 0 ? (
        <p className="cms-empty">Nothing here yet. Check back soon.</p>
      ) : collection.template === "faq" ? (
        <div className="cms-faq cms-article" style={{ marginLeft: 0 }}>
          {items.map((item) => {
            const answer = main ? ((item.data as Record<string, unknown>)?.[main.key] as RichValue | undefined) : undefined;
            return (
              <details key={item.id} id={item.slug}>
                <summary>{item.title}</summary>
                <div className="cms-prose" dangerouslySetInnerHTML={{ __html: answer?.json ? renderDoc(sanitizeDoc(answer.json)) : escapeHtml(item.excerpt) }} />
              </details>
            );
          })}
        </div>
      ) : layout === "list" || collection.template === "course" ? (
        <ol className="cms-list">
          {items.map((item, index) => (
            <li key={item.id}>
              <Link href={href(item)} className="cms-row">
                {collection.template === "course" ? <span className="cms-num" aria-hidden>{index + 1}</span> : null}
                {item.featuredImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.featuredImage} alt="" loading="lazy" />
                ) : null}
                <span style={{ minWidth: 0 }}>
                  <span className="cms-card-title" style={{ display: "block" }}>{item.title}</span>
                  {item.excerpt && <span className="cms-card-text">{item.excerpt}</span>}
                  <ListMeta template={collection.template} item={item} />
                </span>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <ul className="cms-grid" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {items.map((item) => (
            <li key={item.id}>
              <Link href={href(item)} className="cms-card">
                {item.featuredImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.featuredImage} alt="" loading="lazy" />
                ) : (
                  <span className="cms-ph" aria-hidden />
                )}
                <span className="cms-card-body">
                  <span className="cms-card-title">{item.title}</span>
                  {item.excerpt && <span className="cms-card-text">{item.excerpt}</span>}
                  <ListMeta template={collection.template} item={item} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </CmsShell>
  );
}

function ListMeta({ template, item }: { template: string; item: ListItem }) {
  const data = (item.data ?? {}) as Record<string, unknown>;
  if (template === "events" && typeof data.date === "string") return <span className="cms-small">{dateText(data.date)}{typeof data.location === "string" && data.location ? ` · ${data.location}` : ""}</span>;
  if (template === "recipe") {
    const total = (Number(data.prepMinutes) || 0) + (Number(data.cookMinutes) || 0);
    return total ? <span className="cms-small">{total} minutes{data.servings ? ` · serves ${data.servings}` : ""}</span> : null;
  }
  if (template === "course" && typeof data.durationMinutes === "number") return <span className="cms-small">{data.durationMinutes} min{data.freePreview === true ? " · free preview" : ""}</span>;
  if (template === "blog" || template === "blank") return <span className="cms-small">{dateText(item.publishedAt ?? item.createdAt)}</span>;
  return null;
}

// ─── Item page ───────────────────────────────────────────────────────────────

const FACT_TYPES = new Set(["number", "date", "price", "boolean"]);

function factValue(field: CmsField, value: unknown) {
  if (field.type === "number") return typeof value === "number" ? value.toLocaleString("en-GB") : null;
  if (field.type === "date") return typeof value === "string" ? dateText(value) : null;
  if (field.type === "price") {
    const price = value as PriceValue | undefined;
    if (!price || typeof price.amount !== "number") return null;
    return price.amount === 0 ? "Free" : price.currency === "NGN" ? naira(price.amount) : `${price.currency} ${price.amount.toLocaleString()}`;
  }
  if (field.type === "boolean") return value === true ? "Yes" : null;
  return null;
}

async function FieldBlock({ field, value, isMain, store, products, items, context }: { field: CmsField; value: unknown; isMain: boolean; store: PublicStore; products: Record<string, ProductCardData>; items: Record<string, { title: string; href: string; image: string | null }>; context: string }) {
  if (value === undefined || value === null) return null;
  const heading = isMain ? null : <h2 className="cms-h2">{field.label}</h2>;
  switch (field.type) {
    case "richText": {
      const json = (value as RichValue).json;
      if (!json) return null;
      const html = renderDoc(sanitizeDoc(json), { products });
      if (!html.replace(/<p><\/p>/g, "").trim()) return null;
      return <section className="cms-block">{heading}<div className="cms-prose" dangerouslySetInnerHTML={{ __html: html }} /></section>;
    }
    case "text":
      return <section className="cms-block">{heading}<p className="cms-prose" style={{ whiteSpace: "pre-line" }}>{String(value)}</p></section>;
    case "stats": {
      const stats = value as StatValue[];
      return (
        <section className="cms-block">
          {heading}
          <dl className="cms-facts">{stats.map((stat, index) => <div key={index} className="cms-fact"><dt>{stat.label}</dt><dd>{stat.value}</dd></div>)}</dl>
        </section>
      );
    }
    case "image": {
      const image = value as MediaValue;
      const src = safeImageUrl(image.url);
      return src ? (
        <figure className="cms-block" style={{ margin: "0 0 34px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={image.alt} loading="lazy" style={{ width: "100%", borderRadius: "var(--cms-radius)" }} />
          {!isMain && image.alt ? <figcaption className="cms-small" style={{ marginTop: 6 }}>{image.alt}</figcaption> : null}
        </figure>
      ) : null;
    }
    case "gallery": {
      const photos = (value as MediaValue[]).filter((photo) => safeImageUrl(photo.url));
      return (
        <section className="cms-block">
          {heading}
          <div className="cms-gallery">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {photos.map((photo, index) => <img key={index} src={safeImageUrl(photo.url)} alt={photo.alt} loading="lazy" />)}
          </div>
        </section>
      );
    }
    case "video": {
      const video = videoValue(value);
      if (!video) return null;
      return (
        <section className="cms-block">
          {heading}
          <div className="cms-video">
            {video.kind === "file" ? <video src={video.embedUrl} controls preload="metadata" playsInline /> : <iframe src={video.embedUrl} title={field.label} loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />}
          </div>
        </section>
      );
    }
    case "file": {
      const file = value as FileValue;
      const href = safeImageUrl(file.url);
      return href ? <section className="cms-block">{heading}<a className="cms-btn cms-btn-outline" href={href} target="_blank" rel="noopener noreferrer" download>Download {file.name}</a></section> : null;
    }
    case "choice":
    case "tags": {
      const list = Array.isArray(value) ? (value as string[]) : [String(value)];
      return <section className="cms-block">{heading}<ul className="cms-chips">{list.map((tag) => <li key={tag}>{tag}</li>)}</ul></section>;
    }
    case "link": {
      const link = value as LinkValue;
      const href = safeLinkUrl(link.url);
      if (!href) return null;
      const external = /^https?:/.test(href);
      return <section className="cms-block"><a className="cms-btn" href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{link.label || field.label}</a></section>;
    }
    case "products": {
      const list = (value as string[]).map((id) => ({ id, product: products[id] })).filter((entry) => entry.product);
      if (!list.length) return null;
      return (
        <section className="cms-block">
          {heading}
          <ul className="cms-products" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {list.map(({ id, product }) => (
              <li key={id}>
                <Link href={product.href} className="cms-product-tile">
                  {product.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.image} alt="" loading="lazy" />
                  ) : (
                    <span className="cms-ph" aria-hidden />
                  )}
                  <strong>{product.name}</strong>
                  <span className="cms-small">{product.price}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      );
    }
    case "items": {
      const list = (value as string[]).map((id) => items[id]).filter(Boolean);
      if (!list.length) return null;
      return (
        <section className="cms-block">
          {heading}
          <ul className="cms-list">{list.map((entry) => <li key={entry.href}><Link href={entry.href} className="cms-row"><span className="cms-card-title">{entry.title}</span></Link></li>)}</ul>
        </section>
      );
    }
    case "callout": {
      const callout = value as CalloutValue;
      return (
        <aside className={`cms-prose cms-block`}>
          <div className={`cms-callout cms-callout-${callout.tone}`} style={{ margin: 0 }}>
            {callout.title && <p style={{ fontWeight: 700, marginBottom: 4 }}>{callout.title}</p>}
            {callout.body && <p style={{ whiteSpace: "pre-line" }}>{callout.body}</p>}
          </div>
        </aside>
      );
    }
    case "table": {
      const table = value as TableValue;
      const [first, ...rest] = table.rows;
      const head = table.header ? first : null;
      const body = table.header ? rest : table.rows;
      return (
        <section className="cms-block cms-prose">
          {heading}
          <div className="cms-table">
            <table>
              {head && <thead><tr>{head.map((cell, index) => <th key={index} scope="col">{cell}</th>)}</tr></thead>}
              <tbody>{body.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c}>{cell}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </section>
      );
    }
    case "form": {
      const form = value as FormValue;
      if (form.formId) {
        const stored = await loadStoreForm(store.id, form.formId);
        if (stored) {
          const tokens = readStoreLook(store).tokens;
          const colors = { ink: toHex6(tokens?.ink, "#16141F"), paper: toHex6(tokens?.paperBg, "#FFFFFF"), accent: toHex6(tokens?.ctaBg, "#16141F"), accentText: toHex6(tokens?.ctaText, "#FFFFFF") };
          return <div className="cms-block"><CmsSignupForm storeSlug={store.slug} formId={stored.id} fields={readFormFields(stored.fields)} design={readDesign(stored.design, stored.name)} colors={colors} heading={form.heading} /></div>;
        }
      }
      return <div className="cms-block"><CmsContactForm storeSlug={store.slug} heading={form.heading} context={context} /></div>;
    }
    default:
      return null;
  }
}

export async function CmsItemView({
  store,
  collection,
  item,
  fields,
  siblings,
  basePath,
  canonical,
  refs,
}: {
  store: PublicStore;
  collection: { name: string; slug: string; template: string; itemLabel: string };
  item: ListItem & { seo: unknown };
  fields: CmsField[];
  siblings: Array<{ id: string; title: string; slug: string; excerpt: string; featuredImage: string | null; publishedAt: Date | null; createdAt: Date }>;
  basePath: string;
  canonical: string;
  refs: { products: Record<string, ProductCardData>; items: Record<string, { title: string; href: string; image: string | null }> };
}) {
  const data = (item.data ?? {}) as Record<string, unknown>;
  const main = mainRichField(fields);
  const facts = fields.filter((field) => FACT_TYPES.has(field.type)).map((field) => ({ field, text: factValue(field, data[field.key]) })).filter((fact) => fact.text);
  const blocks = fields.filter((field) => !FACT_TYPES.has(field.type));
  const mainDoc = main ? (data[main.key] as RichValue | undefined)?.json : undefined;
  const minutes = collection.template === "blog" && mainDoc ? Math.max(1, Math.round(wordCount(sanitizeDoc(mainDoc)) / 200)) : null;
  const jsonLd = itemJsonLd({ ...item, data }, { template: collection.template, url: canonical, storeName: store.name, storeUrl: canonical.split(`/${collection.slug}/`)[0], logo: store.logoUrl, fields });
  const firstImageField = fields.find((field) => field.type === "image");

  return (
    <CmsShell store={store} basePath={basePath} collection={collection}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <article className="cms-article">
        <nav className="cms-crumbs" aria-label="Breadcrumb">
          <Link href={storeLink(basePath, "/")}>{store.name}</Link><span aria-hidden>/</span>
          <Link href={storeLink(basePath, `/${collection.slug}`)}>{collection.name}</Link>
        </nav>
        <h1 className="cms-h1">{item.title}</h1>
        {(item.author || item.publishedAt || minutes) && (
          <p className="cms-meta">
            {item.author && <span>By {item.author}</span>}
            {collection.template !== "faq" && collection.template !== "team" && item.publishedAt && <time dateTime={item.publishedAt.toISOString()}>{dateText(item.publishedAt)}</time>}
            {minutes && <span>{minutes} min read</span>}
          </p>
        )}
        {item.featuredImage && !(firstImageField && (data[firstImageField.key] as MediaValue | undefined)?.url === item.featuredImage) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="cms-hero-img" src={safeImageUrl(item.featuredImage)} alt="" />
        ) : null}
        {facts.length > 0 && (
          <dl className="cms-facts">
            {facts.map(({ field, text }) => <div key={field.id} className="cms-fact"><dt>{field.label}</dt><dd>{text}</dd></div>)}
          </dl>
        )}
        {blocks.map((field) => (
          <FieldBlock key={field.id} field={field} value={data[field.key]} isMain={field === main} store={store} products={refs.products} items={refs.items} context={`${collection.slug}/${item.slug}`} />
        ))}
      </article>
      {siblings.length > 0 && (
        <section className="cms-more" aria-labelledby="cms-more">
          <h2 id="cms-more" className="cms-h2">More from {collection.name}</h2>
          <ul className="cms-grid" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {siblings.map((sibling) => (
              <li key={sibling.id}>
                <Link href={storeLink(basePath, `/${collection.slug}/${sibling.slug}`)} className="cms-card">
                  {sibling.featuredImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={sibling.featuredImage} alt="" loading="lazy" />
                  ) : (
                    <span className="cms-ph" aria-hidden />
                  )}
                  <span className="cms-card-body">
                    <span className="cms-card-title">{sibling.title}</span>
                    {sibling.excerpt && <span className="cms-card-text">{sibling.excerpt}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </CmsShell>
  );
}
