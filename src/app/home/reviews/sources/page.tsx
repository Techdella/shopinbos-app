import { AppPage, Card, CardHead, Pill, PillLink, SplitLayout } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { field, pillButton, sellerFrame, timeAgo } from "@/components/seller-core";
import { chooseGoogleLocationAction, disconnectGoogleAction } from "@/app/actions/reviews";
import { aiConfigured } from "@/lib/ai/client";
import { db } from "@/lib/db/client";
import { getGoogleConnection, googleConfigured, GoogleReviewsError, listGoogleLocations, type GoogleLocation } from "@/lib/reviews/google";
import { IMPORT_SOURCES } from "@/lib/reviews/pure";
import { productNames } from "@/lib/reviews/server";
import { GoogleSyncButton } from "../_components/GoogleSyncButton";
import { ImportForm } from "../_components/ImportForm";
import { ReviewTabs, reviewSourceLabel, reviewsContext } from "../_components/shared";
import { getLocale, getT } from "@/lib/i18n/server";
import type { MessageKey } from "@shared/i18n/catalog";
import { PageTip } from "@/components/learn/PageTip";

export const dynamic = "force-dynamic";

const GOOGLE_NOTICE: Record<string, { tone: "success" | "danger" | "warning"; text: MessageKey<"reviews"> }> = {
  connected: { tone: "success", text: "src.notice.connected" },
  cancelled: { tone: "warning", text: "src.notice.cancelled" },
  failed: { tone: "danger", text: "src.notice.failed" },
  invalid_state: { tone: "danger", text: "src.notice.invalid" },
  not_configured: { tone: "warning", text: "src.notice.notConfigured" },
};

export default async function ReviewSourcesPage({ searchParams }: { searchParams?: Promise<{ google?: string; reason?: string }> }) {
  const sp = (await searchParams) ?? {};
  const { user, store } = await reviewsContext();
  const tipT = await getT("tips");
  const t = await getT("reviews");
  const locale = await getLocale();
  const [connection, products, counts] = await Promise.all([
    getGoogleConnection(store.id),
    productNames(store.id),
    db.externalReview.groupBy({ by: ["source"], where: { storeId: store.id }, _count: { _all: true } }).catch(() => []),
  ]);
  const configured = googleConfigured();
  let locations: GoogleLocation[] = [];
  let locationError = "";
  if (connection && !connection.locationName) {
    try {
      locations = await listGoogleLocations(store.id);
    } catch (error) {
      // Google's own wording (quotas, project numbers) stays in the server log; sellers get a plain line.
      console.error("[reviews] google locations failed", error instanceof GoogleReviewsError ? error.message.slice(0, 300) : "unknown");
      locationError = t("src.locationsFailed");
    }
  }
  const notice = sp.google ? GOOGLE_NOTICE[sp.google] : null;
  const sourceCount = new Map(counts.map((row) => [row.source, row._count._all]));

  return (
    <AppPage
      frame={sellerFrame(user, store)}
      title={t("tabs.sources")}
      sub={t("src.sub")}
      actions={<PillLink href="/home/reviews" icon="arrowLeft">{t("tabs.all")}</PillLink>}
    >
      <ReviewTabs active="/home/reviews/sources" />
      <PageTip className="mb-5">{tipT("reviews.sources")}</PageTip>
      {notice ? (
        <div role="status" className={`mb-5 rounded-[18px] px-4 py-3 text-[14px] ${notice.tone === "success" ? "bg-app-success-tint text-app-success" : notice.tone === "danger" ? "bg-app-danger-tint text-app-danger" : "bg-[#FDF0D5] text-[#8A5A00]"}`}>
          {t(notice.text)}{sp.reason ? ` ${sp.reason}` : ""}
        </div>
      ) : null}

      <SplitLayout
        sideWidth="460px"
        main={
          <>
            <Card className="p-5 sm:p-6">
              <CardHead
                title="Google Business Profile"
                sub={connection?.locationTitle ? t("src.connectedTo", { name: connection.locationTitle }) : t("src.googleSub")}
                action={<Pill tone={connection?.locationName ? "success" : connection ? "warning" : "muted"} dot>{connection?.locationName ? t("src.connected") : connection ? t("src.chooseLocation") : t("src.notConnected")}</Pill>}
              />
              <div className="mt-4 grid gap-4 text-[14px] leading-[1.55]">
                {!configured && !connection ? (
                  <>
                    <p className="m-0">{t("src.notOn")}</p>
                  </>
                ) : null}

                {configured && !connection ? (
                  <>
                    <p className="m-0">{t("src.signIn")}</p>
                    <a href="/api/app/reviews/google/connect" className={`${pillButton.ink} w-fit no-underline`}><Icon name="link" size={14} /> {t("src.connect")}</a>
                  </>
                ) : null}

                {connection && !connection.locationName ? (
                  locationError ? (
                    <p className="m-0 text-app-danger">{locationError}</p>
                  ) : locations.length ? (
                    <form action={chooseGoogleLocationAction} className="grid gap-2">
                      <label htmlFor="location" className={field.label}>{t("src.which")}</label>
                      <div className="flex flex-wrap gap-2">
                        <select id="location" name="location" className={`${field.select} min-w-[200px] flex-1`}>
                          {locations.map((location) => (
                            <option key={location.locationName} value={`${location.accountName}|${location.locationName}|${location.title}`}>{location.title}{location.address ? ` · ${location.address}` : ""}</option>
                          ))}
                        </select>
                        <button type="submit" className={pillButton.ink}>{t("src.useLocation")}</button>
                      </div>
                    </form>
                  ) : (
                    <p className="m-0">{t("src.noLocations")}</p>
                  )
                ) : null}

                {connection?.locationName ? (
                  <>
                    <p className="m-0 text-app-ink-soft">
                      {t("src.imported", { count: sourceCount.get("google") ?? 0 })}{connection.lastSyncedAt ? ` · ${t("src.lastImport", { when: timeAgo(connection.lastSyncedAt, Date.now(), locale) })}` : ""}. {t("src.repliesPosted")}
                    </p>
                    {connection.lastError ? <p className="m-0 text-app-danger">{t("src.lastFailed")}</p> : null}
                    <GoogleSyncButton />
                  </>
                ) : null}

                {connection ? (
                  <form action={disconnectGoogleAction}>
                    <button type="submit" className={pillButton.white}>{t("src.disconnect")}</button>
                  </form>
                ) : null}
                
              </div>
            </Card>

            <Card className="p-5 sm:p-6">
              <div id="import" className="scroll-mt-24" />
              <CardHead title={t("list.import")} sub={t("src.importSub")} />
              <div className="mt-4">
                <ImportForm
                  sources={IMPORT_SOURCES.map((value) => ({ value, label: reviewSourceLabel(value, t) }))}
                  products={[...products.entries()].map(([id, p]) => ({ id, name: p.name }))}
                  aiReady={aiConfigured()}
                />
              </div>
            </Card>
          </>
        }
        side={
          <>
            <Card className="p-5">
              <CardHead title={t("src.importedSoFar")} />
              <ul className="m-0 mt-3 grid list-none gap-2 p-0 text-[14px]">
                {IMPORT_SOURCES.filter((source) => sourceCount.get(source)).map((source) => (
                  <li key={source} className="flex items-center justify-between"><span className="font-bold">{reviewSourceLabel(source, t)}</span><a href={`/home/reviews?source=${source}`} className="text-app-accent-ink">{t("shareP.reviews", { count: sourceCount.get(source) ?? 0 })}</a></li>
                ))}
                {!counts.length ? <li className="text-app-ink-soft">{t("src.nothingImported")}</li> : null}
              </ul>
            </Card>


            <Card className="p-5">
              <CardHead title={t("filter.marketplaces")} />
              <p className="m-0 mt-2 text-[13.5px] leading-[1.55]">
                {t("src.marketplacesBody")}
              </p>
            </Card>
          </>
        }
      />
    </AppPage>
  );
}
