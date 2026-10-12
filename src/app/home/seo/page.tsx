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

export const dynamic = "force-dynamic";

type SeoPageProps = { searchParams?: Promise<{ saved?: string; tab?: string }> };

export default async function SeoSettingsPage({ searchParams }: SeoPageProps) {
  const params = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace?.store) redirect("/onboarding?role=seller");

  const store = workspace.store;
  const settings = parseBrandSettings(store.brandSettings);
  const seo = settings.seo && typeof settings.seo === "object" ? (settings.seo as Record<string, string>) : {};
  const integrations =
    settings.integrations && typeof settings.integrations === "object"
      ? (settings.integrations as Record<string, string>)
      : {};

  const activeTab = params?.tab === "integrations" ? "integrations" : "seo";
  const previewImage = seo.socialImage || store.logoUrl;

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Show up on Google"
      sub="How your shop shows up on Google, and counting your visitors."
    >
      <PageToast />
      <div className="grid gap-5">
        {params?.saved && <Notice tone="success">Settings saved.</Notice>}

        <FilterChips
          items={[
            { label: "Search listing", href: "/home/seo", active: activeTab === "seo" },
            { label: "Visitor tracking", href: "/home/seo?tab=integrations", active: activeTab === "integrations" },
          ]}
        />

        {activeTab === "seo" ? (
          <form action={saveStoreSeoSettings} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="grid min-w-0 content-start gap-5">
              <Card className="p-5">
                <CardHead title="Google listing" sub="The title and description people see in Google results." />
                <div className="mt-4 grid gap-4">
                  <div>
                    <label htmlFor="seoTitle" className={FIELD_LABEL}>Title</label>
                    <input id="seoTitle" name="seoTitle" className={FIELD_INPUT} placeholder={store.name} defaultValue={seo.title ?? store.name} maxLength={70} />
                    <p className={FIELD_HELP}>Best between 50 and 70 characters.</p>
                  </div>
                  <div>
                    <label htmlFor="seoDescription" className={FIELD_LABEL}>Description</label>
                    <textarea
                      id="seoDescription"
                      name="seoDescription"
                      className={FIELD_TEXTAREA}
                      placeholder="Describe your store in 120 to 160 characters"
                      rows={3}
                      defaultValue={seo.description ?? store.description ?? ""}
                      maxLength={180}
                    />
                    <p className={FIELD_HELP}>Best between 120 and 160 characters.</p>
                  </div>
                  <div>
                    <label htmlFor="seoKeywords" className={FIELD_LABEL}>Keywords</label>
                    <input id="seoKeywords" name="seoKeywords" className={FIELD_INPUT} placeholder="e.g. African fashion, wholesale clothing, Lagos boutique" defaultValue={seo.keywords ?? ""} />
                    <p className={FIELD_HELP}>Separate with commas.</p>
                  </div>
                </div>
              </Card>

              <Card className="p-5">
                <CardHead title="Link preview" sub="The picture shown when your store link is shared on WhatsApp, X or Facebook." />
                <div className="mt-4">
                  <label htmlFor="socialImage" className={FIELD_LABEL}>Image link</label>
                  <input id="socialImage" name="socialImage" type="url" className={FIELD_INPUT} placeholder="https://your-storage.supabase.co/..." defaultValue={seo.socialImage ?? store.logoUrl ?? ""} />
                  <p className={FIELD_HELP}>Best size: 1200 × 630 pixels.</p>
                </div>
              </Card>

              <div>
                <button className={SUBMIT_ACCENT} type="submit">Save search settings</button>
              </div>
            </div>

            <aside className="grid min-w-0 content-start gap-5">
              <Card className="p-5">
                <CardHead title="On Google" />
                <div className="mt-3 rounded-[14px] border border-app-line p-3">
                  <div className="truncate text-[12px] text-app-ink-soft">{store.slug}.shopinbos.shop</div>
                  <div className="truncate text-[15px] font-medium leading-snug text-[#1a0dab]">{seo.title ?? store.name}</div>
                  <div className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-[#545454]">{seo.description ?? store.description ?? "Add a description so shoppers know what you sell."}</div>
                </div>
                <p className={FIELD_HELP}>Shows your saved listing.</p>
              </Card>
              {previewImage && (
                <Card className="overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewImage} alt="Link preview image" className="block aspect-[1200/630] w-full object-cover" />
                  <div className="border-t border-app-line px-4 py-3">
                    <div className="text-[12px] uppercase text-app-ink-soft">shopinbos.com</div>
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
            title="Connect Google visitor tracking"
            description="We'll connect Google's visitor counting and Search Console to your shop for you, so you can see who visits and how you show up on Google."
            feature="google_tracking"
            softwareQuestion="Do you already have a Google account for your business?"
            softwarePlaceholder="Yes, the email is…"
          />
          <AdvancedFold label="Advanced (optional): enter the Google codes yourself" hint={integrations.googleAnalyticsId || integrations.gaSiteVerification ? "Some codes are saved" : "For whoever manages your Google account"}>
          <form action={saveStoreIntegrationSettings} className="grid gap-5">
            <div className="grid gap-5 xl:grid-cols-2">
              <Card className="min-w-0 p-5">
                <CardHead
                  title="Google Analytics 4"
                  sub="Track visitors, visits and sales on your store."
                  action={<Pill tone={integrations.googleAnalyticsId ? "success" : "muted"} dot>{integrations.googleAnalyticsId ? "Connected" : "Not set"}</Pill>}
                />
                <p className="mb-0 mt-3 text-[13.5px] leading-[1.5] text-app-ink-soft">
                  Find your Measurement ID in <strong className="text-app-ink">Google Analytics → Admin → Data streams → Web stream</strong>.
                </p>
                <div className="mt-4">
                  <label htmlFor="googleAnalyticsId" className={FIELD_LABEL}>Measurement ID</label>
                  <input id="googleAnalyticsId" name="googleAnalyticsId" className={FIELD_INPUT} placeholder="G-XXXXXXXXXX" defaultValue={integrations.googleAnalyticsId ?? ""} pattern="G-[A-Z0-9]+" />
                  <p className={FIELD_HELP}>Looks like <code>G-XXXXXXXXXX</code>. Leave it empty to turn tracking off.</p>
                </div>
              </Card>

              <Card className="min-w-0 p-5">
                <CardHead
                  title="Google Search Console"
                  sub="Check your search rankings and send Google your sitemap."
                  action={<Pill tone={integrations.gaSiteVerification ? "success" : "muted"} dot>{integrations.gaSiteVerification ? "Tag set" : "Not set"}</Pill>}
                />
                <p className="mb-0 mt-3 text-[13.5px] leading-[1.5] text-app-ink-soft">
                  In Search Console, choose <strong className="text-app-ink">HTML tag</strong> and paste the content value here, then press Verify there.
                </p>
                <div className="mt-4">
                  <label htmlFor="gaSiteVerification" className={FIELD_LABEL}>Verification code</label>
                  <input id="gaSiteVerification" name="gaSiteVerification" className={FIELD_INPUT} placeholder="The content= value from the meta tag" defaultValue={integrations.gaSiteVerification ?? ""} />
                  <p className={`${FIELD_HELP} break-words`}>
                    Copy only the part inside <code>content=&quot;...&quot;</code>, for example <code>{"<meta name=\"google-site-verification\" content=\"PASTE_THIS_PART\" />"}</code>
                  </p>
                </div>
              </Card>
            </div>

            <Card className="p-5">
              <CardHead title="Google Merchant Center" action={<Pill tone="success" dot>Ready</Pill>} />
              <p className="mb-0 mt-2 text-[14px] leading-[1.55] text-app-ink-soft">
                Your products are already set up for Google Shopping: every page of your live shop carries product details Google can read. To show them on Google, see <a href="/channels#google" className="font-bold underline">Sell everywhere</a>.
              </p>
            </Card>

            <div>
              <button className={SUBMIT_ACCENT} type="submit">Save Google settings</button>
            </div>
          </form>
          </AdvancedFold>
          </div>
        )}
      </div>
    </SellerPage>
  );
}
