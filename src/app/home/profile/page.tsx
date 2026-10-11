import { Suspense } from "react";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { updateSellerProfile, uploadAvatar } from "@/app/actions/workspace";
import { PageToast } from "@/components/PageToast";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, Card, CardHead, Pill, StatTile } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { FIELD_INPUT, FIELD_LABEL, FIELD_TEXTAREA, SUBMIT_INK } from "@/components/seller-settings/fields";

export const dynamic = "force-dynamic";

export default async function SellerProfilePage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  const store = workspace?.store ?? null;
  const storeName = store?.name ?? "Your Store";
  const initials = user.name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);

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
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt="" className="h-20 w-20 rounded-full border border-app-line object-cover" />
            ) : (
              <span className="grid h-20 w-20 place-items-center rounded-full bg-app-ink text-[28px] font-extrabold text-white">{initials}</span>
            )}
            <h2 className="mb-0 mt-3 max-w-full truncate text-[18px] font-extrabold">{user.name}</h2>
            <p className="mb-3 mt-0.5 max-w-full truncate text-[13.5px] text-app-ink-soft">{storeName} · Seller</p>
            <Pill tone={verified ? "success" : "muted"} dot>{verified ? "Verified seller" : "Not verified yet"}</Pill>

            <form action={uploadAvatar} className="mt-5 grid w-full gap-3 border-t border-app-line pt-4">
              <label htmlFor="avatar" className="text-[14px] font-bold">Change photo</label>
              <input
                id="avatar"
                type="file"
                name="avatar"
                accept="image/*"
                className="w-full min-w-0 text-[13px] file:mr-3 file:min-h-[40px] file:cursor-pointer file:rounded-full file:border file:border-app-line file:bg-white file:px-4 file:text-[13.5px] file:font-bold"
              />
              <button type="submit" className={SUBMIT_INK}>Upload</button>
            </form>
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
