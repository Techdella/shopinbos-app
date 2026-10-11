import Link from "next/link";
import { requireRole } from "@/lib/server-auth";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, Card, CardHead, PillLink } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { getSellerWorkspace } from "@/lib/workspace";
import { listCollections } from "@/lib/cms/server";
import { FIELD_TYPE_INFO, readFields } from "@/lib/cms/fields";
import { NewCollectionButton, TemplateGallery } from "./NewCollection";
import { REX_SETUP_PROMPT, TEMPLATE_ICON, studioHref } from "./shared";

export const dynamic = "force-dynamic";

export default async function CmsPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  const store = workspace?.store ?? null;
  const collections = store ? await listCollections(store.id) : [];
  const taken = collections.map((collection) => collection.slug);

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Content"
      sub="Collections of content for your store, like a blog, size guides, a recipe book or a course. Add the fields you need; every item gets its own page and search details."
      actions={
        <>
          <PillLink href={studioHref(REX_SETUP_PROMPT)} icon="sparkle">Ask Rex to set this up</PillLink>
          {store && <NewCollectionButton takenSlugs={taken} />}
        </>
      }
    >
      <div className="grid gap-6">
        {!store ? (
          <Card className="p-6 text-[14.5px] text-app-ink-soft">Create your store first, then come back to add content.</Card>
        ) : collections.length > 0 ? (
          <section aria-labelledby="cms-collections">
            <h2 id="cms-collections" className="sr-only">Your collections</h2>
            <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2 2xl:grid-cols-3">
              {collections.map((collection) => {
                const fields = readFields(collection.fields);
                return (
                  <li key={collection.id} className="min-w-0">
                    <Card className="flex h-full flex-col p-5">
                      <div className="flex items-start gap-3">
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-app-peach text-app-accent-ink"><Icon name={TEMPLATE_ICON[collection.template] ?? "layers"} size={19} /></span>
                        <div className="min-w-0 flex-1">
                          <Link href={`/home/cms/${collection.id}`} className="block truncate text-[17px] font-extrabold text-app-ink no-underline hover:underline">{collection.name}</Link>
                          <p className="m-0 truncate text-[13px] text-app-ink-soft">/{collection.slug} · {collection.itemCount} {collection.itemCount === 1 ? collection.itemLabel.toLowerCase() : `${collection.itemLabel.toLowerCase()}s`} · {collection.liveCount} live{collection.isPublished ? "" : " · hidden"}</p>
                        </div>
                      </div>
                      <p className="mb-0 mt-3 line-clamp-2 text-[13.5px] text-app-ink-soft">
                        {fields.length ? fields.slice(0, 6).map((field) => `${field.label} (${FIELD_TYPE_INFO[field.type].label.toLowerCase()})`).join(", ") : "No fields yet"}
                      </p>
                      <div className="mt-auto flex flex-wrap gap-2 pt-4">
                        <PillLink href={`/home/cms/${collection.id}/new`} size="sm" tone="ink" icon="plus">New {collection.itemLabel.toLowerCase()}</PillLink>
                        <PillLink href={`/home/cms/${collection.id}`} size="sm" icon="list">Items</PillLink>
                        <PillLink href={`/home/cms/${collection.id}?tab=fields`} size="sm" icon="layers">Fields</PillLink>
                        {collection.liveCount > 0 && collection.isPublished && (
                          <a href={`/s/${store.slug}/${collection.slug}`} target="_blank" rel="noreferrer" className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-app-line bg-white px-3.5 text-[13px] font-extrabold text-app-ink no-underline hover:border-app-line-strong">
                            <Icon name="eye" size={14} /> View<span className="sr-only"> {collection.name} in your store</span>
                          </a>
                        )}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {store && (
          <Card className="p-5">
            <CardHead title={collections.length ? "Add another collection" : "Start your first collection"} sub="Pick a template; you can change its fields after." className="mb-4" />
            <TemplateGallery takenSlugs={taken} />
          </Card>
        )}

        <AssistantNote who="rex" action={<PillLink href={studioHref(REX_SETUP_PROMPT)} size="sm" tone="ink">Ask Rex</PillLink>}>
          <strong>Rex can set this up for you.</strong> Tell him what you want, like &ldquo;a size guide for my dresses&rdquo; or &ldquo;a recipe book for my spices&rdquo;, and he builds the collection with the right fields and writes the first drafts.
        </AssistantNote>
        <AssistantNote who="peggy" action={<PillLink href="/home/peggy?ask=Write%20a%20blog%20post%20for%20my%20shop%20about%20" size="sm" tone="ink">Write with Peggy</PillLink>}>
          <strong>Peggy writes posts too.</strong> Give her a topic and she drafts a blog post with search details, saved as a draft for you to check.
        </AssistantNote>
        <p className="m-0 text-[13.5px] text-app-ink-soft">
          Looking for About, Contact or your home page? They are in <Link href="/home/pages" className="font-bold text-app-ink">Pages</Link>.
        </p>
      </div>
    </SellerPage>
  );
}
