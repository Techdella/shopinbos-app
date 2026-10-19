import { notFound } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { getSellerWorkspace } from "@/lib/workspace";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { PillLink } from "@/components/app-kit";
import { buildStorefrontOrigin } from "@/lib/domains/storefront";
import { readFields } from "@/lib/cms/fields";
import { ItemEditor, type EditorItem } from "./ItemEditor";
import { formatDate } from "@shared/i18n";
import { getLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function CmsItemPage({ params }: { params: Promise<{ collectionId: string; itemId: string }> }) {
  const { collectionId, itemId } = await params;
  const user = await requireRole(["seller"], "/login");
  const t = await getT("cms");
  const locale = await getLocale();
  const workspace = await getSellerWorkspace(user.id);
  const store = workspace?.store;
  if (!store) notFound();

  const collection = await db.cmsCollection.findFirst({ where: { id: collectionId, storeId: store.id } });
  if (!collection) notFound();
  const isNew = itemId === "new";
  const row = isNew ? null : await db.cmsItem.findFirst({ where: { id: itemId, collectionId: collection.id } });
  if (!isNew && !row) notFound();
  const others = await db.cmsCollection.findMany({ where: { storeId: store.id }, select: { id: true, name: true } });

  const item: EditorItem = row
    ? {
        id: row.id,
        title: row.title,
        slug: row.slug,
        status: row.status === "published" || row.status === "scheduled" ? row.status : "draft",
        publishAt: row.publishAt?.toISOString() ?? null,
        author: row.author,
        featuredImage: row.featuredImage,
        excerpt: row.excerpt,
        data: (row.data ?? {}) as Record<string, unknown>,
        seo: row.seo,
        sortOrder: row.sortOrder,
        createdBy: row.createdBy,
      }
    : { id: null, title: "", slug: "", status: "draft", publishAt: null, author: "", featuredImage: null, excerpt: "", data: {}, seo: {}, sortOrder: await db.cmsItem.count({ where: { collectionId: collection.id } }), createdBy: "seller" };

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={row ? row.title : t("newItem", { label: collection.itemLabel.toLowerCase() })}
      sub={`${collection.name} · ${row ? t("item.lastSaved", { date: formatDate(row.updatedAt, locale, { dateStyle: "medium", timeStyle: "short" }) }) : t("item.notSaved")}`}
      actions={<PillLink href={`/home/cms/${collection.id}`} icon="arrowLeft">{t("item.all", { label: collection.itemLabel.toLowerCase() })}</PillLink>}
    >
      <ItemEditor
        collection={{ id: collection.id, name: collection.name, slug: collection.slug, itemLabel: collection.itemLabel, template: collection.template, isPublished: collection.isPublished }}
        fields={readFields(collection.fields)}
        item={JSON.parse(JSON.stringify(item))}
        storeOrigin={buildStorefrontOrigin({ slug: store.slug, customDomain: store.customDomain ?? null })}
        storeSlug={store.slug}
        storeName={store.name}
        authorName={user.name ?? ""}
        collections={others}
      />
    </SellerPage>
  );
}
