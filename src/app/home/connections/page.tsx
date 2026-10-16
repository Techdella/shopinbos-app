import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { Card, CardHead, Pill, PillLink, TextLink } from "@/components/app-kit";
import { FIELD_HELP, FIELD_INPUT, FIELD_LABEL, SUBMIT_ACCENT } from "@/components/seller-settings/fields";
import { buttonClass } from "@/components/growth/kit";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { INTEGRATION_KEYS, readIntegrations, sitemapUrl, type IntegrationKey } from "@/lib/storefront/integrations";
import { getSearchConsoleConnection, listSearchConsoleSites, searchConsoleConfigured } from "@/lib/search-console/google.server";
import { matchingSites } from "@/lib/search-console/pure";
import { chooseSearchConsoleProperty, disconnectSearchConsoleAction, saveConnections } from "@/app/actions/connections";
import { getT } from "@/lib/i18n/server";
import type { TFunction } from "@shared/i18n";
import type { MessageKey } from "@shared/i18n/catalog";

// Settings › Connections: Google Analytics 4, Google Tag Manager, Google Search Console (verification tag, the
// steps to add the store, its sitemap, and optional "Connect with Google"), Bing, Meta, TikTok and Pinterest.
// Saved in brandSettings.integrations; each ID is validated (src/lib/storefront/integrations.ts) and only ever
// added to live store pages.

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("traffic");
  return { title: t("conn.title") };
}

type ConnT = TFunction<MessageKey<"traffic"> | MessageKey<"common">>;
type Search = Promise<{ saved?: string; invalid?: string; google?: string }>;

const GOOGLE_STATUS = ["signed_in", "connected", "disconnected", "cancelled", "failed", "invalid_state", "not_configured", "bad_site"] as const;

function Field({ name, label, placeholder, value, help, invalid }: { name: IntegrationKey; label: string; placeholder: string; value: string; help: ReactNode; invalid: boolean }) {
  return (
    <div className="mt-4">
      <label htmlFor={name} className={FIELD_LABEL}>{label}</label>
      <input
        id={name}
        name={name}
        className={FIELD_INPUT}
        placeholder={placeholder}
        defaultValue={value}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={invalid || undefined}
        aria-describedby={`${name}-help`}
      />
      <p id={`${name}-help`} className={`${FIELD_HELP} break-words`}>{help}</p>
    </div>
  );
}

function Status({ on, t }: { on: boolean; t: ConnT }) {
  return <Pill tone={on ? "success" : "muted"} dot>{on ? t("conn.set") : t("conn.notSet")}</Pill>;
}

export default async function ConnectionsPage({ searchParams }: { searchParams: Search }) {
  const user = await requireRole(["seller"], "/login");
  const t: ConnT = await getT("traffic", "common");
  const params = await searchParams;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, brandSettings: true, customDomain: true } });
  if (!store) redirect("/onboarding?role=seller");

  const integrations = readIntegrations(store.brandSettings);
  const invalid = new Set((params.invalid ?? "").split(",").filter((key): key is IntegrationKey => (INTEGRATION_KEYS as string[]).includes(key)));
  const freeUrl = buildStorefrontUrl({ slug: store.slug, customDomain: null });
  const ownUrl = store.customDomain ? buildStorefrontUrl({ slug: store.slug, customDomain: store.customDomain }) : null;
  const mainUrl = ownUrl ?? freeUrl;
  const prefixUrl = `${freeUrl.replace(/\/+$/, "")}/`;
  const domain = store.customDomain?.replace(/^www\./, "") ?? null;
  const hosts = [new URL(freeUrl).hostname, ...(store.customDomain ? [store.customDomain] : [])];

  // Optional "Connect with Google" for Search Console numbers.
  const googleReady = searchConsoleConfigured();
  const connection = googleReady ? await getSearchConsoleConnection(store.id) : null;
  let sites: Array<{ siteUrl: string; matches: boolean }> = [];
  let sitesError = "";
  if (connection && !connection.siteUrl) {
    try {
      sites = matchingSites(await listSearchConsoleSites(store.id), hosts);
    } catch (error) {
      sitesError = error instanceof Error ? error.message.slice(0, 160) : "";
    }
  }
  const googleStatus = GOOGLE_STATUS.find((status) => status === params.google);

  const code = (text: string) => <code className="break-all rounded-[6px] bg-app-canvas px-1.5 py-0.5 font-mono text-[12.5px]">{text}</code>;
  const fieldLabel = (key: IntegrationKey) => t.dynamic(`conn.field.${key}`, key);

  return (
    <SellerPage user={user} store={storeSummary(store)} title={t("conn.title")} sub={t("conn.sub")} actions={<PillLink href="/home/analytics/traffic" icon="chart">{t("conn.trafficLink")}</PillLink>}>
      <div className="grid gap-5">
        {params.saved && <p role="status" className="m-0 rounded-[14px] bg-app-success-tint px-4 py-3 text-[14px] text-app-success">{t("conn.saved")}</p>}
        {invalid.size > 0 && (
          <p role="alert" className="m-0 rounded-[14px] bg-app-danger-tint px-4 py-3 text-[14px] text-app-danger">
            {t("conn.invalid", { fields: [...invalid].map(fieldLabel).join(", ") })}
          </p>
        )}
        <p className="m-0 rounded-[14px] bg-app-canvas px-4 py-3 text-[13.5px] leading-[1.5] text-app-ink-soft">
          {t("conn.liveOnly")} {t("conn.addresses")}: {code(freeUrl)}{ownUrl ? <> · {code(ownUrl)}</> : null}
        </p>

        <form action={saveConnections} className="grid gap-5">
          <div className="grid gap-5 xl:grid-cols-2">
            <Card className="min-w-0 p-5">
              <CardHead title="Google Analytics 4" sub={t("conn.ga.sub")} action={<Status on={Boolean(integrations.googleAnalyticsId)} t={t} />} />
              <Field name="googleAnalyticsId" label={t("conn.field.googleAnalyticsId")} placeholder="G-XXXXXXXXXX" value={integrations.googleAnalyticsId} help={t("conn.ga.help")} invalid={invalid.has("googleAnalyticsId")} />
            </Card>

            <Card className="min-w-0 p-5">
              <CardHead title="Google Tag Manager" sub={t("conn.gtm.sub")} action={<Status on={Boolean(integrations.gtmContainerId)} t={t} />} />
              <Field name="gtmContainerId" label={t("conn.field.gtmContainerId")} placeholder="GTM-XXXXXXX" value={integrations.gtmContainerId} help={t("conn.gtm.help")} invalid={invalid.has("gtmContainerId")} />
            </Card>
          </div>

          <Card className="min-w-0 p-5">
            <div id="search-console" className="scroll-mt-24" />
            <CardHead title="Google Search Console" sub={t("conn.gsc.sub")} action={<Status on={Boolean(integrations.gaSiteVerification)} t={t} />} />
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="min-w-0">
                <Field name="gaSiteVerification" label={t("conn.field.gaSiteVerification")} placeholder="abc123…" value={integrations.gaSiteVerification} help={t("conn.gsc.codeHelp")} invalid={invalid.has("gaSiteVerification")} />
                <div className="mt-4 rounded-[14px] bg-app-canvas px-4 py-3">
                  <div className="text-[13px] font-bold">{t("conn.gsc.sitemap")}</div>
                  <div className="mt-1 text-[13.5px]">{code(sitemapUrl(mainUrl))}</div>
                  {ownUrl && <div className="mt-1 text-[13.5px]">{code(sitemapUrl(freeUrl))}</div>}
                </div>
              </div>
              <div className="min-w-0">
                <h3 className="m-0 mt-4 text-[14px] font-bold">{t("conn.gsc.stepsTitle")}</h3>
                <ol className="m-0 mt-2 grid gap-2 pl-5 text-[13.5px] leading-[1.55]">
                  <li>{t("conn.gsc.step1")}</li>
                  <li>{t("conn.gsc.step2Free", { url: prefixUrl })}</li>
                  {domain && <li>{t("conn.gsc.step2Domain", { domain })}</li>}
                  <li>{t("conn.gsc.step3")}</li>
                  <li>{t("conn.gsc.step4", { sitemap: sitemapUrl(mainUrl) })}</li>
                </ol>
                <p className="mb-0 mt-2 text-[12.5px] text-app-ink-soft">
                  <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" className="font-bold underline">search.google.com/search-console</a>
                </p>
              </div>
            </div>
          </Card>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card className="min-w-0 p-5">
              <CardHead title="Bing Webmaster Tools" sub={t("conn.bing.sub")} action={<Status on={Boolean(integrations.bingSiteVerification)} t={t} />} />
              <Field name="bingSiteVerification" label={t("conn.field.bingSiteVerification")} placeholder="0123456789ABCDEF0123456789ABCDEF" value={integrations.bingSiteVerification} help={t("conn.bing.help")} invalid={invalid.has("bingSiteVerification")} />
            </Card>

            <Card className="min-w-0 p-5">
              <CardHead title="Meta (Facebook, Instagram)" sub={t("conn.meta.sub")} action={<Status on={Boolean(integrations.metaPixelId || integrations.facebookDomainVerification)} t={t} />} />
              <Field name="metaPixelId" label={t("conn.field.metaPixelId")} placeholder="123456789012345" value={integrations.metaPixelId} help={t("conn.meta.pixelHelp")} invalid={invalid.has("metaPixelId")} />
              <Field name="facebookDomainVerification" label={t("conn.field.facebookDomainVerification")} placeholder="abcdefghijklmnopqrstuvwxyz1234" value={integrations.facebookDomainVerification} help={t("conn.meta.domainHelp")} invalid={invalid.has("facebookDomainVerification")} />
            </Card>

            <Card className="min-w-0 p-5">
              <CardHead title="TikTok Pixel" sub={t("conn.tiktok.sub")} action={<Status on={Boolean(integrations.tiktokPixelId)} t={t} />} />
              <Field name="tiktokPixelId" label={t("conn.field.tiktokPixelId")} placeholder="C4ABCDEF1234567890AB" value={integrations.tiktokPixelId} help={t("conn.tiktok.help")} invalid={invalid.has("tiktokPixelId")} />
            </Card>

            <Card className="min-w-0 p-5">
              <CardHead title="Pinterest" sub={t("conn.pinterest.sub")} action={<Status on={Boolean(integrations.pinterestSiteVerification)} t={t} />} />
              <Field name="pinterestSiteVerification" label={t("conn.field.pinterestSiteVerification")} placeholder="0123456789abcdef0123456789abcdef" value={integrations.pinterestSiteVerification} help={t("conn.pinterest.help")} invalid={invalid.has("pinterestSiteVerification")} />
            </Card>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button className={SUBMIT_ACCENT} type="submit">{t("conn.save")}</button>
            <span className="text-[13px] text-app-ink-soft">{t("conn.clear")}</span>
          </div>
        </form>

        <Card className="min-w-0 p-5">
          <CardHead title={t("conn.gsc.oauthTitle")} sub={t("conn.gsc.oauthBody")} action={connection?.siteUrl ? <Pill tone="success" dot>{t("conn.set")}</Pill> : undefined} />
          {googleStatus && <p role="status" className="mb-0 mt-3 rounded-[14px] bg-app-canvas px-4 py-3 text-[14px]">{t.dynamic(`conn.gsc.status.${googleStatus}`, googleStatus)}</p>}
          {!googleReady ? (
            <p className="mb-0 mt-3 text-[14px] leading-[1.5] text-app-ink-soft">{t("conn.gsc.notConfigured")}</p>
          ) : !connection ? (
            <div className="mt-4"><a href="/api/app/search-console/connect" className={buttonClass("ink")}>{t("conn.gsc.connect")}</a></div>
          ) : connection.siteUrl ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="text-[14px]">{t("conn.gsc.connectedAs", { site: connection.siteUrl })}</span>
              <TextLink href="/home/analytics/traffic">{t("conn.trafficLink")}</TextLink>
              <form action={disconnectSearchConsoleAction}><button type="submit" className={buttonClass("white", "sm")}>{t("conn.gsc.disconnect")}</button></form>
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              {sitesError ? (
                <p role="alert" className="m-0 text-[14px] text-app-danger">{t("conn.gsc.listError", { reason: sitesError })}</p>
              ) : sites.length ? (
                <form action={chooseSearchConsoleProperty} className="grid gap-3">
                  <fieldset className="m-0 grid gap-2 border-0 p-0">
                    <legend className="mb-1 text-[14px] font-bold">{t("conn.gsc.choose")}</legend>
                    {sites.map((site, index) => (
                      <label key={site.siteUrl} className="flex items-center gap-2 text-[14px]">
                        <input type="radio" name="siteUrl" value={site.siteUrl} defaultChecked={index === 0} required />
                        <span className="break-all">{site.siteUrl}</span>
                        {site.matches && <Pill tone="success">{t("conn.gsc.matches")}</Pill>}
                      </label>
                    ))}
                  </fieldset>
                  <div><button type="submit" className={buttonClass("ink", "sm")}>{t("conn.gsc.chooseBtn")}</button></div>
                </form>
              ) : (
                <p className="m-0 text-[14px] text-app-ink-soft">{t("conn.gsc.noSites")}</p>
              )}
              <form action={disconnectSearchConsoleAction}><button type="submit" className={buttonClass("white", "sm")}>{t("conn.gsc.disconnect")}</button></form>
            </div>
          )}
        </Card>
      </div>
    </SellerPage>
  );
}
