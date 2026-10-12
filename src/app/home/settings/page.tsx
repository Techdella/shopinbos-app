import { requireRole } from "@/lib/server-auth";
import { billingEmail } from "@/lib/auth/billing-email";
import { getSellerWorkspace } from "@/lib/workspace";
import { IdentityImageUploader } from "@/components/profile/IdentityImageUploader";
import { updateSellerProfile, saveNotificationPreferences, saveStoreSettings, saveBusinessAddress, closeStore, inviteTeamMember } from "@/app/actions/workspace";
import { hasPostalAddress, readBusinessAddress } from "@/lib/email/shell";
import { userLinks } from "@/lib/email/compliance.server";
import { PageToast } from "@/components/PageToast";
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
import { CHECKBOX, FIELD_HELP, FIELD_INPUT, FIELD_LABEL, FIELD_TEXTAREA, SUBMIT_INK, SUBMIT_WHITE } from "@/components/seller-settings/fields";
import { db } from "@/lib/db/client";
import { aiAllowanceToday } from "@/lib/ai/usage";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ tab?: string }>;
};

const TABS = ["Store", "Peggy & Rex", "Team", "Billing", "Notifications", "Security"] as const;
/** Old tab names still in links and redirects. */
const TAB_ALIASES: Record<string, (typeof TABS)[number]> = { "Peggy & AI": "Peggy & Rex" };

const NOTIFY_EVENTS = [
  { e: "orderPlaced", l: "New orders", d: "When a customer places an order" },
  { e: "orderShipped", l: "Order sent", d: "When an order is marked as sent" },
  { e: "orderDelivered", l: "Order delivered", d: "When a delivery is confirmed" },
  { e: "paymentConfirmed", l: "Payment received", d: "When a payout is processed" },
] as const;

export default async function SellerSettingsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const activeTab = params?.tab ? TAB_ALIASES[params.tab] ?? params.tab : "Store";
  const user = await requireRole(["seller"], "/login");
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

  // Saved notification choices; before the first save everything except WhatsApp starts on.
  const notify = workspace.settings.notifications;
  const channels = (notify?.enabledChannels ?? []) as string[];
  const eventOn = (key: (typeof NOTIFY_EVENTS)[number]["e"]) => (notify ? Boolean(notify.events?.[key]) : true);
  const channelOn = (key: string, fallback: boolean) => (notify ? channels.includes(key) : fallback);

  const storeName = store?.name ?? "Your Store";
  const storeUrl = store?.slug ? `${store.slug}.shopinbos.shop` : undefined;
  const storeLogoUrl = store?.logoUrl;
  const initials = user.name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);
  const pendingInvites = (brandSettings.pendingInvites ?? []) as string[];
  const businessAddress = readBusinessAddress(store?.brandSettings);
  const businessAddressReady = hasPostalAddress(businessAddress);
  const emailPreferencesUrl = userLinks(user.id)?.preferences ?? null;

  return (
    <SellerPage user={user} store={storeSummary(store)} title="Settings" sub="Your store, how Peggy and Rex work for you, your team, billing and alerts.">
      <PageToast />
      <div className="grid gap-5">
        <FilterChips items={TABS.map((t) => ({ label: t, href: `/home/settings?tab=${encodeURIComponent(t)}`, active: t === activeTab }))} />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="grid min-w-0 content-start gap-5">
            {activeTab === "Store" && (
              <>
                <Card className="p-5">
                  <CardHead title="Store logo" />
                  <div className="mt-4">
                    <IdentityImageUploader
                      kind="logo"
                      initialUrl={storeLogoUrl ?? null}
                      name={storeName}
                      title="Store logo"
                      hideTitle
                      hint="Shows on your shop, payment page, order pages, shipping labels and your menu. A square image works best."
                    />
                  </div>
                </Card>

                <form action={saveStoreSettings}>
                  <Card className="p-5">
                    <CardHead title="Store details" />
                    <div className="mt-4 grid gap-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="min-w-0">
                          <label htmlFor="storeName" className={FIELD_LABEL}>Store name</label>
                          <input id="storeName" name="storeName" className={FIELD_INPUT} defaultValue={storeName} />
                        </div>
                        <div className="min-w-0">
                          <label htmlFor="slug" className={FIELD_LABEL}>Store web name</label>
                          <input id="slug" name="slug" className={FIELD_INPUT} defaultValue={store?.slug ?? ""} />
                          {storeUrl && <p className={`${FIELD_HELP} truncate`}>Your address: {storeUrl}</p>}
                        </div>
                      </div>
                      <div>
                        <label htmlFor="tagline" className={FIELD_LABEL}>Tagline</label>
                        <input id="tagline" name="tagline" className={FIELD_INPUT} defaultValue={typeof brandSettings.tagline === "string" ? brandSettings.tagline : ""} />
                      </div>
                      <div>
                        <label htmlFor="description" className={FIELD_LABEL}>About your store</label>
                        <textarea id="description" name="description" className={FIELD_TEXTAREA} rows={4} defaultValue={store?.description ?? ""} />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="min-w-0">
                          <label htmlFor="city" className={FIELD_LABEL}>City</label>
                          <input id="city" name="city" className={FIELD_INPUT} defaultValue={store?.city ?? ""} />
                        </div>
                        <div className="min-w-0">
                          <span className={FIELD_LABEL}>Country</span>
                          <div className="flex h-[50px] items-center rounded-[16px] border border-app-line bg-app-canvas px-4 text-[15px]">{store?.country ?? "Nigeria"}</div>
                        </div>
                      </div>
                      <div>
                        <button type="submit" className={SUBMIT_INK}>Save store details</button>
                      </div>
                    </div>
                  </Card>
                </form>

                <form action={saveBusinessAddress} id="business-address" className="scroll-mt-24">
                  <Card className="p-5">
                    <CardHead
                      title="Business address"
                      sub="Shown in the footer of every email your store sends. Marketing emails can't go out without it: anti-spam laws and Gmail and Yahoo need a real postal address."
                      action={businessAddressReady ? <Pill tone="success">Added</Pill> : <Pill tone="warning">Needed for marketing</Pill>}
                    />
                    <div className="mt-4 grid gap-4">
                      <div>
                        <label htmlFor="legalName" className={FIELD_LABEL}>Registered business name</label>
                        <input id="legalName" name="legalName" className={FIELD_INPUT} defaultValue={businessAddress.legalName} placeholder={storeName} autoComplete="organization" />
                        <p className={FIELD_HELP}>Leave empty to use your store name.</p>
                      </div>
                      <div>
                        <label htmlFor="line1" className={FIELD_LABEL}>Street address</label>
                        <input id="line1" name="line1" className={FIELD_INPUT} defaultValue={businessAddress.line1} placeholder="12 Adeola Odeku Street" autoComplete="address-line1" />
                      </div>
                      <div>
                        <label htmlFor="line2" className={FIELD_LABEL}>Building, floor or landmark (optional)</label>
                        <input id="line2" name="line2" className={FIELD_INPUT} defaultValue={businessAddress.line2} autoComplete="address-line2" />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="min-w-0">
                          <label htmlFor="addressCity" className={FIELD_LABEL}>City</label>
                          <input id="addressCity" name="addressCity" className={FIELD_INPUT} defaultValue={businessAddress.city || store?.city || ""} autoComplete="address-level2" />
                        </div>
                        <div className="min-w-0">
                          <label htmlFor="addressState" className={FIELD_LABEL}>State</label>
                          <input id="addressState" name="addressState" className={FIELD_INPUT} defaultValue={businessAddress.state} placeholder="Lagos" autoComplete="address-level1" />
                        </div>
                        <div className="min-w-0">
                          <label htmlFor="postalCode" className={FIELD_LABEL}>Postal code (optional)</label>
                          <input id="postalCode" name="postalCode" className={FIELD_INPUT} defaultValue={businessAddress.postalCode} autoComplete="postal-code" />
                        </div>
                        <div className="min-w-0">
                          <label htmlFor="addressCountry" className={FIELD_LABEL}>Country</label>
                          <input id="addressCountry" name="addressCountry" className={FIELD_INPUT} defaultValue={businessAddress.country || store?.country || "Nigeria"} autoComplete="country-name" />
                        </div>
                        <div className="min-w-0">
                          <label htmlFor="addressEmail" className={FIELD_LABEL}>Customer contact email (optional)</label>
                          <input id="addressEmail" name="addressEmail" type="email" className={FIELD_INPUT} defaultValue={businessAddress.email} placeholder="hello@yourbrand.com" />
                        </div>
                        <div className="min-w-0">
                          <label htmlFor="addressPhone" className={FIELD_LABEL}>Customer contact phone (optional)</label>
                          <input id="addressPhone" name="addressPhone" type="tel" className={FIELD_INPUT} defaultValue={businessAddress.phone} />
                        </div>
                      </div>
                      <div>
                        <button type="submit" className={SUBMIT_INK}>Save business address</button>
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
                    <CardHead title="Contact details" />
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div className="min-w-0">
                        <span className={FIELD_LABEL}>Email</span>
                        <div className="flex h-[50px] min-w-0 items-center rounded-[16px] border border-app-line bg-app-canvas px-4 text-[15px]">
                          <span className="truncate">{user.email ?? "No email"}</span>
                        </div>
                        <p className={FIELD_HELP}>The email you sign in with.</p>
                      </div>
                      <div className="min-w-0">
                        <label htmlFor="phone" className={FIELD_LABEL}>Phone</label>
                        <input id="phone" name="phone" type="tel" className={FIELD_INPUT} defaultValue={user.phone ?? ""} placeholder="+234 800 000 0000" />
                      </div>
                    </div>
                    <button type="submit" className={`${SUBMIT_INK} mt-4`}>Save contact details</button>
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
                  <CardHead title="Team" sub="People who help run your store." className="px-5 pb-3 pt-5" />
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
                        <div className="truncate text-[13px] text-app-ink-soft">{user.email} · Owner</div>
                      </div>
                      <Pill tone="ink">You</Pill>
                    </li>
                    {pendingInvites.map((email) => (
                      <li key={email} className="flex items-center gap-3 px-5 py-3.5">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-app-canvas"><Icon name="mail" size={17} /></span>
                        <div className="min-w-0 flex-1 truncate text-[14.5px] font-bold">{email}</div>
                        <Pill tone="warning">Invite sent</Pill>
                      </li>
                    ))}
                  </ul>
                </Card>
                <form action={inviteTeamMember}>
                  <Card className="p-5">
                    <label htmlFor="invite-email" className="mb-3 block text-[17px] font-extrabold">Invite someone</label>
                    <div className="flex flex-wrap gap-3">
                      <input id="invite-email" name="email" type="email" className={`${FIELD_INPUT} flex-1 basis-[220px]`} placeholder="colleague@email.com" required />
                      <button type="submit" className={SUBMIT_INK}><Icon name="plus" size={16} /> Send invite</button>
                    </div>
                  </Card>
                </form>
              </>
            )}

            {activeTab === "Billing" && (
              <>
                <StoreLaunchBalanceCard balanceDue={Number(launchBilling?.balanceDue ?? 0)} dueAt={launchBilling?.dueAt} />
                <SellerBillingSection
                  userEmail={billingEmail(user)}
                  userName={user.name}
                  aiCredits={aiCredits}
                  productCount={productCount}
                />
              </>
            )}

            {activeTab === "Notifications" && emailPreferencesUrl && (
              <Card className="p-5">
                <CardHead
                  title="Emails from Shopinbos"
                  sub="Product news and tips, setup nudges and weekly summaries. Security, billing and account emails always arrive."
                  action={<PillLink href={emailPreferencesUrl} size="sm" tone="ink">Email preferences</PillLink>}
                />
              </Card>
            )}
            {activeTab === "Notifications" && (
              <form action={saveNotificationPreferences}>
                <Card className="p-5">
                  <CardHead title="Alerts" sub="What we tell you about, and how." action={<PillLink href="/home/notifications/preferences" size="sm">More options</PillLink>} />
                  <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
                    {NOTIFY_EVENTS.map((n) => (
                      <li key={n.e}>
                        <label className="flex min-h-[56px] cursor-pointer items-center gap-3 py-3">
                          <input type="checkbox" name={n.e} defaultChecked={eventOn(n.e)} className={CHECKBOX} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[14.5px] font-bold">{n.l}</span>
                            <span className="block text-[13px] text-app-ink-soft">{n.d}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <fieldset className="m-0 mt-4 border-0 p-0">
                    <legend className="mb-2 p-0 text-[14px] font-bold">Send alerts by</legend>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { name: "smsChannel", key: "sms", label: "SMS", on: true },
                        { name: "emailChannel", key: "email", label: "Email", on: true },
                        { name: "whatsappChannel", key: "whatsapp", label: "WhatsApp", on: false },
                      ].map((c) => (
                        <label key={c.name} className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-full border border-app-line px-4 text-[14px] font-bold has-[:checked]:border-app-ink">
                          <input type="checkbox" name={c.name} defaultChecked={channelOn(c.key, c.on)} className={CHECKBOX} />
                          {c.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <button type="submit" className={`${SUBMIT_INK} mt-5`}><Icon name="check" size={16} /> Save alerts</button>
                </Card>
              </form>
            )}
            {activeTab === "Security" && <SecuritySettings />}
          </div>

          <aside className="grid min-w-0 content-start gap-5">
            <Card className="p-5">
              <CardHead title="Customise your menu" sub="Switch off the parts of Shopinbos you don't use, and replay the walkthrough." action={<PillLink href="/home/features" size="sm" tone="ink">Open</PillLink>} />
            </Card>
            <AssistantNote who="peggy" action={<PillLink href="/home/settings?tab=Peggy+%26+Rex" size="sm" tone="ink">Review</PillLink>}>
              I remember your preferences, regular suppliers and brand voice. You can check or clear what I know any time.
            </AssistantNote>

            <Card className="p-5">
              <CardHead title="Your store" />
              <dl className="m-0 mt-2 divide-y divide-app-line">
                <div className="flex justify-between gap-3 py-2.5 text-[14px]"><dt className="text-app-ink-soft">Products</dt><dd className="m-0 font-extrabold">{productCount}</dd></div>
                <div className="flex justify-between gap-3 py-2.5 text-[14px]"><dt className="text-app-ink-soft">Delivery bookings</dt><dd className="m-0 font-extrabold">{bookingCount}</dd></div>
                {aiAllowance ? (
                  aiAllowance.map((row) => (
                    <div key={row.kind} className="flex justify-between gap-3 py-2.5 text-[14px]"><dt className="text-app-ink-soft">{row.label} today</dt><dd className="m-0 font-extrabold">{row.used} of {row.limit}</dd></div>
                  ))
                ) : (
                  <div className="flex justify-between gap-3 py-2.5 text-[14px]"><dt className="text-app-ink-soft">AI credits</dt><dd className="m-0 font-extrabold">{aiCredits}</dd></div>
                )}
              </dl>
            </Card>

            <form action={closeStore}>
              <Card className="border-[#F5C6C0] p-5">
                <h2 className="m-0 text-[15px] font-extrabold text-app-danger">Close your store</h2>
                <p className="mb-3 mt-1.5 text-[13.5px] leading-[1.5] text-app-ink-soft">
                  Type <strong className="text-app-ink">CLOSE</strong> and press the button. Shoppers won&apos;t be able to see your store.
                </p>
                <label htmlFor="close-confirm" className="sr-only">Type CLOSE to confirm</label>
                <div className="flex flex-wrap gap-2">
                  <input id="close-confirm" name="confirm" className={`${FIELD_INPUT} flex-1 basis-[160px]`} placeholder="Type CLOSE" />
                  <button type="submit" className={`${SUBMIT_WHITE} text-app-danger`}>Close store</button>
                </div>
              </Card>
            </form>
          </aside>
        </div>
      </div>
    </SellerPage>
  );
}
