import { requireRole } from "@/lib/server-auth";
import { billingEmail } from "@/lib/auth/billing-email";
import { getSellerWorkspace } from "@/lib/workspace";
import { IdentityImageUploader } from "@/components/profile/IdentityImageUploader";
import { updateSellerProfile, saveStoreSettings, saveBusinessAddress, closeStore, inviteTeamMember } from "@/app/actions/workspace";
import { hasPostalAddress, readBusinessAddress } from "@/lib/email/shell";
import { userLinks } from "@/lib/email/compliance.server";
import { PageToast } from "@/components/PageToast";
import { LanguageSettingsCard } from "@/components/i18n/LanguagePicker";
import { SecuritySettings } from "@/components/auth/SecuritySettings";
import { SellerBillingSection } from "@/components/payments/SellerBillingSection";
import { StoreLaunchBalanceCard } from "@/components/billing/StoreLaunchBalanceCard";
import { PeggyPreferencesForm } from "@/components/settings/PeggyPreferencesForm";
import { RexPreferencesForm } from "@/components/settings/RexPreferencesForm";
import { parseRexPreferences } from "@shared/rex-preferences";
import { readRexVersions } from "@/lib/ai/rex/studio-versions";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, Card, CardHead, FilterChips, Pill, PillLink } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { FIELD_HELP, FIELD_INPUT, FIELD_LABEL, FIELD_TEXTAREA, SUBMIT_INK, SUBMIT_WHITE } from "@/components/seller-settings/fields";
import { db } from "@/lib/db/client";
import { creditBalance } from "@/lib/ai/credits.server";
import { aiAllowanceToday } from "@/lib/ai/usage";
import { SupplierSwitchCard } from "@/components/settings/SupplierSwitchCard";
import { switchSettings } from "@shared/order-parts";
import { NotificationSettingsPanel } from "@/components/notifications/NotificationSettingsPanel";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT("account");
  return { title: t("title") };
}

type PageProps = {
  searchParams?: Promise<{ tab?: string }>;
};

const TABS = ["Store", "Peggy & Rex", "Team", "Billing", "Notifications", "Security"] as const;
/** Old tab names still in links and redirects. */
const TAB_ALIASES: Record<string, (typeof TABS)[number]> = { "Peggy & AI": "Peggy & Rex" };


export default async function SellerSettingsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const activeTab = params?.tab ? TAB_ALIASES[params.tab] ?? params.tab : "Store";
  const user = await requireRole(["seller"], "/login");
  const t = await getT("account", "common");
  const tPay = await getT("payments");
  const workspace = await getSellerWorkspace(user.id);

  if (!workspace) return null;

  const store = workspace.store;
  const [dbUser, productCount, bookingCount] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } }),
    store ? db.storeProduct.count({ where: { storeId: store.id } }) : Promise.resolve(0),
    db.deliveryBooking.count({ where: { sellerId: user.id } }),
  ]);
  const aiCredits = dbUser?.aiCredits ?? 5;
  // The daily AI allowance (src/lib/ai/usage.ts) is what Peggy and Rex actually spend; aiCredits sets its size.
  const aiAllowance = await aiAllowanceToday(user.id, dbUser?.aiCredits);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const brandSettings = (store?.brandSettings ?? {}) as Record<string, any>;
  const launchBilling = brandSettings.launchBilling && typeof brandSettings.launchBilling === "object"
    ? brandSettings.launchBilling as { balanceDue?: number; dueAt?: string | null }
    : null;
  const peggyPrefs = brandSettings.peggyPreferences ?? {};
  const savedCommStyle = peggyPrefs.communicationStyle ?? "Friendly";
  const savedDailyBrief = peggyPrefs.dailyBrief ?? "Morning only";


  const storeName = store?.name ?? "Your Store";
  const storeUrl = store?.slug ? `${store.slug}.shopinbos.shop` : undefined;
  const storeLogoUrl = store?.logoUrl;
  const initials = user.name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);
  const pendingInvites = (brandSettings.pendingInvites ?? []) as string[];
  const businessAddress = readBusinessAddress(store?.brandSettings);
  const businessAddressReady = hasPostalAddress(businessAddress);
  const emailPreferencesUrl = userLinks(user.id)?.preferences ?? null;

  return (
    <SellerPage user={user} store={storeSummary(store)} title={t("title")} sub={t("sub")}>
      <PageToast />
      <div className="grid gap-5">
        <FilterChips items={TABS.map((tab) => ({ label: t(`tab.${tab}`), href: `/home/settings?tab=${encodeURIComponent(tab)}`, active: tab === activeTab }))} />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="grid min-w-0 content-start gap-5">
            {activeTab === "Store" && (
              <>
                <Card className="p-5">
                  <CardHead title={t("logo.title")} />
                  <div className="mt-4">
                    <IdentityImageUploader
                      kind="logo"
                      initialUrl={storeLogoUrl ?? null}
                      name={storeName}
                      title={t("logo.title")}
                      hideTitle
                      hint={t("logo.hint")}
                    />
                  </div>
                </Card>

                <form action={saveStoreSettings}>
                  <Card className="p-5">
                    <CardHead title={t("details.title")} />
                    <div className="mt-4 grid gap-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="min-w-0">
                          <label htmlFor="storeName" className={FIELD_LABEL}>{t("details.name")}</label>
                          <input id="storeName" name="storeName" className={FIELD_INPUT} defaultValue={storeName} />
                        </div>
                        <div className="min-w-0">
                          <label htmlFor="slug" className={FIELD_LABEL}>{t("details.slug")}</label>
                          <input id="slug" name="slug" className={FIELD_INPUT} defaultValue={store?.slug ?? ""} />
                          {storeUrl && <p className={`${FIELD_HELP} truncate`}>{t("details.address", { url: storeUrl })}</p>}
                        </div>
                      </div>
                      <div>
                        <label htmlFor="tagline" className={FIELD_LABEL}>{t("details.tagline")}</label>
                        <input id="tagline" name="tagline" className={FIELD_INPUT} defaultValue={typeof brandSettings.tagline === "string" ? brandSettings.tagline : ""} />
                      </div>
                      <div>
                        <label htmlFor="description" className={FIELD_LABEL}>{t("details.about")}</label>
                        <textarea id="description" name="description" className={FIELD_TEXTAREA} rows={4} defaultValue={store?.description ?? ""} />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="min-w-0">
                          <label htmlFor="city" className={FIELD_LABEL}>{t("city")}</label>
                          <input id="city" name="city" className={FIELD_INPUT} defaultValue={store?.city ?? ""} />
                        </div>
                        <div className="min-w-0">
                          <span className={FIELD_LABEL}>{t("country")}</span>
                          <div className="flex h-[50px] items-center rounded-[16px] border border-app-line bg-app-canvas px-4 text-[15px]">{store?.country ?? "Nigeria"}</div>
                        </div>
                      </div>
                      <div>
                        <button type="submit" className={SUBMIT_INK}>{t("details.save")}</button>
                      </div>
                    </div>
                  </Card>
                </form>

                <form action={saveBusinessAddress} id="business-address" className="scroll-mt-24">
                  <Card className="p-5">
                    <CardHead
                      title={t("addr.title")}
                      sub={t("addr.sub")}
                      action={businessAddressReady ? <Pill tone="success">{t("addr.added")}</Pill> : <Pill tone="warning">{t("addr.needed")}</Pill>}
                    />
                    <div className="mt-4 grid gap-4">
                      <div>
                        <label htmlFor="legalName" className={FIELD_LABEL}>{t("addr.legalName")}</label>
                        <input id="legalName" name="legalName" className={FIELD_INPUT} defaultValue={businessAddress.legalName} placeholder={storeName} autoComplete="organization" />
                        <p className={FIELD_HELP}>{t("addr.legalHelp")}</p>
                      </div>
                      <div>
                        <label htmlFor="line1" className={FIELD_LABEL}>{t("addr.street")}</label>
                        <input id="line1" name="line1" className={FIELD_INPUT} defaultValue={businessAddress.line1} placeholder="12 Adeola Odeku Street" autoComplete="address-line1" />
                      </div>
                      <div>
                        <label htmlFor="line2" className={FIELD_LABEL}>{t("addr.line2")}</label>
                        <input id="line2" name="line2" className={FIELD_INPUT} defaultValue={businessAddress.line2} autoComplete="address-line2" />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="min-w-0">
                          <label htmlFor="addressCity" className={FIELD_LABEL}>{t("city")}</label>
                          <input id="addressCity" name="addressCity" className={FIELD_INPUT} defaultValue={businessAddress.city || store?.city || ""} autoComplete="address-level2" />
                        </div>
                        <div className="min-w-0">
                          <label htmlFor="addressState" className={FIELD_LABEL}>{t("addr.state")}</label>
                          <input id="addressState" name="addressState" className={FIELD_INPUT} defaultValue={businessAddress.state} placeholder="Lagos" autoComplete="address-level1" />
                        </div>
                        <div className="min-w-0">
                          <label htmlFor="postalCode" className={FIELD_LABEL}>{t("addr.postal")}</label>
                          <input id="postalCode" name="postalCode" className={FIELD_INPUT} defaultValue={businessAddress.postalCode} autoComplete="postal-code" />
                        </div>
                        <div className="min-w-0">
                          <label htmlFor="addressCountry" className={FIELD_LABEL}>{t("country")}</label>
                          <input id="addressCountry" name="addressCountry" className={FIELD_INPUT} defaultValue={businessAddress.country || store?.country || "Nigeria"} autoComplete="country-name" />
                        </div>
                        <div className="min-w-0">
                          <label htmlFor="addressEmail" className={FIELD_LABEL}>{t("addr.email")}</label>
                          <input id="addressEmail" name="addressEmail" type="email" className={FIELD_INPUT} defaultValue={businessAddress.email} placeholder="hello@yourbrand.com" />
                        </div>
                        <div className="min-w-0">
                          <label htmlFor="addressPhone" className={FIELD_LABEL}>{t("addr.phone")}</label>
                          <input id="addressPhone" name="addressPhone" type="tel" className={FIELD_INPUT} defaultValue={businessAddress.phone} placeholder="+234 800 000 0000" />
                        </div>
                      </div>
                      <p className={FIELD_HELP}>{t("addr.contactHelp")}</p>
                      <div>
                        <button type="submit" className={SUBMIT_INK}>{t("addr.save")}</button>
                      </div>
                    </div>
                  </Card>
                </form>

                <form action={updateSellerProfile}>
                  {/* updateSellerProfile also writes these fields, so send their current values. */}
                  <input type="hidden" name="name" value={user.name} />
                  <input type="hidden" name="city" value={store?.city ?? user.city ?? ""} />
                  <input type="hidden" name="country" value={store?.country ?? user.country ?? ""} />
                  <input type="hidden" name="description" value={store?.description ?? ""} />
                  <Card className="p-5">
                    <CardHead title={t("contact.title")} />
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div className="min-w-0">
                        <span className={FIELD_LABEL}>{t("email")}</span>
                        <div className="flex h-[50px] min-w-0 items-center rounded-[16px] border border-app-line bg-app-canvas px-4 text-[15px]">
                          <span className="truncate">{user.email ?? t("contact.noEmail")}</span>
                        </div>
                        <p className={FIELD_HELP}>{t("contact.emailHelp")}</p>
                      </div>
                      <div className="min-w-0">
                        <label htmlFor="phone" className={FIELD_LABEL}>{t("phone")}</label>
                        <input id="phone" name="phone" type="tel" className={FIELD_INPUT} defaultValue={user.phone ?? ""} placeholder="+234 800 000 0000" />
                      </div>
                    </div>
                    <button type="submit" className={`${SUBMIT_INK} mt-4`}>{t("contact.save")}</button>
                  </Card>
                </form>
              </>
            )}

            {activeTab === "Peggy & Rex" && (
              <div className="grid items-start gap-5 2xl:grid-cols-2">
                <PeggyPreferencesForm
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  defaultMemory={(workspace.settings.onboardingMemory as any)?.notes ?? ""}
                  defaultCommStyle={savedCommStyle}
                  defaultDailyBrief={savedDailyBrief}
                />
                <RexPreferencesForm initial={parseRexPreferences(brandSettings.rexPreferences)} versionCount={readRexVersions(brandSettings).items.length} />
              </div>
            )}

            {activeTab === "Team" && (
              <>
                <Card className="overflow-hidden">
                  <CardHead title={t("team.title")} sub={t("team.sub")} className="px-5 pb-3 pt-5" />
                  <ul className="m-0 list-none divide-y divide-app-line border-t border-app-line p-0">
                    <li className="flex items-center gap-3 px-5 py-3.5">
                      {user.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={user.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                      ) : (
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-app-ink text-[14px] font-extrabold text-white">{initials}</span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14.5px] font-extrabold">{user.name}</div>
                        <div className="truncate text-[13px] text-app-ink-soft">{user.email} · {t("team.owner")}</div>
                      </div>
                      <Pill tone="ink">{t("team.you")}</Pill>
                    </li>
                    {pendingInvites.map((email) => (
                      <li key={email} className="flex items-center gap-3 px-5 py-3.5">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-app-canvas"><Icon name="mail" size={17} /></span>
                        <div className="min-w-0 flex-1 truncate text-[14.5px] font-bold">{email}</div>
                        <Pill tone="warning">{t("team.invited")}</Pill>
                      </li>
                    ))}
                  </ul>
                </Card>
                <form action={inviteTeamMember}>
                  <Card className="p-5">
                    <label htmlFor="invite-email" className="mb-3 block text-[17px] font-extrabold">{t("team.invite")}</label>
                    <div className="flex flex-wrap gap-3">
                      <input id="invite-email" name="email" type="email" className={`${FIELD_INPUT} flex-1 basis-[220px]`} placeholder="colleague@email.com" required />
                      <button type="submit" className={SUBMIT_INK}><Icon name="plus" size={16} /> {t("team.send")}</button>
                    </div>
                  </Card>
                </form>
              </>
            )}

            {activeTab === "Billing" && (
              <>
                <StoreLaunchBalanceCard balanceDue={Number(launchBilling?.balanceDue ?? 0)} dueAt={launchBilling?.dueAt} />
                <Card className="p-5">
                  <CardHead
                    title={tPay("cr.title")}
                    sub={tPay("cr.settingsLine", { count: await creditBalance(user.id) })}
                    action={<PillLink href="/home/credits" size="sm" tone="ink" icon="sparkle">{tPay("cr.buy")}</PillLink>}
                  />
                </Card>
                <SellerBillingSection
                  userEmail={billingEmail(user)}
                  userName={user.name}
                  aiCredits={aiCredits}
                  productCount={productCount}
                />
                {store && <SupplierSwitchCard settings={switchSettings(await db.store.findUnique({ where: { id: store.id }, select: { autoSwitchSupplier: true, switchCostRule: true, switchMaxIncreasePct: true, switchMinMarginPct: true } }))} />}
              </>
            )}

            {activeTab === "Notifications" && emailPreferencesUrl && (
              <Card className="p-5">
                <CardHead
                  title={t("notif.title")}
                  sub={t("notif.sub")}
                  action={<PillLink href={emailPreferencesUrl} size="sm" tone="ink">{t("notif.prefs")}</PillLink>}
                />
              </Card>
            )}
            {activeTab === "Notifications" && <NotificationSettingsPanel />}
            {activeTab === "Security" && <SecuritySettings />}
          </div>

          <aside className="grid min-w-0 content-start gap-5">
            <LanguageSettingsCard />
            <Card className="p-5">
              <CardHead title={t("menu.title")} sub={t("menu.sub")} action={<PillLink href="/home/features" size="sm" tone="ink">{t("open")}</PillLink>} />
            </Card>
            <AssistantNote who="peggy" action={<PillLink href="/home/settings?tab=Peggy+%26+Rex" size="sm" tone="ink">{t("peggy.review")}</PillLink>}>
              {t("peggy.note")}
            </AssistantNote>

            <Card className="p-5">
              <CardHead title={t("store.title")} />
              <dl className="m-0 mt-2 divide-y divide-app-line">
                <div className="flex justify-between gap-3 py-2.5 text-[14px]"><dt className="text-app-ink-soft">{t("store.products")}</dt><dd className="m-0 font-extrabold">{productCount}</dd></div>
                <div className="flex justify-between gap-3 py-2.5 text-[14px]"><dt className="text-app-ink-soft">{t("store.bookings")}</dt><dd className="m-0 font-extrabold">{bookingCount}</dd></div>
                {aiAllowance ? (
                  aiAllowance.map((row) => (
                    <div key={row.kind} className="flex justify-between gap-3 py-2.5 text-[14px]"><dt className="text-app-ink-soft">{t("store.today", { label: row.label })}</dt><dd className="m-0 font-extrabold">{t("store.usedOf", { used: row.used, limit: row.limit })}</dd></div>
                  ))
                ) : (
                  <div className="flex justify-between gap-3 py-2.5 text-[14px]"><dt className="text-app-ink-soft">{t("store.credits")}</dt><dd className="m-0 font-extrabold">{aiCredits}</dd></div>
                )}
              </dl>
            </Card>

            <form action={closeStore}>
              <Card className="border-[#F5C6C0] p-5">
                <h2 className="m-0 text-[15px] font-extrabold text-app-danger">{t("close.title")}</h2>
                <p className="mb-3 mt-1.5 text-[13.5px] leading-[1.5] text-app-ink-soft">
                  {t("close.type")} <strong className="text-app-ink">CLOSE</strong> {t("close.andPress")}
                </p>
                <label htmlFor="close-confirm" className="sr-only">{t("close.label")}</label>
                <div className="flex flex-wrap gap-2">
                  <input id="close-confirm" name="confirm" className={`${FIELD_INPUT} flex-1 basis-[160px]`} placeholder={t("close.placeholder")} />
                  <button type="submit" className={`${SUBMIT_WHITE} text-app-danger`}>{t("close.button")}</button>
                </div>
              </Card>
            </form>
          </aside>
        </div>
      </div>
    </SellerPage>
  );
}
