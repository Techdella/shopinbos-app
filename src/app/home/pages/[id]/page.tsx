import { buildStorefrontOrigin } from "@/lib/domains/storefront";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { AppFrame } from "@/components/shell/AppFrame";
import { TextLink } from "@/components/app-kit";
import { PageDetailsClient } from "./PageDetailsClient";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function PageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace?.store) notFound();

  const page = await db.storePage.findFirst({ where: { id, storeId: workspace.store.id } });
  if (!page) notFound();

  const storeName = workspace.store.name;
  const t = await getT("store");

  // The client renders the page heading itself because the title is editable there.
  return (
    <AppFrame
      role="seller"
      storeName={storeName}
      storeSlug={workspace.store.slug}
      storeInitial={storeName.charAt(0).toUpperCase()}
      storeLogoUrl={workspace.store.logoUrl}
      userName={user.name}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <div className="w-full px-4 py-6 font-app text-app-ink sm:px-6 xl:px-8 2xl:px-10">
        <div className="mb-4">
          <TextLink href="/home/pages">{t("pages.allPages")}</TextLink>
        </div>
        <PageDetailsClient
          page={JSON.parse(JSON.stringify(page))}
          storeId={workspace.store.id}
          storeSlug={workspace.store.slug}
          storeBase={buildStorefrontOrigin(workspace.store)}
          storeStatus={workspace.store.status}
        />
      </div>
    </AppFrame>
  );
}
