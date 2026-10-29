import { removeSupplierShowcaseMember, updateSupplierProfile } from "@/app/actions/supplier";
import { SHOWCASE_TEAM_MAX, supplierShowcase } from "@shared/supplier-showcase";
import { ShowcaseMemberForm } from "@/components/supplier/ShowcaseMemberForm";
import { BoostsCard } from "@/components/plans/BoostsCard";
import { creditBalance } from "@/lib/ai/credits.server";
import { billingEmail } from "@/lib/auth/billing-email";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { getSupplierWorkspace } from "@/lib/workspace";
import { AppPage, AssistantNote, Card, CardHead, FilterChips, Pill, PillLink, SplitLayout } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { planOffers } from "@/lib/plans/catalog.server";
import { PlanPicker } from "@/components/payments/PlanPicker";
import { supplierLimits } from "@shared/plans";
import { SupplierCoverUpload, SupplierPhotoUpload } from "@/components/supplier/SupplierProfileUploads";
import { IdentityImageUploader } from "@/components/profile/IdentityImageUploader";
import { verificationLabel, buttonClass, fieldClass, hintClass, labelClass, supplierFrame, textareaClass } from "@/components/supplier/supplier-kit";
import { db } from "@/lib/db/client";
import { planOf } from "@/lib/plan-limits";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";
import { getT } from "@/lib/i18n/server";
import { ShareProfileCard } from "@/components/referrals/ShareProfileCard";
import { profileShareStats } from "@/lib/referrals/service.server";
import { appBase } from "@/lib/email/compliance.server";
import { profileShareLink } from "@shared/referrals";

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
  const isPro = planOf({ role: "supplier", aiCredits }) !== "supplier_free";

  const { supplier } = workspace;
  const t = await getT("supplier", "common");
  const billing = activeTab === BILLING_TAB;
  const photos = workshopPhotos(supplier.onboardingState);
  const showcase = supplierShowcase(supplier.onboardingState);
  const place = [supplier.city, supplier.country].filter(Boolean).join(", ");
  const share = billing ? null : await profileShareStats(user.id).catch(() => null);

  return (
    <AppPage
      frame={supplierFrame({ ...user, email: billingEmail(user) }, supplier)}
      title={billing ? t("settings.link.billing.label") : t("settings.link.profile.label")}
      sub={billing ? (isPro ? t("profile.billingSubMax") : t("profile.billingSubFree")) : t("profile.sub")}
      actions={
        billing ? undefined : (
          <>
            <PillLink href={`/suppliers/${supplier.slug}`} icon="eye" iconOnlyOnPhone>{t("profile.publicPage")}</PillLink>
            <button type="submit" form="profile-form" className={buttonClass.accent}>{t("profile.saveChanges")}</button>
          </>
        )
      }
      toolbar={
        <FilterChips
          items={[
            { label: t("profile.tabProfile"), href: "/supplier/profile", active: !billing },
            { label: t("settings.link.billing.label"), href: `/supplier/profile?tab=${encodeURIComponent(BILLING_TAB)}`, active: billing },
          ]}
        />
      }
    >
      <div className="grid gap-5">
        {(params?.error || params?.saved) && <Notice tone={params?.error ? "error" : "success"}>{params?.error ?? t("profile.saved")}</Notice>}
        {params?.limit && billing && (
          <Notice tone="info">
            {params.limit === "team" ? t("profile.limitTeam") : t("profile.limitProducts")}
          </Notice>
        )}
        {supplier.verificationStatus !== "verified" && !billing && (
          <AssistantNote who="rex" action={<PillLink href="/supplier/verification" tone="ink" size="sm">{t("settings.link.verification.label")}</PillLink>}>
            {t("profile.unverifiedNote")}
          </AssistantNote>
        )}
        {share && (
          <ShareProfileCard link={profileShareLink(appBase(), `/suppliers/${supplier.slug}`, share.code)} role="supplier" verified={supplier.verificationStatus === "verified"} joined={share.joined} />
        )}

        {billing ? (
          <div className="grid gap-5">
          <PlanPicker
            role="supplier"
            current={planOf({ role: "supplier", aiCredits })}
            offers={await planOffers()}
            userEmail={billingEmail(user)}
            userName={user.name}
            creditBalance={await creditBalance(user.id)}
            creditsHref="/supplier/credits"
            usage={[{ label: t("profile.usageListings"), used: workspace.metrics.productCount, limit: supplierLimits(planOf({ role: "supplier", aiCredits })).listings }]}
          />
          <BoostsCard userId={user.id} role="supplier" />
          </div>
        ) : (
          <SplitLayout
            main={
              <>
                <Card className="p-5 sm:p-6">
                  <CardHead title={t("profile.logoCover")} sub={t("profile.logoCoverSub")} />
                  <div className="mt-4"><SupplierCoverUpload bannerUrl={supplier.bannerUrl} /></div>
                  <div className="mt-4">
                    <IdentityImageUploader
                      kind="logo"
                      initialUrl={supplier.logoUrl ?? null}
                      name={supplier.displayName}
                      title={t("profile.businessLogo")}
                      hint={t("profile.logoHint")}
                    />
                  </div>
                </Card>

                <Card className="p-5 sm:p-6">
                  <CardHead title={t("profile.yourPhoto")} sub={t("profile.yourPhotoSub")} />
                  <div className="mt-4">
                    <IdentityImageUploader kind="avatar" initialUrl={user.avatarUrl ?? null} name={user.name} title={t("profile.yourPhoto")} hideTitle />
                  </div>
                </Card>

                <Card className="p-5 sm:p-6">
                  <CardHead title={t("profile.workshopPhotos")} sub={t("profile.workshopSub")} action={<SupplierPhotoUpload />} />
                  {photos.length ? (
                    <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 2xl:grid-cols-6">
                      {photos.map((url, index) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={`${url}-${index}`} src={url} alt={t("profile.workshopAlt", { n: index + 1 })} className="aspect-square w-full rounded-[14px] border border-app-line object-cover" />
                      ))}
                    </div>
                  ) : (
                    <p className="mb-0 mt-4 rounded-[16px] bg-app-canvas px-4 py-6 text-center text-[13.5px] text-app-ink-soft">{t("profile.noWorkshop")}</p>
                  )}
                </Card>

                <form id="profile-form" action={updateSupplierProfile} className="grid gap-5">
                  <Card className="p-5 sm:p-6">
                    <CardHead title={t("profile.aboutBusiness")} />
                    <div className="mt-4 grid gap-4">
                      <div>
                        <label htmlFor="displayName" className={labelClass}>{t("profile.businessName")}</label>
                        <input id="displayName" className={fieldClass} name="displayName" defaultValue={supplier.displayName} required />
                        <div className={hintClass}>{t("profile.businessNameHint")}</div>
                      </div>
                      <div>
                        <label htmlFor="description" className={labelClass}>{t("profile.about")}</label>
                        <textarea id="description" className={textareaClass} name="description" rows={6} defaultValue={supplier.description ?? ""} placeholder={t("profile.aboutPlaceholder")} />
                        <VoiceInputButton targetId="description" context="a description of a supplier business" className="mt-2" />
                        <div className={hintClass}>{t("profile.aboutHint")}</div>
                      </div>
                      <div>
                        <label htmlFor="returnPolicy" className={labelClass}>{t("profile.returns")}</label>
                        <textarea id="returnPolicy" className={textareaClass} name="returnPolicy" rows={4} maxLength={1500} defaultValue={supplier.returnPolicy ?? ""} placeholder={t("profile.returnsPlaceholder")} />
                        <div className={hintClass}>{t("profile.returnsHint")}</div>
                      </div>
                    </div>
                  </Card>

                  <Card className="p-5 sm:p-6">
                    <CardHead title={t("profile.contact")} />
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="name" className={labelClass}>{t("profile.yourName")}</label>
                        <input id="name" className={fieldClass} name="name" defaultValue={user.name} />
                      </div>
                      <div>
                        <label htmlFor="whatsappNumber" className={labelClass}>{t("profile.whatsapp")}</label>
                        <input id="whatsappNumber" className={fieldClass} name="whatsappNumber" type="tel" defaultValue={supplier.whatsappNumber ?? ""} placeholder="+234…" />
                      </div>
                      <div>
                        <label htmlFor="city" className={labelClass}>{t("profile.city")}</label>
                        <input id="city" className={fieldClass} name="city" defaultValue={supplier.city ?? ""} />
                      </div>
                      <div>
                        <label htmlFor="country" className={labelClass}>{t("profile.country")}</label>
                        <input id="country" className={fieldClass} name="country" defaultValue={supplier.country ?? ""} />
                      </div>
                      <div>
                        <label htmlFor="responseTimeLabel" className={labelClass}>{t("profile.replySpeed")}</label>
                        <input id="responseTimeLabel" className={fieldClass} name="responseTimeLabel" defaultValue={supplier.responseTimeLabel ?? ""} placeholder={t("profile.replySpeedPlaceholder")} />
                      </div>
                      <div>
                        <label htmlFor="website" className={labelClass}>{t("profile.website")}</label>
                        <input id="website" className={fieldClass} name="website" inputMode="url" defaultValue={supplier.website ?? ""} placeholder="example.com" />
                        <div className={hintClass}>{t("profile.websiteHint")}</div>
                      </div>
                      <div>
                        <label htmlFor="storeUrl" className={labelClass}>{t("profile.storeUrl")}</label>
                        <input id="storeUrl" className={fieldClass} name="storeUrl" inputMode="url" defaultValue={showcase.storeUrl ?? ""} placeholder="yourshop.mybos.store" />
                        <div className={hintClass}>{t("profile.storeUrlHint")}</div>
                      </div>
                    </div>
                  </Card>

                  <div className="flex justify-end">
                    <button type="submit" className={buttonClass.accent}>{t("profile.saveChanges")}</button>
                  </div>
                </form>

                <div id="team" className="scroll-mt-24">
                <Card className="p-5 sm:p-6">
                  <CardHead title={t("profile.team")} sub={t("profile.teamSub")} />
                  {showcase.team.length ? (
                    <ul className="m-0 mt-4 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 2xl:grid-cols-4">
                      {showcase.team.map((member) => (
                        <li key={member.id} className="grid gap-2 rounded-[16px] border border-app-line p-3 text-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={member.photoUrl} alt={member.name} className="mx-auto h-20 w-20 rounded-full object-cover" />
                          <div className="min-w-0">
                            <p className="m-0 truncate text-[14.5px] font-extrabold">{member.name}</p>
                            {member.role && <p className="m-0 truncate text-[13px] text-app-ink-soft">{member.role}</p>}
                          </div>
                          <form action={removeSupplierShowcaseMember}>
                            <input type="hidden" name="id" value={member.id} />
                            <button type="submit" className="text-[13px] font-bold text-app-danger underline underline-offset-2">{t("profile.teamRemove")}</button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mb-0 mt-4 rounded-[16px] bg-app-canvas px-4 py-6 text-center text-[13.5px] text-app-ink-soft">{t("profile.teamEmpty")}</p>
                  )}
                  {showcase.team.length < SHOWCASE_TEAM_MAX ? (
                    <ShowcaseMemberForm />
                  ) : (
                    <p className="mb-0 mt-4 text-[13.5px] text-app-ink-soft">{t("profile.teamFull", { max: SHOWCASE_TEAM_MAX })}</p>
                  )}
                </Card>
                </div>
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
                      {supplier.verificationStatus === "verified" && <><Icon name="checkCircle" size={16} className="shrink-0 text-app-success" /><span className="sr-only">{t("verificationStatus.verified")}</span></>}
                    </div>
                    <div className="text-[13px] text-app-ink-soft">
                      {place || t("dashboard.noLocation")} · {t("profile.productsLive", { count: workspace.metrics.publishedProductCount })}
                    </div>
                    {supplier.description && <p className="mb-0 mt-2 line-clamp-3 text-[13.5px] leading-[1.5]">{supplier.description.split("\n")[0]}</p>}
                    {supplier.categories.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {supplier.categories.map((category) => <Pill key={category} tone="muted">{category}</Pill>)}
                      </div>
                    )}
                    <dl className="m-0 mt-4 grid grid-cols-2 gap-2 rounded-[16px] bg-app-canvas p-3 text-[13px]">
                      <div><dt className="text-app-ink-soft">{t("profile.trustScore")}</dt><dd className="m-0 font-extrabold">{supplier.trustScore}</dd></div>
                      <div><dt className="text-app-ink-soft">{t("analytics.rating")}</dt><dd className="m-0 font-extrabold">{supplier.ratingCount > 0 ? `${supplier.rating.toFixed(1)} (${supplier.ratingCount})` : t("profile.noneYet")}</dd></div>
                    </dl>
                  </div>
                </Card>

                <Card className="p-5">
                  <CardHead title={t("profile.status")} />
                  <dl className="m-0 mt-2 divide-y divide-app-line text-[14px]">
                    {[
                      [t("settings.link.verification.label"), verificationLabel(supplier.verificationStatus, t)],
                      [t("profile.account"), supplier.status === "active" ? t("team.active") : supplier.status],
                      [t("products.title"), t("profile.inCatalogue", { count: workspace.metrics.productCount })],
                      [t("productStatus.published"), t("profile.published", { count: workspace.metrics.publishedProductCount })],
                      [t("profile.pageAddress"), `/suppliers/${supplier.slug}`],
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
