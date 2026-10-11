import { requireRole } from "@/lib/server-auth";
import { billingEmail } from "@/lib/auth/billing-email";
import { getSellerWorkspace } from "@/lib/workspace";
import { updateSellerProfile, saveNotificationPreferences, saveStoreSettings, uploadStoreLogo, closeStore, inviteTeamMember } from "@/app/actions/workspace";
import { PageToast } from "@/components/PageToast";
import Image from "next/image";
import { SellerBillingSection } from "@/components/payments/SellerBillingSection";
import { StoreLaunchBalanceCard } from "@/components/billing/StoreLaunchBalanceCard";
import { PeggyPreferencesForm } from "@/components/settings/PeggyPreferencesForm";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, Card, CardHead, FilterChips, Pill, PillLink } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { CHECKBOX, FIELD_HELP, FIELD_INPUT, FIELD_LABEL, FIELD_TEXTAREA, SUBMIT_INK, SUBMIT_WHITE } from "@/components/seller-settings/fields";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ tab?: string }>;
};

const TABS = ["Store", "Peggy & AI", "Team", "Billing", "Notifications"] as const;

const NOTIFY_EVENTS = [
  { e: "orderPlaced", l: "New orders", d: "When a customer places an order" },
  { e: "orderShipped", l: "Order sent", d: "When an order is marked as sent" },
  { e: "orderDelivered", l: "Order delivered", d: "When a delivery is confirmed" },
  { e: "paymentConfirmed", l: "Payment received", d: "When a payout is processed" },
] as const;

export default async function SellerSettingsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const activeTab = params?.tab ?? "Store";
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

  return (
    <SellerPage user={user} store={storeSummary(store)} title="Settings" sub="Your store, what Peggy knows, your team, billing and alerts.">
      <PageToast />
      <div className="grid gap-5">
        <FilterChips items={TABS.map((t) => ({ label: t, href: `/home/settings?tab=${encodeURIComponent(t)}`, active: t === activeTab }))} />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="grid min-w-0 content-start gap-5">
            {activeTab === "Store" && (
              <>
                <Card className="p-5">
                  <CardHead title="Store logo" />
                  <div className="mt-4 flex flex-wrap items-center gap-4">
                    {storeLogoUrl ? (
                      <Image src={storeLogoUrl} alt="Store logo" width={64} height={64} className="h-16 w-16 rounded-[14px] border border-app-line object-cover" unoptimized />
                    ) : (
                      <span className="grid h-16 w-16 place-items-center rounded-[14px] border border-app-line bg-app-canvas text-[24px] font-extrabold">{storeName.charAt(0).toUpperCase()}</span>
                    )}
                    <form action={uploadStoreLogo} className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                      <label htmlFor="logo" className="sr-only">Choose a logo image</label>
                      <input
                        id="logo"
                        type="file"
                        name="logo"
                        accept="image/*"
                        required
                        className="min-w-0 flex-1 text-[13.5px] file:mr-3 file:min-h-[40px] file:cursor-pointer file:rounded-full file:border file:border-app-line file:bg-white file:px-4 file:text-[13.5px] file:font-bold"
                      />
                      <button type="submit" className={SUBMIT_INK}>Upload</button>
                    </form>
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

            {activeTab === "Peggy & AI" && (
              <PeggyPreferencesForm
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                defaultMemory={(workspace.settings.onboardingMemory as any)?.notes ?? ""}
                defaultCommStyle={savedCommStyle}
                defaultDailyBrief={savedDailyBrief}
              />
            )}

            {activeTab === "Team" && (
              <>
                <Card className="overflow-hidden">
                  <CardHead title="Team" sub="People who help run your store." className="px-5 pb-3 pt-5" />
                  <ul className="m-0 list-none divide-y divide-app-line border-t border-app-line p-0">
                    <li className="flex items-center gap-3 px-5 py-3.5">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-app-ink text-[14px] font-extrabold text-white">{initials}</span>
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
          </div>

          <aside className="grid min-w-0 content-start gap-5">
            <Card className="p-5">
              <CardHead title="Customise your menu" sub="Switch off the parts of Shopinbos you don't use, and replay the walkthrough." action={<PillLink href="/home/features" size="sm" tone="ink">Open</PillLink>} />
            </Card>
            <AssistantNote who="peggy" action={<PillLink href="/home/settings?tab=Peggy+%26+AI" size="sm" tone="ink">Review</PillLink>}>
              I remember your preferences, regular suppliers and brand voice. You can check or clear what I know any time.
            </AssistantNote>

            <Card className="p-5">
              <CardHead title="Your store" />
              <dl className="m-0 mt-2 divide-y divide-app-line">
                <div className="flex justify-between gap-3 py-2.5 text-[14px]"><dt className="text-app-ink-soft">Products</dt><dd className="m-0 font-extrabold">{productCount}</dd></div>
                <div className="flex justify-between gap-3 py-2.5 text-[14px]"><dt className="text-app-ink-soft">Delivery bookings</dt><dd className="m-0 font-extrabold">{bookingCount}</dd></div>
                <div className="flex justify-between gap-3 py-2.5 text-[14px]"><dt className="text-app-ink-soft">AI credits</dt><dd className="m-0 font-extrabold">{aiCredits}</dd></div>
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
