"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Props {
  storeName: string;
  storeSlug: string;
  hasContent: boolean;
  isLive?: boolean;
  lastPublished?: string | null;
  pages?: Array<{
    id: string;
    type: string;
    title: string;
    slug: string;
    isPublished: boolean;
  }>;
}

const EditSVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const GridSVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`;
const SparkSVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
const ArrowRSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;
const GlobeSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
const ExtLinkSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
const EyeSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const PlusSVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
const ChevRSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;
const HomeSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
const ShopSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`;
const UserSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
const MailSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`;
const DocSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
const TypeSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>`;
const SearchSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`;
const LinkSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
const ShieldSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;

const CSS = `
.sh-wrap { padding: 28px 32px; max-width: 1300px; margin: 0 auto; animation: sh-fade .3s ease; }
@keyframes sh-fade { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }

.sh-head { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 22px; }
.sh-head-text { flex: 1; }
.sh-title { font-size: 26px; font-weight: 800; letter-spacing: -.02em; color: var(--color-navy,#0E2A38); margin-bottom: 4px; font-family: var(--font-display,'Space Grotesk',sans-serif); }
.sh-sub { font-size: 13.5px; color: #6E6E68; }
.sh-head-btn { display: flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 999px; border: 1px solid rgba(14,42,56,.12); background: #fff; font-size: 13px; font-weight: 600; color: #4B5563; cursor: pointer; transition: background .14s; text-decoration: none; white-space: nowrap; }
.sh-head-btn:hover { background: #F9FAFB; }

.sh-status { border-radius: 14px; padding: 16px 20px; display: flex; align-items: center; gap: 14px; border: 1px solid rgba(16,185,129,.18); background: linear-gradient(100deg,#E4F4F0,#F0F9F6); margin-bottom: 20px; }
.sh-status-text { flex: 1; }
.sh-status-dot { width: 10px; height: 10px; border-radius: 99px; background: #10B981; box-shadow: 0 0 0 4px rgba(16,185,129,.2); flex-shrink: 0; }
.sh-status-dot.draft { background: #9CA3AF; box-shadow: 0 0 0 4px rgba(156,163,175,.2); }
.sh-status-title { font-size: 15px; font-weight: 700; color: #0E2A38; }
.sh-status-sub { font-size: 13px; color: #6E6E68; }
.sh-status-btn { display: flex; align-items: center; gap: 6px; padding: 8px 15px; border-radius: 999px; border: 1px solid rgba(14,42,56,.1); background: rgba(255,255,255,.7); font-size: 13px; font-weight: 600; color: #0E2A38; cursor: pointer; white-space: nowrap; text-decoration: none; transition: background .14s; }
.sh-status-btn:hover { background: #fff; }

.sh-cards { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 20px; }

.sh-bigcard { position: relative; overflow: hidden; border-radius: 14px; border: 1px solid rgba(14,42,56,.1); background: #fff; padding: 22px; cursor: pointer; transition: border-color .16s, transform .16s, box-shadow .16s; display: flex; flex-direction: column; }
.sh-bigcard:hover { transform: translateY(-3px); box-shadow: 0 8px 30px rgba(0,0,0,.08); }
.sh-bigcard--mint:hover { border-color: rgba(15,164,147,.53); }
.sh-bigcard--purple:hover { border-color: rgba(124,92,255,.53); }
.sh-bigcard--yellow:hover { border-color: rgba(245,158,11,.53); }
.sh-bc-blob { position: absolute; top: -30px; right: -30px; width: 130px; height: 130px; border-radius: 99px; pointer-events: none; }
.sh-bigcard--mint .sh-bc-blob { background: rgba(15,164,147,.1); }
.sh-bigcard--purple .sh-bc-blob { background: rgba(124,92,255,.1); }
.sh-bigcard--yellow .sh-bc-blob { background: rgba(245,158,11,.1); }
.sh-bc-ico { position: relative; width: 50px; height: 50px; border-radius: 13px; display: grid; place-items: center; margin-bottom: 16px; flex-shrink: 0; }
.sh-bc-ico svg { width: 24px; height: 24px; }
.sh-bigcard--mint .sh-bc-ico { background: rgba(15,164,147,.12); color: #0FA493; }
.sh-bigcard--purple .sh-bc-ico { background: rgba(124,92,255,.12); color: #7C5CFF; }
.sh-bigcard--yellow .sh-bc-ico { background: rgba(245,158,11,.12); color: #F59E0B; }
.sh-bc-eye { font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 6px; }
.sh-bigcard--mint .sh-bc-eye { color: #0FA493; }
.sh-bigcard--purple .sh-bc-eye { color: #7C5CFF; }
.sh-bigcard--yellow .sh-bc-eye { color: #F59E0B; }
.sh-bc-title { font-size: 19px; font-weight: 800; letter-spacing: -.01em; margin-bottom: 8px; color: var(--color-navy,#0E2A38); font-family: var(--font-display,'Space Grotesk',sans-serif); }
.sh-bc-body { font-size: 13.5px; color: #6E6E68; line-height: 1.55; flex: 1; margin-bottom: 18px; }
.sh-bc-cta { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 16px; border-radius: 999px; font-size: 13px; font-weight: 700; border: none; cursor: pointer; width: 100%; transition: background .14s; text-decoration: none; }
.sh-bigcard--mint .sh-bc-cta { background: rgba(15,164,147,.1); color: #0FA493; }
.sh-bigcard--purple .sh-bc-cta { background: rgba(124,92,255,.1); color: #7C5CFF; }
.sh-bigcard--yellow .sh-bc-cta { background: rgba(245,158,11,.1); color: #F59E0B; }

.sh-bottom { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

.sh-card { background: #fff; border: 1px solid rgba(14,42,56,.08); border-radius: 14px; padding: 20px; }
.sh-card h3 { font-size: 15px; font-weight: 700; color: var(--color-navy,#0E2A38); margin-bottom: 14px; font-family: var(--font-display,'Space Grotesk',sans-serif); }

.sh-pg-row { display: flex; align-items: center; gap: 11px; padding: 10px 0; border-top: 1px solid rgba(14,42,56,.06); }
.sh-pg-ico { width: 28px; height: 28px; border-radius: 8px; background: rgba(115,216,200,.1); display: grid; place-items: center; flex-shrink: 0; color: var(--color-teal,#0FA493); }
.sh-pg-ico svg { width: 14px; height: 14px; }
.sh-pg-name { flex: 1; font-size: 13.5px; font-weight: 600; color: #111827; }
.sh-pg-badge { font-size: 10.5px; font-weight: 600; padding: 3px 8px; border-radius: 99px; }
.sh-pg-badge.pub { background: rgba(16,185,129,.1); color: #065F46; }
.sh-pg-badge.draft { background: rgba(107,114,128,.08); color: #4B5563; }
.sh-pg-edit { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 8px; border: none; background: transparent; color: #9CA3AF; cursor: pointer; transition: background .12s, color .12s; }
.sh-pg-edit:hover { background: #F3F4F6; color: #111827; }
.sh-pg-edit svg { width: 13px; height: 13px; }

.sh-add-pg { display: flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 999px; font-size: 12.5px; font-weight: 600; background: rgba(115,216,200,.1); color: var(--color-teal,#0FA493); border: 1px solid rgba(115,216,200,.25); cursor: pointer; transition: background .14s; margin-top: 12px; }
.sh-add-pg:hover { background: rgba(115,216,200,.18); }
.sh-add-pg svg { width: 13px; height: 13px; }
.sh-empty { padding: 22px 12px; border-top: 1px solid rgba(14,42,56,.06); text-align: center; }
.sh-empty-title { font-size: 14px; font-weight: 800; color: #0E2A38; margin-bottom: 5px; }
.sh-empty-body { font-size: 12.5px; color: #6E6E68; line-height: 1.55; max-width: 320px; margin: 0 auto 14px; }
.sh-empty-actions { display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; }
.sh-empty-actions .sh-add-pg { margin-top: 0; }
.sh-setup { border: 1px solid rgba(14,42,56,.08); background: #fff; border-radius: 14px; padding: 18px 20px; margin-bottom: 20px; }
.sh-setup-top { display:flex; align-items:center; justify-content:space-between; gap:14px; margin-bottom:14px; }
.sh-setup-title { font-size:15px; font-weight:800; color:#0E2A38; }
.sh-setup-progress { font-size:12px; font-weight:800; color:#0FA493; }
.sh-setup-bar { height:8px; border-radius:999px; background:#E8F3F0; overflow:hidden; margin-bottom:14px; }
.sh-setup-fill { height:100%; border-radius:999px; background:#0FA493; }
.sh-setup-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; }
.sh-setup-item { display:flex; align-items:center; gap:7px; border:1px solid rgba(14,42,56,.07); border-radius:10px; padding:8px 9px; font-size:12px; color:#4B5563; background:#FAFBFB; }
.sh-setup-check { width:16px; height:16px; border-radius:50%; display:grid; place-items:center; border:1px solid #CDD7D4; color:#fff; font-size:10px; flex-shrink:0; }
.sh-setup-item.done .sh-setup-check { background:#0FA493; border-color:#0FA493; }
.sh-setup-item.done { color:#0E2A38; font-weight:700; }
.sh-template-row { display:flex; align-items:center; gap:11px; padding:10px 0; border-top:1px solid rgba(14,42,56,.06); }
.sh-template-meta { flex:1; min-width:0; }
.sh-template-name { font-size:13.5px; font-weight:700; color:#111827; }
.sh-template-sub { font-size:12px; color:#9CA3AF; margin-top:1px; }
.sh-template-badge { font-size:10.5px; font-weight:800; border-radius:99px; padding:3px 8px; background:rgba(14,42,56,.06); color:#4B5563; white-space:nowrap; }
@media (max-width: 900px) { .sh-setup-grid { grid-template-columns: 1fr 1fr; } }

.sh-set-row { display: flex; align-items: center; gap: 11px; padding: 10px 0; border-top: 1px solid rgba(14,42,56,.06); cursor: pointer; }
.sh-set-row:hover .sh-set-chevron { color: #374151; }
.sh-set-ico { width: 28px; height: 28px; border-radius: 8px; background: #F3F4F6; display: grid; place-items: center; flex-shrink: 0; color: #6B7280; }
.sh-set-ico svg { width: 14px; height: 14px; }
.sh-set-name { flex: 1; font-size: 13.5px; font-weight: 600; color: #111827; }
.sh-set-val { font-size: 12px; color: #9CA3AF; margin-right: 4px; }
.sh-set-chevron { color: #D1D5DB; }
.sh-set-chevron svg { width: 14px; height: 14px; display: block; }
`;

export function StoreStartClient({ storeName, storeSlug, hasContent, isLive = false, lastPublished, pages: storePages = [] }: Props) {
  const router = useRouter();

  const pages = storePages.map((page) => ({
    icon: page.type === "home" ? "home" : page.type === "products" ? "shop" : page.type === "about" ? "user" : page.type === "contact" ? "mail" : "doc",
    name: page.title,
    status: page.isPublished ? "Published" : "Draft",
    slug: page.slug,
  }));

  const settings = [
    { icon: "globe", name: "Domain", value: `${storeSlug}.shopinbos.com`, href: "/seller/store/settings?tab=domain" },
    { icon: "type", name: "Brand kit", value: hasContent ? "Draft ready" : "Not configured", href: "/seller/store/settings?tab=brand" },
    { icon: "search", name: "SEO", value: isLive ? "Published pages" : "Draft SEO", href: "/seller/store/settings?tab=seo" },
    { icon: "link", name: "Navigation", value: pages.length ? "Main menu" : "Not configured", href: "/seller/store/settings?tab=navigation" },
    { icon: "shield", name: "Legal pages", value: pages.some((page) => page.name.toLowerCase().includes("privacy") || page.name.toLowerCase().includes("terms")) ? "Configured" : "Needs setup", href: "/seller/store/settings?tab=legal" },
  ];
  const setupItems = [
    { label: "Add store name", done: Boolean(storeName?.trim()) },
    { label: "Upload logo", done: hasContent },
    { label: "Add products", done: false },
    { label: "Choose theme", done: hasContent },
    { label: "Configure delivery", done: false },
    { label: "Configure payments", done: false },
    { label: "Publish store", done: isLive },
    { label: "Legal pages", done: pages.some((page) => page.name.toLowerCase().includes("privacy") || page.name.toLowerCase().includes("terms")) },
  ];
  const setupDone = setupItems.filter(item => item.done).length;
  const setupPercent = Math.round((setupDone / setupItems.length) * 100);

  const pgIcon: Record<string, ReactNode> = {
    home: <span dangerouslySetInnerHTML={{ __html: HomeSVG }} />,
    shop: <span dangerouslySetInnerHTML={{ __html: ShopSVG }} />,
    user: <span dangerouslySetInnerHTML={{ __html: UserSVG }} />,
    mail: <span dangerouslySetInnerHTML={{ __html: MailSVG }} />,
    doc: <span dangerouslySetInnerHTML={{ __html: DocSVG }} />,
  };

  const setIcon: Record<string, ReactNode> = {
    globe: <span dangerouslySetInnerHTML={{ __html: GlobeSVG }} />,
    type: <span dangerouslySetInnerHTML={{ __html: TypeSVG }} />,
    search: <span dangerouslySetInnerHTML={{ __html: SearchSVG }} />,
    link: <span dangerouslySetInnerHTML={{ __html: LinkSVG }} />,
    shield: <span dangerouslySetInnerHTML={{ __html: ShieldSVG }} />,
  };

  return (
    <div className="sh-wrap">
      <style>{CSS}</style>

      {/* Page header */}
      <div className="sh-head">
        <div className="sh-head-text">
          <h1 className="sh-title">Your store</h1>
          <p className="sh-sub">Design, build and manage your storefront &mdash; {storeSlug}.shopinbos.com</p>
        </div>
        <a
          href={isLive ? `https://${storeSlug}.shopinbos.com` : "/seller/store/builder"}
          target="_blank"
          rel="noopener noreferrer"
          className="sh-head-btn"
        >
          <span dangerouslySetInnerHTML={{ __html: GlobeSVG }} />
          {isLive ? "Visit live store" : "Preview draft"}
          <span dangerouslySetInnerHTML={{ __html: ExtLinkSVG }} />
        </a>
      </div>

      {/* Status banner */}
      <div className="sh-status">
        <span className={`sh-status-dot${!isLive ? " draft" : ""}`} />
        <div className="sh-status-text">
          <div className="sh-status-title">{isLive ? "Your store is live" : "Store not yet published"}</div>
          <div className="sh-status-sub">
            {lastPublished
              ? `Last published ${lastPublished} · ${storeName}`
              : isLive ? `${storeName}` : "Publish to make your store visible to customers"}
          </div>
        </div>
        <Link href="/seller/store/builder" className="sh-status-btn">
          <span dangerouslySetInnerHTML={{ __html: EyeSVG }} />
          Preview
        </Link>
      </div>

      {!isLive ? (
        <div className="sh-setup">
          <div className="sh-setup-top">
            <div>
              <div className="sh-setup-title">Store setup</div>
              <div className="sh-status-sub">Complete the essentials before customers see your store.</div>
            </div>
            <div className="sh-setup-progress">{setupPercent}% complete</div>
          </div>
          <div className="sh-setup-bar"><div className="sh-setup-fill" style={{ width: `${setupPercent}%` }} /></div>
          <div className="sh-setup-grid">
            {setupItems.map(item => (
              <div key={item.label} className={`sh-setup-item${item.done ? " done" : ""}`}>
                <span className="sh-setup-check">{item.done ? "✓" : ""}</span>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 3 big path cards */}
      <div className="sh-cards">
        {/* AI Builder (Rex) */}
        <BigCard
          variant="mint"
          eyebrow="AI BUILDER"
          title="Build with Rex"
          body="Describe your shop in a sentence. Rex designs the brand, writes copy and generates sections &mdash; live."
          cta="Open Rex builder"
          icon={<span dangerouslySetInnerHTML={{ __html: SparkSVG }} />}
          onClick={() => router.push("/seller/store/builder?rex=1")}
        />
        {/* Manual Editor */}
        <BigCard
          variant="purple"
          eyebrow="MANUAL EDITOR"
          title="Customise everything"
          body="Drag, drop and style every block. Full control over layout, type, colour and content &mdash; like a pro page builder."
          cta="Open store editor"
          icon={<span dangerouslySetInnerHTML={{ __html: EditSVG }} />}
          onClick={() => router.push("/seller/store/builder")}
        />
        {/* Theme Gallery */}
        <BigCard
          variant="yellow"
          eyebrow="THEME GALLERY"
          title="Start from a theme"
          body="Pick from professionally designed templates across every category. Adapt it to your brand with one click."
          cta="Browse themes"
          icon={<span dangerouslySetInnerHTML={{ __html: GridSVG }} />}
          onClick={() => router.push("/seller/store/templates")}
        />
      </div>

      {/* Bottom row: Pages + Store settings */}
      <div className="sh-bottom">
        {/* Pages card */}
        <div className="sh-card">
          <h3>Pages & Templates</h3>
          {pages.length === 0 ? (
            <div className="sh-empty">
              <div className="sh-empty-title">No pages created yet</div>
              <p className="sh-empty-body">Create your first page or choose a template. Product, category, cart, checkout, wishlist, and blog routes appear only when matching content exists.</p>
              <div className="sh-empty-actions">
                <button type="button" className="sh-add-pg" onClick={() => router.push("/seller/store/builder?rex=1")}>
                  <span dangerouslySetInnerHTML={{ __html: SparkSVG }} />
                  Build with Rex
                </button>
                <button type="button" className="sh-add-pg" onClick={() => router.push("/seller/store/builder")}>
                  <span dangerouslySetInnerHTML={{ __html: PlusSVG }} />
                  Add new page
                </button>
              </div>
            </div>
          ) : pages.map(pg => (
            <div key={pg.name} className="sh-pg-row">
              <div className="sh-pg-ico">{pgIcon[pg.icon]}</div>
              <span className="sh-pg-name">{pg.name}</span>
              <span className={`sh-pg-badge ${pg.status === "Published" ? "pub" : "draft"}`}>{pg.status}</span>
              <button type="button" className="sh-pg-edit" aria-label={`Edit ${pg.name} page`} onClick={() => router.push("/seller/store/builder")}>
                <span dangerouslySetInnerHTML={{ __html: EditSVG }} />
              </button>
            </div>
          ))}
          <button type="button" className="sh-add-pg" onClick={() => router.push("/seller/store/builder")}>
            <span dangerouslySetInnerHTML={{ __html: PlusSVG }} />
            Add page
          </button>
          <div className="sh-template-row">
            <div className="sh-pg-ico"><span dangerouslySetInnerHTML={{ __html: ShopSVG }} /></div>
            <div className="sh-template-meta">
              <div className="sh-template-name">Product page template</div>
              <div className="sh-template-sub">Used automatically when products exist</div>
            </div>
            <span className="sh-template-badge">Template</span>
          </div>
          <div className="sh-template-row">
            <div className="sh-pg-ico"><span dangerouslySetInnerHTML={{ __html: GridSVG }} /></div>
            <div className="sh-template-meta">
              <div className="sh-template-name">Cart, checkout, wishlist</div>
              <div className="sh-template-sub">System-managed commerce experience</div>
            </div>
            <span className="sh-template-badge">System</span>
          </div>
        </div>

        {/* Store settings card */}
        <div className="sh-card">
          <h3>Store settings</h3>
          {settings.map(s => (
            <div key={s.name} className="sh-set-row" onClick={() => router.push(s.href)}>
              <div className="sh-set-ico">{setIcon[s.icon]}</div>
              <span className="sh-set-name">{s.name}</span>
              <span className="sh-set-val">{s.value}</span>
              <span className="sh-set-chevron">
                <span dangerouslySetInnerHTML={{ __html: ChevRSVG }} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BigCard({
  variant, eyebrow, title, body, cta, icon, onClick,
}: {
  variant: "mint" | "purple" | "yellow";
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <div
      className={`sh-bigcard sh-bigcard--${variant}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onClick(); }}
    >
      <div className="sh-bc-blob" />
      <div className="sh-bc-ico">{icon}</div>
      <div className="sh-bc-eye">{eyebrow}</div>
      <h3 className="sh-bc-title">{title}</h3>
      <p className="sh-bc-body" dangerouslySetInnerHTML={{ __html: body }} />
      <div className="sh-bc-cta">
        {cta}
        <span dangerouslySetInnerHTML={{ __html: ArrowRSVG }} />
      </div>
    </div>
  );
}
