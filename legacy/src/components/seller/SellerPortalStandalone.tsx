"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";

type PageRow = {
  id: string;
  title: string;
  slug: string;
  type: string;
  status: "Published" | "Draft";
  updated: string;
  views?: string;
  posts?: string;
};

type PostRow = {
  id: string;
  title: string;
  excerpt: string;
  status: "Published" | "Draft" | "Scheduled";
  category: string;
  date: string;
  views: string;
  read: string;
  tint: string;
  comments: number;
};

type PortalProps = {
  storeName: string;
  storeDomain?: string;
  pages?: PageRow[];
  posts?: PostRow[];
  publishedPages?: number;
  publishedPosts?: number;
  initialTab?: "posts" | "pages";
};

const T = {
  canvas: "#F2F5F3",
  surface: "#FFFFFF",
  surface2: "#F4F7F5",
  border: "#E3EAE7",
  hover: "#F2F6F4",
  text: "#16302B",
  textSec: "#51635D",
  muted: "#7E8F89",
  faint: "#A6B3AE",
  mint: "#0FA493",
  mintBright: "#14B8A6",
  mintDeep: "#0B8074",
  mintBg: "rgba(15,164,147,.12)",
  mintBorder: "rgba(15,164,147,.30)",
  green: "#10B981",
  purple: "#7C5CFF",
  yellow: "#E08C00",
  coral: "#F43F5E",
  blue: "#2563EB",
  radius: 14,
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: T.canvas,
        color: T.text,
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

function PageHead({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 18 }}>
      <div>
        <h1 style={{ fontSize: 26, lineHeight: 1.1, fontWeight: 800, letterSpacing: 0, marginBottom: 6 }}>{title}</h1>
        <p style={{ color: T.textSec, fontSize: 13.5 }}>{sub}</p>
      </div>
      {children ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>{children}</div> : null}
    </div>
  );
}

function Button({
  href,
  children,
  variant = "primary",
  icon,
}: {
  href?: string;
  children: React.ReactNode;
  variant?: "primary" | "ghost" | "soft" | "dark";
  icon?: IconName;
}) {
  const bg = variant === "primary" ? T.mint : variant === "dark" ? T.text : variant === "soft" ? T.mintBg : T.surface;
  const color = variant === "primary" || variant === "dark" ? "#fff" : variant === "soft" ? T.mintDeep : T.text;
  const border = variant === "ghost" ? T.border : variant === "soft" ? T.mintBorder : "transparent";
  const content = (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        minHeight: 36,
        borderRadius: 10,
        padding: "0 14px",
        background: bg,
        color,
        border: `1px solid ${border}`,
        fontSize: 13,
        fontWeight: 700,
        textDecoration: "none",
      }}
    >
      {icon ? <Icon name={icon} size={15} color="currentColor" /> : null}
      {children}
    </span>
  );
  return href ? <Link href={href} style={{ textDecoration: "none" }}>{content}</Link> : content;
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        borderRadius: T.radius,
        border: `1px solid ${T.border}`,
        background: T.surface,
        boxShadow: "0 1px 2px rgba(16,40,36,.06)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Badge({ children, color = T.mint, dot }: { children: React.ReactNode; color?: string; dot?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        borderRadius: 99,
        padding: "4px 8px",
        background: `${color}1f`,
        color,
        fontSize: 11,
        fontWeight: 800,
      }}
    >
      {dot ? <span style={{ width: 6, height: 6, borderRadius: 99, background: color }} /> : null}
      {children}
    </span>
  );
}

function StatCard({ label, value, sub, icon, tint }: { label: string; value: string; sub?: string; icon: IconName; tint: string }) {
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <span style={{ color: T.textSec, fontSize: 12.5, fontWeight: 700 }}>{label}</span>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: `${tint}1f`, color: tint, display: "grid", placeItems: "center" }}>
          <Icon name={icon} size={17} color="currentColor" />
        </span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>{value}</div>
      {sub ? <div style={{ marginTop: 7, color: sub.startsWith("+") ? T.green : T.textSec, fontSize: 12 }}>{sub}</div> : null}
    </Card>
  );
}

function BigCard({
  href,
  icon,
  mascot,
  tint,
  eyebrow,
  title,
  body,
  cta,
}: {
  href: string;
  icon?: IconName;
  mascot?: "rex";
  tint: string;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
}) {
  return (
    <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
      <Card style={{ position: "relative", overflow: "hidden", padding: 22, minHeight: 258 }}>
        <div style={{ position: "absolute", top: -30, right: -30, width: 130, height: 130, borderRadius: 99, background: `${tint}14` }} />
        <div style={{ position: "relative", width: 50, height: 50, borderRadius: 13, background: `${tint}1f`, color: tint, display: "grid", placeItems: "center", marginBottom: 16 }}>
          {mascot ? <Image src="/brand/mascots/rex-1.png" alt="Rex" width={42} height={42} style={{ objectFit: "contain" }} /> : <Icon name={icon ?? "grid"} size={24} color="currentColor" />}
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", color: tint, marginBottom: 6 }}>{eyebrow}</div>
        <h3 style={{ fontSize: 19, fontWeight: 800, letterSpacing: 0, marginBottom: 8 }}>{title}</h3>
        <p style={{ fontSize: 13.5, color: T.textSec, lineHeight: 1.55, marginBottom: 18 }}>{body}</p>
        <Button variant="soft" icon="arrow">{cta}</Button>
      </Card>
    </Link>
  );
}

function ProductGlyph({ tint, icon = "edit" }: { tint: string; icon?: IconName }) {
  return (
    <div style={{ width: 64, height: 64, borderRadius: 10, background: `radial-gradient(120% 120% at 35% 25%, ${tint}, ${tint}66)`, display: "grid", placeItems: "center", color: "#fff", flexShrink: 0 }}>
      <Icon name={icon} size={24} color="currentColor" />
    </div>
  );
}

function statusColor(status: string) {
  if (status === "Published") return T.green;
  if (status === "Scheduled") return T.blue;
  return T.muted;
}

export function StoreBuilderStandalone({ storeName, storeDomain }: PortalProps) {
  const domain = storeDomain ?? "yourstore.shopinbos.com";
  return (
    <Shell>
      <main style={{ padding: "28px 32px", maxWidth: 1300, margin: "0 auto" }}>
        <PageHead title="Your store" sub={`Design, build and manage your storefront - ${domain}.`}>
          <Button href={`/s/${domain.split(".")[0]}`} variant="ghost" icon="globe">Visit live store</Button>
        </PageHead>
        <div style={{ borderRadius: T.radius, padding: "18px 22px", display: "flex", alignItems: "center", gap: 16, border: `1px solid ${T.mintBorder}`, background: "linear-gradient(100deg,#E4F4F0,#F0F9F6)", marginBottom: 22 }}>
          <span style={{ width: 10, height: 10, borderRadius: 99, background: T.green, boxShadow: `0 0 0 4px ${T.green}33` }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{storeName} is live</div>
            <div style={{ fontSize: 13, color: T.textSec }}>Last published 2 days ago - Minimal theme - 8 sections</div>
          </div>
          <Button href="/builder/editor" variant="soft" icon="eye">Preview</Button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18, marginBottom: 22 }}>
          <BigCard href="/builder/rex" tint={T.mint} mascot="rex" eyebrow="AI BUILDER" title="Build with Rex" body="Describe your shop in a sentence. Rex designs the brand, writes copy and generates products - live." cta="Open Rex builder" />
          <BigCard href="/builder/editor" tint={T.purple} icon="edit" eyebrow="MANUAL EDITOR" title="Customise everything" body="Drag, drop and style every block. Full control over layout, type, colour and content like a pro page builder." cta="Open store editor" />
          <BigCard href="/builder/templates" tint={T.yellow} icon="grid" eyebrow="THEME GALLERY" title="Start from a theme" body="Pick from mobile-first templates across every industry. Rex adapts it to your brand." cta="Browse themes" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18 }}>
          <Card style={{ padding: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 14 }}>Pages</h3>
            {[
              ["home", "Home", "Published"],
              ["store", "Shop", "Published"],
              ["user", "About", "Published"],
              ["chat", "Contact", "Published"],
              ["document", "Policies", "Draft"],
            ].map(([ic, title, status]) => (
              <div key={title} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 0", borderTop: `1px solid ${T.border}` }}>
                <Icon name={ic as IconName} size={16} color={T.mint} />
                <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700 }}>{title}</span>
                <Badge color={status === "Published" ? T.green : T.muted}>{status}</Badge>
                <Button href="/builder/editor" variant="ghost" icon="edit">Edit</Button>
              </div>
            ))}
            <div style={{ marginTop: 12 }}><Button href="/seller/pages" variant="soft" icon="plus">Add page</Button></div>
          </Card>
          <Card style={{ padding: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 14 }}>Store settings</h3>
            {[
              ["globe", "Domain", domain],
              ["palette", "Brand kit", "Minimal - Amethyst"],
              ["search", "SEO", "Optimised - 92/100"],
              ["link", "Navigation", "Main + footer menus"],
              ["lock", "Legal pages", "Privacy, terms, returns"],
            ].map(([ic, title, value]) => (
              <div key={title} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 0", borderTop: `1px solid ${T.border}` }}>
                <Icon name={ic as IconName} size={16} color={T.textSec} />
                <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700 }}>{title}</span>
                <span style={{ fontSize: 12, color: T.muted }}>{value}</span>
                <Icon name="chevRight" size={15} color={T.muted} />
              </div>
            ))}
          </Card>
        </div>
      </main>
    </Shell>
  );
}

export function RexBuilderStandalone({ storeName, storeDomain }: PortalProps) {
  return (
    <Shell>
      <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", minHeight: "100vh" }}>
        <aside style={{ background: T.surface, borderRight: `1px solid ${T.border}`, padding: 18, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <Image src="/brand/mascots/rex-1.png" alt="Rex" width={38} height={38} style={{ width: 38, height: 38, objectFit: "contain", flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 900 }}>Rex AI Builder</div>
              <div style={{ fontSize: 11.5, color: T.textSec }}>Live</div>
            </div>
            <Badge color={T.mint} dot>Live</Badge>
          </div>
          <p style={{ fontSize: 12.5, color: T.textSec, lineHeight: 1.5, marginBottom: 14 }}>
            Tell Rex what kind of store you want. Describe your products, brand or style and Rex will design and build it.
          </p>
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            {["Chat", "AI Tools", "History"].map((tab, index) => (
              <button key={tab} style={{ flex: 1, border: "none", borderBottom: `2px solid ${index === 0 ? T.mint : "transparent"}`, background: index === 0 ? T.mintBg : "transparent", color: index === 0 ? T.text : T.muted, padding: "10px 6px", fontSize: 12.5, fontWeight: 800 }}>{tab}</button>
            ))}
          </div>
          <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 9 }}>
              <Image src="/brand/mascots/rex-1.png" alt="Rex" width={28} height={28} style={{ width: 28, height: 28, objectFit: "contain", flexShrink: 0 }} />
              <div style={{ background: T.surface2, border: `1px solid ${T.border}`, padding: "12px 15px", borderRadius: "4px 14px 14px 14px", fontSize: 13, lineHeight: 1.55 }}>
                I built {storeName} and I keep editing it for you. Tell me what to change and watch it happen live.
              </div>
            </div>
            {["Make the hero more premium", "Add a product grid", "Rewrite the About page", "Create a Mother's Day banner"].map((chip) => (
              <button key={chip} style={{ alignSelf: "flex-start", padding: "7px 11px", borderRadius: 99, fontSize: 11.5, fontWeight: 800, background: T.mintBg, color: T.mintDeep, border: `1px solid ${T.mintBorder}` }}>{chip}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", border: `1px solid ${T.border}`, borderRadius: 12, padding: "9px 10px", background: T.surface2 }}>
            <input placeholder="Tell Rex what to change..." style={{ flex: 1, background: "none", border: "none", fontSize: 13.5, outline: "none" }} />
            <Icon name="send" size={17} color={T.mint} />
          </div>
          <div style={{ fontSize: 11, color: T.faint, textAlign: "center", marginTop: 8 }}>Rex edits the live preview. Nothing publishes until you hit Publish.</div>
        </aside>
        <main style={{ padding: 22, overflow: "auto" }}>
          <PageHead title="Live store preview" sub={`${storeDomain ?? "yourstore.shopinbos.com"} - draft changes`}>
            <Button href="/builder/editor" variant="ghost" icon="undo">Undo</Button>
            <Button href="/builder/editor" icon="check">Publish</Button>
          </PageHead>
          <Card style={{ overflow: "hidden" }}>
            <div style={{ height: 42, borderBottom: `1px solid ${T.border}`, background: T.surface2, display: "flex", alignItems: "center", gap: 7, padding: "0 14px" }}>
              <span style={{ width: 10, height: 10, borderRadius: 99, background: "#FF6B6B" }} />
              <span style={{ width: 10, height: 10, borderRadius: 99, background: "#FBBF24" }} />
              <span style={{ width: 10, height: 10, borderRadius: 99, background: T.green }} />
            </div>
            <div style={{ minHeight: 650, background: "#fff", padding: 42 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 70 }}>
                <strong style={{ fontSize: 20 }}>{storeName}</strong>
                <div style={{ display: "flex", gap: 22, fontSize: 13, color: T.textSec }}><span>Shop</span><span>About</span><span>Blog</span><span>Contact</span></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1.05fr .95fr", gap: 36, alignItems: "center" }}>
                <div>
                  <Badge color={T.mint}>NEW COLLECTION</Badge>
                  <h2 style={{ fontSize: 54, lineHeight: .95, fontWeight: 900, letterSpacing: 0, margin: "18px 0 16px" }}>Glow-ready essentials for every shelf.</h2>
                  <p style={{ fontSize: 16, color: T.textSec, lineHeight: 1.65, maxWidth: 520 }}>Rex drafts the layout, copy and product story while you keep full control over every section.</p>
                </div>
                <div style={{ aspectRatio: "4/4.2", borderRadius: 24, background: "radial-gradient(120% 120% at 35% 25%, #A78BFA, #34D39966)", display: "grid", placeItems: "center", color: "#fff" }}>
                  <Icon name="sparkle" size={72} color="currentColor" />
                </div>
              </div>
            </div>
          </Card>
        </main>
      </div>
    </Shell>
  );
}

export function CmsStandalone({ storeName, storeDomain, pages = [], posts = [], publishedPages = 0, publishedPosts = 0, initialTab = "posts" }: PortalProps) {
  const [tab, setTab] = useState<"posts" | "pages">(initialTab);
  const pageRows = pages;
  return (
    <Shell>
      <main style={{ padding: "28px 32px", maxWidth: 1400, margin: "0 auto" }}>
        <PageHead title="Pages & Blog" sub={`Manage your storefront pages and content - ${storeDomain ?? "your shop"} CMS.`}>
          <Button href={tab === "posts" ? "/home/cms/blog" : "/builder/editor"} icon="plus">{tab === "posts" ? "Write a post" : "Add page"}</Button>
        </PageHead>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, marginBottom: 18 }}>
          <StatCard label="Published pages" value={String(publishedPages || pageRows.filter((p) => p.status === "Published").length)} icon="document" tint={T.mint} />
          <StatCard label="Blog posts" value={String(posts.length)} sub={`+ ${publishedPosts || posts.filter((p) => p.status === "Published").length} live`} icon="edit" tint={T.purple} />
          <StatCard label="Blog views (30d)" value="0" icon="eye" tint={T.yellow} />
          <StatCard label="Avg. read time" value="-" icon="clock" tint={T.blue} />
        </div>
        <Tabs value={tab} onChange={setTab} postCount={posts.length} pageCount={pageRows.length} />
        {tab === "posts" ? <PostsPanel posts={posts} /> : <PagesPanel pages={pageRows} />}
      </main>
    </Shell>
  );
}

export function PagesStandalone(props: PortalProps) {
  return <CmsStandalone {...props} posts={props.posts ?? []} initialTab="pages" />;
}

function Tabs({ value, onChange, postCount, pageCount }: { value: string; onChange: (value: "posts" | "pages") => void; postCount: number; pageCount: number }) {
  const tabs: Array<["posts" | "pages", string, number]> = [["posts", "Blog posts", postCount], ["pages", "Pages", pageCount]];
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 18, borderBottom: `1px solid ${T.border}`, overflowX: "auto" }}>
      {tabs.map(([id, label, count]) => (
        <button key={id} onClick={() => onChange(id)} style={{ padding: "11px 16px", fontSize: 13.5, fontWeight: value === id ? 800 : 600, color: value === id ? T.text : T.muted, background: "none", border: "none", borderBottom: `2px solid ${value === id ? T.mint : "transparent"}` }}>
          {label} <span style={{ color: T.faint }}>({count})</span>
        </button>
      ))}
    </div>
  );
}

function PostsPanel({ posts }: { posts: PostRow[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: 18, alignItems: "start" }}>
      <Card style={{ overflow: "hidden" }}>
        <div style={{ display: "flex", gap: 10, padding: "14px 16px", alignItems: "center", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Icon name="search" size={15} color={T.muted} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input placeholder="Search posts..." style={{ width: "100%", padding: "8px 12px 8px 34px", borderRadius: 9, background: T.surface2, border: `1px solid ${T.border}`, fontSize: 13 }} />
          </div>
          <Button variant="ghost">All categories</Button>
          <Button variant="ghost">All status</Button>
        </div>
        {posts.length === 0 ? (
          <div style={{ padding: 28, textAlign: "center", color: T.muted, fontSize: 13 }}>
            No blog posts yet.
          </div>
        ) : posts.map((p, i) => (
          <div key={p.id} style={{ display: "flex", gap: 14, padding: "15px 18px", borderBottom: i < posts.length - 1 ? `1px solid ${T.border}` : "none", alignItems: "flex-start" }}>
            <ProductGlyph tint={p.tint} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}><Badge color={statusColor(p.status)} dot>{p.status}</Badge><span style={{ fontSize: 11.5, color: T.muted }}>{p.category}</span></div>
              <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 3 }}>{p.title}</div>
              <p style={{ fontSize: 12.5, color: T.textSec, lineHeight: 1.5, marginBottom: 8, maxWidth: 560 }}>{p.excerpt}</p>
              <div style={{ display: "flex", gap: 14, fontSize: 11.5, color: T.muted, alignItems: "center", flexWrap: "wrap" }}>
                <span>{p.date}</span><span>{p.views} views</span><span>{p.comments} comments</span><span>{p.read} read</span>
              </div>
            </div>
            <Icon name="moreHorizontal" size={18} color={T.muted} />
          </div>
        ))}
      </Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Card style={{ padding: 18, background: "linear-gradient(150deg,#E6F6F2,#F3FAF8)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <Image src="/brand/mascots/rex-1.png" alt="Rex" width={40} height={40} />
            <div><div style={{ fontSize: 14.5, fontWeight: 900 }}>Rex writes your blog</div><div style={{ fontSize: 11.5, color: T.textSec }}>SEO posts in your voice</div></div>
          </div>
          <p style={{ fontSize: 12.5, color: T.textSec, lineHeight: 1.5, marginBottom: 12 }}>Give Rex a topic and he will draft a full post - title, body, meta description and a featured image.</p>
          <Button href="/home/cms/blog" icon="sparkle">Generate a post</Button>
        </Card>
        <Card style={{ padding: 18 }}>
          <h3 style={{ fontSize: 14.5, fontWeight: 800, marginBottom: 12 }}>Top posts this month</h3>
          {posts.length === 0 ? (
            <div style={{ color: T.muted, fontSize: 12.5 }}>No post data yet.</div>
          ) : posts.slice(0, 3).map((p, i) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i ? `1px solid ${T.border}` : "none" }}>
              <span style={{ fontSize: 18, fontWeight: 900, color: T.faint, width: 20 }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</div><div style={{ fontSize: 11, color: T.muted }}>{p.views} views</div></div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

function PagesPanel({ pages }: { pages: PageRow[] }) {
  return (
    <Card style={{ overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1.3fr 1fr 1fr .8fr 100px", gap: 10, padding: "12px 20px", borderBottom: `1px solid ${T.border}`, fontSize: 11, fontWeight: 800, color: T.muted, textTransform: "uppercase", letterSpacing: ".04em" }}>
        <span>Page</span><span>URL</span><span>Template</span><span>Last edited</span><span>Views</span><span />
      </div>
      {pages.length === 0 ? (
        <div style={{ padding: 28, textAlign: "center", color: T.muted, fontSize: 13 }}>
          No storefront pages yet.
        </div>
      ) : pages.map((p, i) => (
        <div key={p.id} style={{ display: "grid", gridTemplateColumns: "2fr 1.3fr 1fr 1fr .8fr 100px", gap: 10, padding: "13px 20px", borderBottom: i < pages.length - 1 ? `1px solid ${T.border}` : "none", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: T.mintBg, color: T.mint, display: "grid", placeItems: "center" }}><Icon name={p.type === "home" ? "home" : "document"} size={15} color="currentColor" /></div>
            <div><div style={{ fontSize: 13.5, fontWeight: 700 }}>{p.title}</div><Badge color={statusColor(p.status)}>{p.status}</Badge></div>
          </div>
          <span style={{ fontSize: 12.5, color: T.textSec, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>/{p.slug}</span>
          <span style={{ fontSize: 12.5, color: T.textSec }}>{p.type}</span>
          <span style={{ fontSize: 12.5, color: T.muted }}>{p.updated}</span>
          <span style={{ fontSize: 12.5, color: T.muted }}>{p.views ?? "-"}</span>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Link href={`/home/editor?page=${p.id}`} aria-label={`Edit ${p.title}`}><Icon name="edit" size={16} color={T.textSec} /></Link>
            <Icon name="moreHorizontal" size={16} color={T.muted} />
          </div>
        </div>
      ))}
      <div style={{ padding: "14px 20px", borderTop: `1px solid ${T.border}` }}><Button href="/home/editor" variant="soft" icon="plus">Add new page</Button></div>
    </Card>
  );
}
