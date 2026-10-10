import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon, MascotAvatar } from "@/components/ui";
import Link from "next/link";

export const dynamic = "force-dynamic";

const tools = [
  {
    icon: "image" as const,
    title: "Logo Studio",
    description: "Generate a custom logo for your store using AI. Describe your brand style and get multiple options.",
    features: ["AI-generated logos", "Brand palette matching", "Multiple styles"],
    cta: "Create Logo",
    href: "/studio/logo",
  },
  {
    icon: "document" as const,
    title: "Page Builder",
    description: "Create and customize store pages with drag-and-drop. Pick from templates or start blank.",
    features: ["Drag-and-drop sections", "Template library", "Mobile responsive"],
    cta: "Build Pages",
    href: "/builder/editor",
  },
  {
    icon: "image" as const,
    title: "Image Generator",
    description: "Generate product photos, banners, and brand visuals with DALL-E AI. Describe what you need.",
    features: ["Product photography", "Banner creation", "Brand-consistent style"],
    cta: "Generate Images",
    href: "/studio/images",
  },
  {
    icon: "palette" as const,
    title: "Store Editor",
    description: "Full visual store editor with live preview. Edit colors, layout, content and publish instantly.",
    features: ["Live preview", "Theme customization", "One-click publish"],
    cta: "Open Editor",
    href: "/builder/editor",
  },
];

export default async function StudioPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);

  return (
    <AppFrame
      role="seller"
      storeName={workspace?.store?.name}
      storeSlug={workspace?.store?.slug ? `${workspace.store.slug}.shopinbos.shop` : undefined}
      storeInitial={workspace?.store?.name?.charAt(0)}
      userName={user.name}
      userInitials={user.name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2)}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead title="Build with Rex" sub="AI-powered store creation studio" />

        <div className="card" style={{
          padding: 18, display: "flex", gap: 16, alignItems: "flex-start",
          background: "linear-gradient(160deg, var(--teal-50), var(--teal-100))",
          border: "1px solid var(--teal-200)",
        }}>
          <MascotAvatar role="supplier" size={56} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--teal-800)", marginBottom: 2, fontFamily: "var(--font-display)" }}>
              Hey, I&apos;m Rex
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-600)" }}>
              I can help you build your store from scratch — logos, pages, images, and full store design. Pick a tool below and let&apos;s get started!
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
          {tools.map((tool) => (
            <div key={tool.title} className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--teal-100)", color: "var(--teal-700)", display: "grid", placeItems: "center" }}>
                  <Icon name={tool.icon} size={18} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink-900)", fontFamily: "var(--font-display)" }}>{tool.title}</div>
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--ink-600)" }}>{tool.description}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {tool.features.map((f) => <Badge key={f} variant="mint">{f}</Badge>)}
              </div>
              <div style={{ marginTop: "auto", paddingTop: 4 }}>
                <Link href={tool.href} className="dbtn dBtn-mint" style={{ textDecoration: "none" }}>
                  {tool.cta} <Icon name="arrow" size={14} />
                </Link>
              </div>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: "32px 24px", textAlign: "center" }}>
          <MascotAvatar role="supplier" size={48} variant={1} />
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink-900)", marginTop: 10 }}>No builds yet</div>
          <div style={{ fontSize: 13, color: "var(--ink-500)", marginTop: 4 }}>
            You haven&apos;t built anything yet. Pick a tool above to get started!
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
