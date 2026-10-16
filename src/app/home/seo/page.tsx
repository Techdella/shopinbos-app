import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace, parseBrandSettings } from "@/lib/workspace";
import { saveStoreSeoSettings, saveStoreIntegrationSettings } from "@/app/actions/workspace";
import { PageToast } from "@/components/PageToast";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { Card, CardHead, FilterChips, Pill } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { SetupHelpRequest } from "@/components/support/SetupHelpRequest";
import { AdvancedFold } from "@/components/simple/Fold";
import { FIELD_HELP, FIELD_INPUT, FIELD_LABEL, FIELD_TEXTAREA, SUBMIT_ACCENT } from "@/components/seller-settings/fields";
import { getT } from "@/lib/i18n/server";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import type { ReactNode } from "react";
import { SeoImageField } from "@/components/seo/SeoImageField";
import { storeHiddenFromSearch } from "@/lib/seo/indexing";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT("store");
  return { title: t("seo.title") };
}

// Puts a styled piece (code, bold path, link) where the translated sentence has its placeholder.
const SLOT = "\u0001";
function slot(text: string, node: ReactNode) {
  const [before, after = ""] = text.split(SLOT);
  return <>{before}{node}{after}</>;
}

type SeoPageProps = { searchParams?: Promise<{ saved?: string; tab?: string }> };

export default async function SeoSettingsPage({ searchParams }: SeoPageProps) {
  const params = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const t = await getT("store");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace?.store) redirect("/onboarding?role=seller");

  const store = workspace.store;
  const settings = parseBrandSettings(store.brandSettings);
  const seo = settings.seo && typeof settings.seo === "object" ? (settings.seo as Record<string, string>) : {};
  const integrations =
    settings.integrations && typeof settings.integrations === "object"
      ? (settings.integrations as Record<string, string>)
      : {};

  const hiddenFromSearch = storeHiddenFromSearch(settings);
  const activeTab = params?.tab === "integrations" ? "integrations" : "seo";
  const previewImage = seo.socialImage || store.logoUrl;
  const storeAddress = buildStorefrontUrl({ slug: store.slug, customDomain: store.customDomain ?? null }).replace(/^https?:\/\//, "").replace(/\/$/, "");

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("seo.title")}
      sub={t("seo.sub")}
    >
      <PageToast />
      <div className="grid gap-5">
        {params?.saved && <Notice tone="success">{t("seo.saved")}</Notice>}

        <FilterChips
          items={[
            { label: t("seo.tab.listing"), href: "/home/seo", active: activeTab === "seo" },
            { label: t("seo.tab.google"), href: "/home/seo?tab=integrations", active: activeTab === "integrations" },
          ]}
        />

        {activeTab === "seo" ? (
          <form action={saveStoreSeoSettings} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="grid min-w-0 content-start gap-5">
              <Card className="p-5">
                <CardHead title={t("seo.listing")} sub={t("seo.listingSub")} />
                <div className="mt-4 grid gap-4">
                  <div>
                    <label htmlFor="seoTitle" className={FIELD_LABEL}>{t("seo.field.title")}</label>
                    <input id="seoTitle" name="seoTitle" className={FIELD_INPUT} placeholder={store.name} defaultValue={seo.title ?? store.name} maxLength={70} />
                    <p className={FIELD_HELP}>{t("seo.titleHelp")}</p>
                  </div>
                  <div>
                    <label htmlFor="seoDescription" className={FIELD_LABEL}>{t("seo.field.description")}</label>
                    <textarea
                      id="seoDescription"
                      name="seoDescription"
                      className={FIELD_TEXTAREA}
                      placeholder={t("seo.descPh")}
                      rows={3}
                      defaultValue={seo.description ?? store.description ?? ""}
                      maxLength={180}
                    />
                    <p className={FIELD_HELP}>{t("seo.descHelp")}</p>
                  </div>
                  <div>
                    <label htmlFor="seoKeywords" className={FIELD_LABEL}>{t("seo.field.keywords")}</label>
                    <input id="seoKeywords" name="seoKeywords" className={FIELD_INPUT} placeholder={t("seo.keywordsPh")} defaultValue={seo.keywords ?? ""} />
                    <p className={FIELD_HELP}>{t("seo.commas")}</p>
                  </div>
                </div>
              </Card>

              <Card className="p-5">
                <CardHead title={t("seo.linkPreview")} sub={t("seo.linkPreviewSub")} />
                <div className="mt-4">
                  <SeoImageField name="socialImage" label={t("seo.imageLink")} help={t("seo.imageHelp")} initialUrl={seo.socialImage ?? store.logoUrl ?? ""} />
                </div>
              </Card>

              <Card className="p-5">
                <CardHead title={t("seo.favicon")} sub={t("seo.faviconSub")} />
                <div className="mt-4">
                  <SeoImageField name="favicon" shape="square" label={t("seo.faviconLabel")} help={t("seo.faviconHelp")} initialUrl={seo.favicon ?? ""} />
                </div>
              </Card>

              <Card className="p-5">
                <CardHead title={t("seo.visibility")} sub={t("seo.visibilitySub")} />
                <label className="mt-4 flex cursor-pointer items-start gap-2.5">
                  <input type="checkbox" name="hideFromSearch" defaultChecked={hiddenFromSearch} className="mt-1 h-4 w-4 shrink-0" />
                  <span>
                    <strong className="text-[14px]">{t("seo.hideFromSearch")}</strong>
                    <span className={`block ${FIELD_HELP}`}>{t("seo.hideFromSearchHelp")}</span>
                  </span>
                </label>
              </Card>

              <div>
                <button className={SUBMIT_ACCENT} type="submit">{t("seo.saveSearch")}</button>
              </div>
            </div>

            <aside className="grid min-w-0 content-start gap-5">
              <Card className="p-5">
                <CardHead title={t("seo.onGoogle")} />
                <div className="mt-3 rounded-[14px] border border-app-line p-3">
                  <div className="truncate text-[12px] text-app-ink-soft">{storeAddress}</div>
                  <div className="truncate text-[15px] font-medium leading-snug text-[#1a0dab]">{seo.title ?? store.name}</div>
                  <div className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-[#545454]">{seo.description ?? store.description ?? t("seo.addDesc")}</div>
                </div>
                <p className={FIELD_HELP}>{t("seo.showsSaved")}</p>
                {hiddenFromSearch && <p className={`${FIELD_HELP} font-bold text-app-ink`}>{t("seo.hiddenNotice")}</p>}
              </Card>
              {previewImage && (
                <Card className="overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewImage} alt={t("seo.previewAlt")} className="block aspect-[1200/630] w-full object-cover" />
                  <div className="border-t border-app-line px-4 py-3">
                    <div className="text-[12px] uppercase text-app-ink-soft">{storeAddress.split("/")[0]}</div>
                    <div className="mt-0.5 truncate text-[14px] font-extrabold">{seo.title ?? store.name}</div>
                    <div className="mt-0.5 line-clamp-2 text-[12.5px] text-app-ink-soft">{seo.description ?? store.description ?? ""}</div>
                  </div>
                </Card>
              )}
            </aside>
          </form>
        ) : (
          <div className="grid gap-5">
          <SetupHelpRequest
            title={t("seo.help.title")}
            description={t("seo.help.desc")}
            feature="google_tracking"
            softwareQuestion={t("seo.help.question")}
            softwarePlaceholder={t("seo.help.placeholder")}
          />
          <AdvancedFold label={t("seo.advanced")} hint={integrations.googleAnalyticsId || integrations.gaSiteVerification ? t("seo.someSaved") : t("seo.forManager")}>
          <form action={saveStoreIntegrationSettings} className="grid gap-5">
            <div className="grid gap-5 xl:grid-cols-2">
              <Card className="min-w-0 p-5">
                <CardHead
                  title="Google Analytics 4"
                  sub={t("seo.ga.sub")}
                  action={<Pill tone={integrations.googleAnalyticsId ? "success" : "muted"} dot>{integrations.googleAnalyticsId ? t("seo.connected") : t("seo.notSet")}</Pill>}
                />
                <p className="mb-0 mt-3 text-[13.5px] leading-[1.5] text-app-ink-soft">
                  {slot(t("seo.ga.find", { path: SLOT }), <strong className="text-app-ink">Google Analytics → Admin → Data streams → Web stream</strong>)}
                </p>
                <div className="mt-4">
                  <label htmlFor="googleAnalyticsId" className={FIELD_LABEL}>Measurement ID</label>
                  <input id="googleAnalyticsId" name="googleAnalyticsId" className={FIELD_INPUT} placeholder="G-XXXXXXXXXX" defaultValue={integrations.googleAnalyticsId ?? ""} pattern="G-[A-Z0-9]+" />
                  <p className={FIELD_HELP}>{slot(t("seo.ga.help", { code: SLOT }), <code>G-XXXXXXXXXX</code>)}</p>
                </div>
              </Card>

              <Card className="min-w-0 p-5">
                <CardHead
                  title="Google Search Console"
                  sub={t("seo.gsc.sub")}
                  action={<Pill tone={integrations.gaSiteVerification ? "success" : "muted"} dot>{integrations.gaSiteVerification ? t("seo.tagSet") : t("seo.notSet")}</Pill>}
                />
                <p className="mb-0 mt-3 text-[13.5px] leading-[1.5] text-app-ink-soft">
                  {slot(t("seo.gsc.how", { tag: SLOT }), <strong className="text-app-ink">HTML tag</strong>)}
                </p>
                <div className="mt-4">
                  <label htmlFor="gaSiteVerification" className={FIELD_LABEL}>{t("seo.verifyCode")}</label>
                  <input id="gaSiteVerification" name="gaSiteVerification" className={FIELD_INPUT} placeholder={t("seo.verifyPh")} defaultValue={integrations.gaSiteVerification ?? ""} />
                  <p className={`${FIELD_HELP} break-words`}>
                    {(() => {
                      const [before, middle = "", after = ""] = t("seo.copyOnly", { content: SLOT, example: SLOT }).split(SLOT);
                      return <>{before}<code>content=&quot;...&quot;</code>{middle}<code>{"<meta name=\"google-site-verification\" content=\"PASTE_THIS_PART\" />"}</code>{after}</>;
                    })()}
                  </p>
                </div>
              </Card>
            </div>

            <Card className="p-5">
              <CardHead title="Google Merchant Center" action={<Pill tone="success" dot>{t("seo.ready")}</Pill>} />
              <p className="mb-0 mt-2 text-[14px] leading-[1.55] text-app-ink-soft">
                {slot(t("seo.merchant", { link: SLOT }), <a href="/channels#google" className="font-bold underline">{t("seo.sellEverywhere")}</a>)}
              </p>
            </Card>

            <div>
              <button className={SUBMIT_ACCENT} type="submit">{t("seo.saveGoogle")}</button>
            </div>
          </form>
          </AdvancedFold>
          </div>
        )}
      </div>
    </SellerPage>
  );
}
