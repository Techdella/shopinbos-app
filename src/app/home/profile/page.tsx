import { Suspense } from "react";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { updateSellerProfile } from "@/app/actions/workspace";
import { IdentityImageUploader } from "@/components/profile/IdentityImageUploader";
import { PageToast } from "@/components/PageToast";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, Card, CardHead, Pill, StatTile } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { FIELD_INPUT, FIELD_LABEL, FIELD_TEXTAREA, SUBMIT_INK } from "@/components/seller-settings/fields";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";

export const dynamic = "force-dynamic";

export default async function SellerProfilePage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  const store = workspace?.store ?? null;
  const storeName = store?.name ?? "Your Store";

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [account, productCount, monthOrders, reviewStats] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { createdAt: true, verificationStatus: true } }),
    store ? db.storeProduct.count({ where: { storeId: store.id } }) : Promise.resolve(0),
    store ? db.retailOrder.count({ where: { storeId: store.id, createdAt: { gte: monthStart } } }) : Promise.resolve(0),
    store ? db.productReview.aggregate({ where: { storeId: store.id }, _count: { _all: true }, _avg: { rating: true } }) : Promise.resolve(null),
  ]);
  const reviewCount = reviewStats?._count._all ?? 0;
  const avgRating = reviewStats?._avg.rating ?? null;
  const verified = account?.verificationStatus === "verified";

  return (
    <SellerPage user={user} store={storeSummary(store)} title="Profile" sub="How you and your store appear to buyers.">
      <Suspense fallback={null}><PageToast /></Suspense>
      <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-5">
          <Card className="flex flex-col items-center p-6 text-center">
            <h2 className="m-0 max-w-full truncate text-[18px] font-extrabold">{user.name}</h2>
            <p className="mb-3 mt-0.5 max-w-full truncate text-[13.5px] text-app-ink-soft">{storeName} · Seller</p>
            <Pill tone={verified ? "success" : "muted"} dot>{verified ? "Verified seller" : "Not verified yet"}</Pill>
            <div className="mt-5 w-full border-t border-app-line pt-4 text-left">
              <IdentityImageUploader
                kind="avatar"
                initialUrl={user.avatarUrl ?? null}
                name={user.name}
                title="Your photo"
                hint="Shows in the top bar, the menu, messages and your replies to reviews."
              />
            </div>
          </Card>

          <Card className="p-5">
            <CardHead title="Store logo" sub="Shows on your shop, payment page, order pages, shipping labels and your menu." />
            <div className="mt-4">
              {store ? (
                <IdentityImageUploader
                  kind="logo"
                  initialUrl={store.logoUrl ?? null}
                  name={storeName}
                  title="Store logo"
                  hideTitle
                  hint="A square image works best, ideally 512 × 512 or larger. Transparent PNGs keep their background."
                />
              ) : (
                <p className="m-0 text-[13.5px] text-app-ink-soft">Create your store first, then add its logo here.</p>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <CardHead title="Account" />
            <dl className="m-0 mt-2 divide-y divide-app-line">
              {[
                { label: "Email", value: user.email ?? "—" },
                { label: "Phone", value: user.phone ?? "—" },
                { label: "Joined", value: account ? account.createdAt.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : "—" },
              ].map((info) => (
                <div key={info.label} className="flex justify-between gap-3 py-2.5 text-[14px]">
                  <dt className="shrink-0 text-app-ink-soft">{info.label}</dt>
                  <dd className="m-0 min-w-0 truncate font-bold">{info.value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>

        <div className="grid min-w-0 content-start gap-5">
          <Card className="p-5">
            <CardHead title="Your store so far" />
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile tone="card" label="Products" value={productCount} />
              <StatTile tone="card" label="Orders" value={monthOrders} hint="this month" />
              <StatTile tone="card" label="Reviews" value={reviewCount} />
              <StatTile tone="card" label="Rating" value={avgRating ? avgRating.toFixed(1) : "—"} hint={avgRating ? "out of 5" : "no reviews yet"} />
            </div>
          </Card>

          <form action={updateSellerProfile}>
            <Card className="p-5">
              <CardHead title="Public profile" />
              <div className="mt-4 grid gap-4">
                <div>
                  <label htmlFor="name" className={FIELD_LABEL}>Display name</label>
                  <input id="name" name="name" className={FIELD_INPUT} defaultValue={user.name} />
                </div>
                <div>
                  <label htmlFor="description" className={FIELD_LABEL}>About you</label>
                  <textarea id="description" name="description" className={FIELD_TEXTAREA} rows={3} defaultValue={store?.description ?? ""} placeholder="Tell buyers about your store" />
                  <VoiceInputButton targetId="description" context="a description of a shop" className="mt-2" />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="min-w-0">
                    <label htmlFor="city" className={FIELD_LABEL}>City</label>
                    <input id="city" name="city" className={FIELD_INPUT} defaultValue={store?.city ?? user.city ?? ""} />
                  </div>
                  <div className="min-w-0">
                    <label htmlFor="country" className={FIELD_LABEL}>Country</label>
                    <input id="country" name="country" className={FIELD_INPUT} defaultValue={store?.country ?? user.country ?? "Nigeria"} />
                  </div>
                </div>
                <div>
                  <label htmlFor="phone" className={FIELD_LABEL}>Phone</label>
                  <input id="phone" name="phone" type="tel" className={FIELD_INPUT} defaultValue={user.phone ?? ""} />
                </div>
                <div>
                  <button type="submit" className={SUBMIT_INK}><Icon name="check" size={16} /> Save profile</button>
                </div>
              </div>
            </Card>
          </form>

          <AssistantNote who="peggy">
            <strong>Peggy&apos;s tip:</strong> a full profile with a short bio and your city helps buyers trust you.
          </AssistantNote>
        </div>
      </div>
    </SellerPage>
  );
}
