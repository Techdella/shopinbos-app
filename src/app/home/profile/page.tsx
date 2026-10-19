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
import { getLocale, getT } from "@/lib/i18n/server";
import { formatDate } from "@shared/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT("account");
  return { title: t("profile.title") };
}

export default async function SellerProfilePage() {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("account", "common");
  const locale = await getLocale();
  const workspace = await getSellerWorkspace(user.id);
  const store = workspace?.store ?? null;
  const storeName = store?.name ?? t("profile.yourStore");

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
    <SellerPage user={user} store={storeSummary(store)} title={t("profile.title")} sub={t("profile.sub")}>
      <Suspense fallback={null}><PageToast /></Suspense>
      <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-5">
          <Card className="flex flex-col items-center p-6 text-center">
            <h2 className="m-0 max-w-full truncate text-[18px] font-extrabold">{user.name}</h2>
            <p className="mb-3 mt-0.5 max-w-full truncate text-[13.5px] text-app-ink-soft">{storeName} · {t("profile.seller")}</p>
            <Pill tone={verified ? "success" : "muted"} dot>{verified ? t("profile.verified") : t("profile.notVerified")}</Pill>
            <div className="mt-5 w-full border-t border-app-line pt-4 text-left">
              <IdentityImageUploader
                kind="avatar"
                initialUrl={user.avatarUrl ?? null}
                name={user.name}
                title={t("profile.photo")}
                hint={t("profile.photoHint")}
              />
            </div>
          </Card>

          <Card className="p-5">
            <CardHead title={t("logo.title")} sub={t("profile.logoSub")} />
            <div className="mt-4">
              {store ? (
                <IdentityImageUploader
                  kind="logo"
                  initialUrl={store.logoUrl ?? null}
                  name={storeName}
                  title={t("logo.title")}
                  hideTitle
                  hint={t("profile.logoHint")}
                />
              ) : (
                <p className="m-0 text-[13.5px] text-app-ink-soft">{t("profile.createFirst")}</p>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <CardHead title={t("profile.account")} />
            <dl className="m-0 mt-2 divide-y divide-app-line">
              {[
                { label: t("email"), value: user.email ?? "—" },
                { label: t("phone"), value: user.phone ?? "—" },
                { label: t("profile.joined"), value: account ? formatDate(account.createdAt, locale, { month: "long", year: "numeric" }) : "—" },
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
            <CardHead title={t("profile.soFar")} />
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile tone="card" label={t("store.products")} value={productCount} />
              <StatTile tone="card" label={t("profile.orders")} value={monthOrders} hint={t("profile.thisMonth")} />
              <StatTile tone="card" label={t("profile.reviews")} value={reviewCount} />
              <StatTile tone="card" label={t("profile.rating")} value={avgRating ? avgRating.toFixed(1) : "—"} hint={avgRating ? t("profile.outOf5") : t("profile.noReviews")} />
            </div>
          </Card>

          <form action={updateSellerProfile}>
            <Card className="p-5">
              <CardHead title={t("profile.public")} />
              <div className="mt-4 grid gap-4">
                <div>
                  <label htmlFor="name" className={FIELD_LABEL}>{t("profile.displayName")}</label>
                  <input id="name" name="name" className={FIELD_INPUT} defaultValue={user.name} />
                </div>
                <div>
                  <label htmlFor="description" className={FIELD_LABEL}>{t("profile.aboutYou")}</label>
                  <textarea id="description" name="description" className={FIELD_TEXTAREA} rows={3} defaultValue={store?.description ?? ""} placeholder={t("profile.aboutPlaceholder")} />
                  <VoiceInputButton targetId="description" context="a description of a shop" className="mt-2" />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="min-w-0">
                    <label htmlFor="city" className={FIELD_LABEL}>{t("city")}</label>
                    <input id="city" name="city" className={FIELD_INPUT} defaultValue={store?.city ?? user.city ?? ""} />
                  </div>
                  <div className="min-w-0">
                    <label htmlFor="country" className={FIELD_LABEL}>{t("country")}</label>
                    <input id="country" name="country" className={FIELD_INPUT} defaultValue={store?.country ?? user.country ?? "Nigeria"} />
                  </div>
                </div>
                <div>
                  <label htmlFor="phone" className={FIELD_LABEL}>{t("phone")}</label>
                  <input id="phone" name="phone" type="tel" className={FIELD_INPUT} defaultValue={user.phone ?? ""} />
                </div>
                <div>
                  <button type="submit" className={SUBMIT_INK}><Icon name="check" size={16} /> {t("profile.save")}</button>
                </div>
              </div>
            </Card>
          </form>

          <AssistantNote who="peggy">
            <strong>{t("profile.tipLabel")}</strong> {t("profile.tip")}
          </AssistantNote>
        </div>
      </div>
    </SellerPage>
  );
}
