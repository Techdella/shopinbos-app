import { updateSupplierProfile } from "@/app/actions/supplier";
import { billingEmail } from "@/lib/auth/billing-email";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { getSupplierWorkspace } from "@/lib/workspace";
import { AppPage, AssistantNote, Card, CardHead, FilterChips, Pill, PillLink, SplitLayout } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { PlanUpgradeSection } from "@/components/payments/PlanUpgradeSection";
import { SupplierCoverUpload, SupplierPhotoUpload } from "@/components/supplier/SupplierProfileUploads";
import { IdentityImageUploader } from "@/components/profile/IdentityImageUploader";
import { VERIFICATION_LABEL, buttonClass, fieldClass, hintClass, labelClass, supplierFrame, textareaClass } from "@/components/supplier/supplier-kit";
import { db } from "@/lib/db/client";
import { isProPlan } from "@/lib/role-queries";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ tab?: string; limit?: string; saved?: string; error?: string }>;
};

const BILLING_TAB = "Billing & Plan";

function workshopPhotos(state: unknown): string[] {
  if (!state || typeof state !== "object" || Array.isArray(state)) return [];
  const photos = (state as { workshopPhotos?: unknown }).workshopPhotos;
  return Array.isArray(photos) ? photos.filter((url): url is string => typeof url === "string") : [];
}

export default async function SupplierProfilePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const activeTab = params?.tab ?? "Profile";
  const user = await requireRole(["supplier"], "/supplier/login");
  const workspace = await getSupplierWorkspace(user.id);

  if (!workspace) redirect("/supplier/onboarding");

  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { aiCredits: true },
  });
  const aiCredits = dbUser?.aiCredits ?? 5;
  const isPro = isProPlan({ aiCredits });

  const { supplier } = workspace;
  const billing = activeTab === BILLING_TAB;
  const photos = workshopPhotos(supplier.onboardingState);
  const place = [supplier.city, supplier.country].filter(Boolean).join(", ");

  return (
    <AppPage
      frame={supplierFrame({ ...user, email: billingEmail(user) }, supplier)}
      title={billing ? "Billing and plan" : "Supplier profile"}
      sub={billing ? `You're on ${isPro ? "Supplier Max" : "the free plan"}. Manage AI credits, your subscription and invoices.` : "What sellers see when they find you in the marketplace."}
      actions={
        billing ? undefined : (
          <>
            <PillLink href={`/suppliers/${supplier.slug}`} icon="eye">Public page</PillLink>
            <button type="submit" form="profile-form" className={buttonClass.accent}>Save changes</button>
          </>
        )
      }
      toolbar={
        <FilterChips
          items={[
            { label: "Profile", href: "/supplier/profile", active: !billing },
            { label: "Billing and plan", href: `/supplier/profile?tab=${encodeURIComponent(BILLING_TAB)}`, active: billing },
          ]}
        />
      }
    >
      <div className="grid gap-5">
        {(params?.error || params?.saved) && <Notice tone={params?.error ? "error" : "success"}>{params?.error ?? "Profile saved."}</Notice>}
        {params?.limit && billing && (
          <Notice tone="info">
            You&apos;ve reached the free plan limit for {params.limit === "team" ? "team members" : "products"}. Upgrade to Supplier Max to add more.
          </Notice>
        )}
        {supplier.verificationStatus !== "verified" && !billing && (
          <AssistantNote who="rex" action={<PillLink href="/supplier/verification" tone="ink" size="sm">Verification</PillLink>}>
            Your public page and supplier tools switch on after an admin verifies your business.
          </AssistantNote>
        )}

        {billing ? (
          <PlanUpgradeSection
            userEmail={billingEmail(user)}
            userName={user.name}
            aiCredits={aiCredits}
            productCount={workspace.metrics.productCount}
          />
        ) : (
          <SplitLayout
            main={
              <>
                <Card className="p-5 sm:p-6">
                  <CardHead title="Logo and cover" sub="Photos upload as soon as you pick them." />
                  <div className="mt-4"><SupplierCoverUpload bannerUrl={supplier.bannerUrl} /></div>
                  <div className="mt-4">
                    <IdentityImageUploader
                      kind="logo"
                      initialUrl={supplier.logoUrl ?? null}
                      name={supplier.displayName}
                      title="Business logo"
                      hint="A square logo works best. It shows on your products, your marketplace profile and in seller searches."
                    />
                  </div>
                </Card>

                <Card className="p-5 sm:p-6">
                  <CardHead title="Your photo" sub="Shows in the top bar, the menu and your messages with sellers." />
                  <div className="mt-4">
                    <IdentityImageUploader kind="avatar" initialUrl={user.avatarUrl ?? null} name={user.name} title="Your photo" hideTitle />
                  </div>
                </Card>

                <Card className="p-5 sm:p-6">
                  <CardHead title="Workshop photos" sub="Show sellers where and how you make things." action={<SupplierPhotoUpload />} />
                  {photos.length ? (
                    <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 2xl:grid-cols-6">
                      {photos.map((url, index) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={`${url}-${index}`} src={url} alt={`Workshop photo ${index + 1}`} className="aspect-square w-full rounded-[14px] border border-app-line object-cover" />
                      ))}
                    </div>
                  ) : (
                    <p className="mb-0 mt-4 rounded-[16px] bg-app-canvas px-4 py-6 text-center text-[13.5px] text-app-ink-soft">No workshop photos yet.</p>
                  )}
                </Card>

                <form id="profile-form" action={updateSupplierProfile} className="grid gap-5">
                  <Card className="p-5 sm:p-6">
                    <CardHead title="About your business" />
                    <div className="mt-4 grid gap-4">
                      <div>
                        <label htmlFor="displayName" className={labelClass}>Business name</label>
                        <input id="displayName" className={fieldClass} name="displayName" defaultValue={supplier.displayName} required />
                        <div className={hintClass}>Public. This is how sellers see you.</div>
                      </div>
                      <div>
                        <label htmlFor="description" className={labelClass}>About</label>
                        <textarea id="description" className={textareaClass} name="description" rows={6} defaultValue={supplier.description ?? ""} placeholder="What you make, where, since when, and how you work with sellers." />
                        <VoiceInputButton targetId="description" context="a description of a supplier business" className="mt-2" />
                        <div className={hintClass}>Two or three short paragraphs. The first line shows under your name.</div>
                      </div>
                    </div>
                  </Card>

                  <Card className="p-5 sm:p-6">
                    <CardHead title="Contact and account" />
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="name" className={labelClass}>Your name</label>
                        <input id="name" className={fieldClass} name="name" defaultValue={user.name} />
                      </div>
                      <div>
                        <label htmlFor="whatsappNumber" className={labelClass}>WhatsApp number</label>
                        <input id="whatsappNumber" className={fieldClass} name="whatsappNumber" type="tel" defaultValue={supplier.whatsappNumber ?? ""} placeholder="+234…" />
                      </div>
                      <div>
                        <label htmlFor="city" className={labelClass}>City</label>
                        <input id="city" className={fieldClass} name="city" defaultValue={supplier.city ?? ""} />
                      </div>
                      <div>
                        <label htmlFor="country" className={labelClass}>Country</label>
                        <input id="country" className={fieldClass} name="country" defaultValue={supplier.country ?? ""} />
                      </div>
                      <div>
                        <label htmlFor="responseTimeLabel" className={labelClass}>How fast you reply</label>
                        <input id="responseTimeLabel" className={fieldClass} name="responseTimeLabel" defaultValue={supplier.responseTimeLabel ?? ""} placeholder="Usually replies within 2 hours" />
                      </div>
                      <div>
                        <label htmlFor="website" className={labelClass}>Website</label>
                        <input id="website" className={fieldClass} name="website" type="url" defaultValue={supplier.website ?? ""} placeholder="https://example.com" />
                      </div>
                    </div>
                  </Card>

                  <div className="flex justify-end">
                    <button type="submit" className={buttonClass.accent}>Save changes</button>
                  </div>
                </form>
              </>
            }
            side={
              <>
                <Card className="overflow-hidden">
                  <div
                    className="h-[96px] bg-app-canvas bg-cover bg-center"
                    style={supplier.bannerUrl ? { backgroundImage: `url(${supplier.bannerUrl})` } : undefined}
                  />
                  <div className="-mt-7 px-5 pb-5">
                    <div
                      className="grid h-14 w-14 place-items-center rounded-[16px] border-[3px] border-white bg-app-ink bg-cover bg-center text-[20px] font-extrabold text-white"
                      style={supplier.logoUrl ? { backgroundImage: `url(${supplier.logoUrl})` } : undefined}
                    >
                      {!supplier.logoUrl && supplier.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <h2 className="m-0 truncate text-[17px] font-extrabold">{supplier.displayName}</h2>
                      {supplier.verificationStatus === "verified" && <><Icon name="checkCircle" size={16} className="shrink-0 text-app-success" /><span className="sr-only">Verified</span></>}
                    </div>
                    <div className="text-[13px] text-app-ink-soft">
                      {place || "Location not set"} · {workspace.metrics.publishedProductCount} product{workspace.metrics.publishedProductCount === 1 ? "" : "s"} live
                    </div>
                    {supplier.description && <p className="mb-0 mt-2 line-clamp-3 text-[13.5px] leading-[1.5]">{supplier.description.split("\n")[0]}</p>}
                    {supplier.categories.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {supplier.categories.map((category) => <Pill key={category} tone="muted">{category}</Pill>)}
                      </div>
                    )}
                    <dl className="m-0 mt-4 grid grid-cols-2 gap-2 rounded-[16px] bg-app-canvas p-3 text-[13px]">
                      <div><dt className="text-app-ink-soft">Trust score</dt><dd className="m-0 font-extrabold">{supplier.trustScore}</dd></div>
                      <div><dt className="text-app-ink-soft">Rating</dt><dd className="m-0 font-extrabold">{supplier.ratingCount > 0 ? `${supplier.rating.toFixed(1)} (${supplier.ratingCount})` : "None yet"}</dd></div>
                    </dl>
                  </div>
                </Card>

                <Card className="p-5">
                  <CardHead title="Status" />
                  <dl className="m-0 mt-2 divide-y divide-app-line text-[14px]">
                    {[
                      ["Verification", VERIFICATION_LABEL[supplier.verificationStatus] ?? supplier.verificationStatus],
                      ["Account", supplier.status === "active" ? "Active" : supplier.status],
                      ["Products", `${workspace.metrics.productCount} in catalogue`],
                      ["Live", `${workspace.metrics.publishedProductCount} published`],
                      ["Page address", `/suppliers/${supplier.slug}`],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between gap-3 py-2.5">
                        <dt className="shrink-0 text-app-ink-soft">{label}</dt>
                        <dd className="m-0 min-w-0 truncate text-right font-bold">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </Card>
              </>
            }
          />
        )}
      </div>
    </AppPage>
  );
}
