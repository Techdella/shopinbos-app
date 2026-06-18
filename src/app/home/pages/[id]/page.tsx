import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageDetailsClient } from "./PageDetailsClient";

export const dynamic = "force-dynamic";

export default async function PageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace?.store) notFound();

  const page = await db.storePage.findFirst({ where: { id, storeId: workspace.store.id } });
  if (!page) notFound();

  const storeName = workspace.store.name;
  const storeSlug = workspace.store.slug ? `${workspace.store.slug}.shopinbos.shop` : undefined;

  return (
    <AppFrame
      role="seller"
      storeName={storeName}
      storeSlug={storeSlug}
      storeInitial={storeName.charAt(0).toUpperCase()}
      storeLogoUrl={workspace.store.logoUrl}
      userName={user.name}
      userInitials={user.name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2)}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Link href="/home/pages" style={{ color: "var(--ink-500)", fontSize: 13, textDecoration: "none", fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>
            ← Back to Pages
          </Link>
        </div>

        <PageDetailsClient
          page={JSON.parse(JSON.stringify(page))}
          storeId={workspace.store.id}
          storeSlug={workspace.store.slug}
          storeStatus={workspace.store.status}
        />
      </div>
    </AppFrame>
  );
}
