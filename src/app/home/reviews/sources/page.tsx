import { TechFold } from "@/components/simple/Fold";
import { AppPage, Card, CardHead, Pill, PillLink, SplitLayout } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { field, pillButton, sellerFrame, timeAgo } from "@/components/seller-core";
import { chooseGoogleLocationAction, disconnectGoogleAction } from "@/app/actions/reviews";
import { aiConfigured } from "@/lib/ai/client";
import { db } from "@/lib/db/client";
import { getGoogleConnection, googleConfigured, googleRedirectUri, GoogleReviewsError, listGoogleLocations, type GoogleLocation } from "@/lib/reviews/google";
import { IMPORT_SOURCES, sourceLabel } from "@/lib/reviews/pure";
import { productNames, reviewUrls } from "@/lib/reviews/server";
import { CopyField } from "../_components/CopyField";
import { GoogleSyncButton } from "../_components/GoogleSyncButton";
import { ImportForm } from "../_components/ImportForm";
import { ReviewTabs, reviewsContext } from "../_components/shared";

export const dynamic = "force-dynamic";

const GOOGLE_NOTICE: Record<string, { tone: "success" | "danger" | "warning"; text: string }> = {
  connected: { tone: "success", text: "Google is connected. Choose your business location below." },
  cancelled: { tone: "warning", text: "Google sign-in was cancelled." },
  failed: { tone: "danger", text: "Google sign-in didn't work." },
  invalid_state: { tone: "danger", text: "That Google sign-in link expired or wasn't for this store. Try again." },
  not_configured: { tone: "warning", text: "Connecting Google isn't switched on yet. Add your Google reviews below for now." },
};

export default async function ReviewSourcesPage({ searchParams }: { searchParams?: Promise<{ google?: string; reason?: string }> }) {
  const sp = (await searchParams) ?? {};
  const { user, store } = await reviewsContext();
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
      locationError = error instanceof GoogleReviewsError ? error.message : "Couldn't load your Google locations.";
    }
  }
  const notice = sp.google ? GOOGLE_NOTICE[sp.google] : null;
  const urls = reviewUrls(store.slug);
  const sourceCount = new Map(counts.map((row) => [row.source, row._count._all]));

  return (
    <AppPage
      frame={sellerFrame(user, store)}
      title="Sources and import"
      sub="Bring reviews from Google, WhatsApp, social media and marketplaces into one list."
      actions={<PillLink href="/home/reviews" icon="arrowLeft">All reviews</PillLink>}
    >
      <ReviewTabs active="/home/reviews/sources" />
      {notice ? (
        <div role="status" className={`mb-5 rounded-[18px] px-4 py-3 text-[14px] ${notice.tone === "success" ? "bg-app-success-tint text-app-success" : notice.tone === "danger" ? "bg-app-danger-tint text-app-danger" : "bg-[#FDF0D5] text-[#8A5A00]"}`}>
          {notice.text}{sp.reason ? ` ${sp.reason}` : ""}
        </div>
      ) : null}

      <SplitLayout
        sideWidth="460px"
        main={
          <>
            <Card className="p-5 sm:p-6">
              <CardHead
                title="Google Business Profile"
                sub={connection?.locationTitle ? `Connected to ${connection.locationTitle}` : "Your reviews on Google Search and Maps."}
                action={<Pill tone={connection?.locationName ? "success" : connection ? "warning" : "muted"} dot>{connection?.locationName ? "Connected" : connection ? "Choose location" : "Not connected"}</Pill>}
              />
              <div className="mt-4 grid gap-4 text-[14px] leading-[1.55]">
                {!configured && !connection ? (
                  <>
                    <p className="m-0">Connecting Google straight to your shop isn&apos;t switched on yet. Until then, add Google reviews yourself below: open the review on Google Maps, copy the words and the share link, and paste them in. They are labelled as coming from Google.</p>
                    <TechFold forWho="the Shopinbos team">
                      <ol className="m-0 grid gap-1 pl-5 text-[13.5px]">
                        <li>In Google Cloud, enable the My Business Account Management, Business Information and My Business (v4 reviews) APIs, and apply for Business Profile API access.</li>
                        <li>Create an OAuth client (web) with the redirect URI <code className="break-all">{googleRedirectUri()}</code>.</li>
                        <li>Set GOOGLE_BUSINESS_CLIENT_ID and GOOGLE_BUSINESS_CLIENT_SECRET, and INTEGRATIONS_ENCRYPTION_KEY to encrypt the tokens.</li>
                      </ol>
                    </TechFold>
                  </>
                ) : null}

                {configured && !connection ? (
                  <>
                    <p className="m-0">Sign in with the Google account that manages your Business Profile. We import your reviews, keep them in sync when you press import, and post your replies to Google.</p>
                    <a href="/api/app/reviews/google/connect" className={`${pillButton.ink} w-fit no-underline`}><Icon name="link" size={14} /> Connect Google</a>
                  </>
                ) : null}

                {connection && !connection.locationName ? (
                  locationError ? (
                    <p className="m-0 text-app-danger">{locationError}</p>
                  ) : locations.length ? (
                    <form action={chooseGoogleLocationAction} className="grid gap-2">
                      <label htmlFor="location" className={field.label}>Which business?</label>
                      <div className="flex flex-wrap gap-2">
                        <select id="location" name="location" className={`${field.select} min-w-[200px] flex-1`}>
                          {locations.map((location) => (
                            <option key={location.locationName} value={`${location.accountName}|${location.locationName}|${location.title}`}>{location.title}{location.address ? ` · ${location.address}` : ""}</option>
                          ))}
                        </select>
                        <button type="submit" className={pillButton.ink}>Use this location</button>
                      </div>
                    </form>
                  ) : (
                    <p className="m-0">This Google account doesn&apos;t manage any Business Profile locations. Sign in with the account that does, or create your profile at business.google.com.</p>
                  )
                ) : null}

                {connection?.locationName ? (
                  <>
                    <p className="m-0 text-app-ink-soft">
                      {sourceCount.get("google") ?? 0} Google reviews imported{connection.lastSyncedAt ? ` · last import ${timeAgo(connection.lastSyncedAt)}` : ""}. Replies you save on a Google review are posted to Google.
                    </p>
                    {connection.lastError ? <p className="m-0 text-app-danger" title={connection.lastError}>The last import didn&apos;t work. Press import again, or tap Help and we&apos;ll check it.</p> : null}
                    <GoogleSyncButton />
                  </>
                ) : null}

                {connection ? (
                  <form action={disconnectGoogleAction}>
                    <button type="submit" className={pillButton.white}>Disconnect Google</button>
                  </form>
                ) : null}
                
              </div>
            </Card>

            <Card className="p-5 sm:p-6">
              <div id="import" className="scroll-mt-24" />
              <CardHead title="Import a review" sub="From WhatsApp, Instagram, Facebook, TikTok, X, Google or a marketplace like Jumia or Konga." />
              <div className="mt-4">
                <ImportForm
                  sources={IMPORT_SOURCES.map((value) => ({ value, label: sourceLabel(value) }))}
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
              <CardHead title="Imported so far" />
              <ul className="m-0 mt-3 grid list-none gap-2 p-0 text-[14px]">
                {IMPORT_SOURCES.filter((source) => sourceCount.get(source)).map((source) => (
                  <li key={source} className="flex items-center justify-between"><span className="font-bold">{sourceLabel(source)}</span><a href={`/home/reviews?source=${source}`} className="text-app-accent-ink">{sourceCount.get(source)} reviews</a></li>
                ))}
                {!counts.length ? <li className="text-app-ink-soft">Nothing imported yet.</li> : null}
              </ul>
            </Card>

            <Card className="p-5">
              <CardHead title="Google Shopping ratings" sub="Stars under your products in Google Shopping ads and listings." />
              <div className="mt-3 grid gap-3 text-[13.5px] leading-[1.55]">
                <CopyField label="Product reviews feed" value={urls.feed} />
                <p className="m-0">In Google Merchant Center, open Growth, then Manage programs, then Product ratings, and add this URL as a scheduled feed. It lists the published reviews buyers left on your store, in Google&apos;s product reviews format.</p>
                <p className="m-0 text-app-ink-soft">Google shows stars once a product has enough reviews (usually 50 across your shop, and at least 3 for a product). Imported Google, social and marketplace reviews aren&apos;t in the feed because Google only accepts reviews you collected yourself.</p>
              </div>
            </Card>

            <Card className="p-5">
              <CardHead title="Marketplaces" />
              <p className="m-0 mt-2 text-[13.5px] leading-[1.55]">
                The Shopinbos marketplace is where you buy from suppliers, so it has no buyer reviews of your shop to bring in. For Jumia, Konga or another marketplace, import reviews with a screenshot or by pasting them: they are labelled with that marketplace.
              </p>
            </Card>
          </>
        }
      />
    </AppPage>
  );
}
