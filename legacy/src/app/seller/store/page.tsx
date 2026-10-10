import { redirect } from "next/navigation";
import { AppFrame } from "@/components/shell/AppFrame";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { StoreStartClient } from "./StoreStartClient";

export const dynamic = "force-dynamic";

export default async function SellerStorePage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace?.store) redirect("/onboarding?role=seller");

  const store = workspace.store;
  const bs = (store as any).brandSettings as Record<string, unknown> | null;
  const editor = bs?.editor && typeof bs.editor === "object" ? bs.editor as Record<string, unknown> : null;
  const hasContent = !!(editor?.draft || bs?.draft || bs?.template);
  const publishedPages = await db.storePage.findMany({
    where: { storeId: store.id },
    orderBy: { order: "asc" },
    select: {
      id: true,
      type: true,
      title: true,
      slug: true,
      isPublished: true,
      order: true,
    },
  });
  const isLive = Boolean(editor?.published) || publishedPages.some((page) => page.isPublished);

  return (
    <AppFrame
      role="seller"
      storeName={store.name}
      storeSlug={store.slug}
      storeInitial={store.name?.[0]?.toUpperCase()}
      storeLogoUrl={store.logoUrl}
      userName={user.name ?? "You"}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <StoreStartClient
        storeName={store.name}
        storeSlug={store.slug}
        hasContent={hasContent}
        isLive={isLive}
        pages={publishedPages.map((page) => ({
          id: page.id,
          type: page.type,
          title: page.title,
          slug: page.slug,
          isPublished: page.isPublished,
        }))}
      />
    </AppFrame>
  );
}
