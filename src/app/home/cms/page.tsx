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
import { getT } from "@/lib/i18n/server";
import { buildStorefrontUrl } from "@/lib/domains/storefront";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT("cms");
  return { title: t("title") };
}

export default async function CmsPage() {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("cms");
  const workspace = await getSellerWorkspace(user.id);
  const store = workspace?.store ?? null;
  const collections = store ? await listCollections(store.id) : [];
  const taken = collections.map((collection) => collection.slug);

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("title")}
      sub={t("sub")}
      actions={
        <>
          {store && <PillLink href="/home/cms/plan" icon="calendar">{t("plan.title")}</PillLink>}
          <PillLink href={studioHref(REX_SETUP_PROMPT)} icon="sparkle">{t("askRexSetup")}</PillLink>
          {store && <NewCollectionButton takenSlugs={taken} />}
        </>
      }
    >
      <div className="grid gap-6">
        {!store ? (
          <Card className="p-6 text-[14.5px] text-app-ink-soft">{t("createStoreFirst")}</Card>
        ) : collections.length > 0 ? (
          <section aria-labelledby="cms-collections">
            <h2 id="cms-collections" className="sr-only">{t("yourCollections")}</h2>
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
                          <p className="m-0 truncate text-[13px] text-app-ink-soft">/{collection.slug} · {t("itemCount", { count: collection.itemCount, label: collection.itemLabel.toLowerCase() })} · {t("liveCount", { count: collection.liveCount })}{collection.isPublished ? "" : ` · ${t("hidden")}`}</p>
                        </div>
                      </div>
                      <p className="mb-0 mt-3 line-clamp-2 text-[13.5px] text-app-ink-soft">
                        {fields.length ? fields.slice(0, 6).map((field) => `${field.label} (${t.dynamic(`ftype.${field.type}`, FIELD_TYPE_INFO[field.type].label).toLowerCase()})`).join(", ") : t("noFields")}
                      </p>
                      <div className="mt-auto flex flex-wrap gap-2 pt-4">
                        <PillLink href={`/home/cms/${collection.id}/new`} size="sm" tone="ink" icon="plus">{t("newItem", { label: collection.itemLabel.toLowerCase() })}</PillLink>
                        <PillLink href={`/home/cms/${collection.id}`} size="sm" icon="list">{t("items")}</PillLink>
                        <PillLink href={`/home/cms/${collection.id}?tab=fields`} size="sm" icon="layers">{t("fields")}</PillLink>
                        {collection.liveCount > 0 && collection.isPublished && (
                          <a href={buildStorefrontUrl({ slug: store.slug, customDomain: store.customDomain ?? null }, `/${collection.slug}`)} target="_blank" rel="noreferrer" className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-app-line bg-white px-3.5 text-[13px] font-extrabold text-app-ink no-underline hover:border-app-line-strong">
                            <Icon name="eye" size={14} /> {t("view")}<span className="sr-only"> {t("viewInStore", { name: collection.name })}</span>
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
            <CardHead title={collections.length ? t("addAnother") : t("startFirst")} sub={t("pickTemplate")} className="mb-4" />
            <TemplateGallery takenSlugs={taken} />
          </Card>
        )}

        <AssistantNote who="rex" action={<PillLink href={studioHref(REX_SETUP_PROMPT)} size="sm" tone="ink">{t("askRex")}</PillLink>}>
          <strong>{t("rexLead")}</strong> {t("rexBody")}
        </AssistantNote>
        <AssistantNote who="peggy" action={<PillLink href="/home/peggy?ask=Write%20a%20blog%20post%20for%20my%20shop%20about%20" size="sm" tone="ink">{t("peggyWrite")}</PillLink>}>
          <strong>{t("peggyLead")}</strong> {t("peggyBody")}
        </AssistantNote>
        <p className="m-0 text-[13.5px] text-app-ink-soft">
          {(() => {
            const [before, after = ""] = t("lookingFor", { link: "\u0001" }).split("\u0001");
            return <>{before}<Link href="/home/pages" className="font-bold text-app-ink">{t("pagesLink")}</Link>{after}</>;
          })()}
        </p>
      </div>
    </SellerPage>
  );
}
