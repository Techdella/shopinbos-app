import Link from "next/link";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { Card, CardHead, EmptyState, ListCard, ListRow, Pill, PillLink, StatGrid, StatTile } from "@/components/app-kit";
import { buildDirectStorefrontPath } from "@/lib/domains/storefront";
import { readCartSettings, sanitizeLines, CHECKOUT_STEP_LABELS, type CheckoutStep } from "@shared/cart-checkout";
import { CartSettings } from "./CartSettings";
import { formatMoney, formatNumber, formatRelative, type Locale } from "@shared/i18n";
import { getLocale, getT } from "@/lib/i18n/server";
import { pageWindow } from "@/lib/pagination";
import { Pagination } from "@/components/seller/Pagination";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export async function generateMetadata() {
  const t = await getT("store");
  return { title: t("cart.title") };
}

const nairaFor = (locale: Locale) => (amount: number) =>
  locale === "en" ? `₦${Math.round(amount).toLocaleString("en-NG")}` : formatMoney(Math.round(amount), locale);

function ago(date: Date, locale: Locale) {
  if (locale !== "en") return formatRelative(date, locale);
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export default async function CommerceCartPage({ searchParams }: { searchParams?: Promise<{ page?: string }> }) {
  const { page: rawPage } = (await searchParams) ?? {};
  const user = await requireRole(["seller"], "/login");
  const t = await getT("store");
  const locale = await getLocale();
  const naira = nairaFor(locale);
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, brandSettings: true } });
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const openWhere = { storeId: store?.id ?? "__none__", recoveredAt: null, createdAt: { gte: since } };
  const [open, recovered, wishlistTop, wishlistShoppers] = store
    ? await Promise.all([
        db.abandonedCartEvent.aggregate({ where: openWhere, _count: true, _sum: { subtotal: true } }),
        db.abandonedCartEvent.aggregate({ where: { storeId: store.id, recoveredAt: { gte: since } }, _count: true, _sum: { subtotal: true } }),
        db.storeWishlistItem.groupBy({ by: ["productId"], where: { storeId: store.id }, _count: { productId: true }, orderBy: { _count: { productId: "desc" } }, take: 5 }),
        db.storeWishlistItem.groupBy({ by: ["visitorId"], where: { storeId: store.id } }),
      ])
    : [null, null, [], []];
  // Every cart left in the last 30 days, a page at a time.
  const paging = pageWindow(rawPage, open?._count ?? 0, PAGE_SIZE);
  const recent = store && paging.total
    ? await db.abandonedCartEvent.findMany({
        where: openWhere,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip: paging.skip,
        take: paging.take,
        select: { id: true, email: true, phone: true, name: true, items: true, subtotal: true, checkoutStep: true, remindersSent: true, updatedAt: true },
      })
    : [];

  const topIds = wishlistTop.map((row) => row.productId);
  const topProducts = topIds.length ? await db.storeProduct.findMany({ where: { id: { in: topIds } }, select: { id: true, name: true } }) : [];
  const nameOf = new Map(topProducts.map((product) => [product.id, product.name]));
  const settings = readCartSettings(store?.brandSettings);

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("cart.title")}
      sub={t("cart.sub")}
      actions={store ? <PillLink href={buildDirectStorefrontPath(store.slug, "/cart")} icon="eye">{t("cart.seeBag")}</PillLink> : undefined}
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid min-w-0 content-start gap-5">
          <CartSettings initial={settings} />

          <section aria-labelledby="left-carts" className="grid gap-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="left-carts" className="m-0 text-[19px] font-extrabold">{t("cart.left")}</h2>
                <p className="m-0 mt-0.5 text-[13.5px] text-app-ink-soft">{t("cart.leftSub")}</p>
              </div>
              <PillLink href="/home/automations" size="sm" icon="automation">{t("cart.reminders")}</PillLink>
            </div>
            <StatGrid>
              <StatTile tone="card" label={t("cart.waiting")} value={formatNumber(open?._count ?? 0, locale)} hint={naira(open?._sum.subtotal ?? 0)} />
              <StatTile tone="card" label={t("cart.recovered")} value={formatNumber(recovered?._count ?? 0, locale)} hint={naira(recovered?._sum.subtotal ?? 0)} />
            </StatGrid>
            {recent.length === 0 ? (
              <EmptyState icon="cart" title={t("cart.none")}>{t("cart.noneSub")}</EmptyState>
            ) : (
              <div>
              <ListCard>
                {recent.map((cart) => {
                  const lines = sanitizeLines(cart.items);
                  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
                  const step = cart.checkoutStep && cart.checkoutStep in CHECKOUT_STEP_LABELS ? t(`cart.step.${cart.checkoutStep as CheckoutStep}`) : null;
                  return (
                    <ListRow key={cart.id}>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14.5px] font-bold">{cart.name || cart.email || cart.phone}</div>
                        <div className="truncate text-[13px] text-app-ink-soft">
                          {[cart.name ? cart.email || cart.phone : null, t("cart.items", { count, names: `${lines.map((line) => line.name).slice(0, 2).join(", ")}${lines.length > 2 ? "…" : ""}` })].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      {step ? <Pill tone="muted">{t("cart.leftAt", { step })}</Pill> : null}
                      {cart.remindersSent ? <Pill tone="info">{t("cart.remindersSent", { count: cart.remindersSent })}</Pill> : null}
                      <div className="text-right">
                        <div className="text-[14.5px] font-bold tabular-nums">{naira(cart.subtotal)}</div>
                        <div className="text-[12.5px] text-app-ink-soft">{ago(cart.updatedAt, locale)}</div>
                      </div>
                    </ListRow>
                  );
                })}
              </ListCard>
              <Pagination {...paging} base="/home/commerce/cart" label={t("cart.pages")} />
              </div>
            )}
          </section>
        </div>

        <aside className="grid min-w-0 content-start gap-5">
          <Card className="p-5">
            <CardHead title={t("cart.mostWished")} sub={t("cart.shoppersSaved", { count: wishlistShoppers.length })} />
            {wishlistTop.length === 0 ? (
              <p className="m-0 mt-3 text-[14px] text-app-ink-soft">{t("cart.nothingSaved")}</p>
            ) : (
              <ol className="m-0 mt-3 grid list-none gap-2 p-0">
                {wishlistTop.map((row, index) => (
                  <li key={row.productId} className="flex items-center gap-3 text-[14px]">
                    <span className="w-5 text-app-ink-soft">{index + 1}</span>
                    <Link href={`/products/${row.productId}`} className="min-w-0 flex-1 truncate font-bold hover:underline">{nameOf.get(row.productId) ?? t("cart.removed")}</Link>
                    <span className="tabular-nums text-app-ink-soft">{t("cart.savedCount", { count: row._count.productId })}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
          <Card className="p-5">
            <CardHead title={t("cart.whatGet")} />
            <ul className="m-0 mt-3 grid list-none gap-2.5 p-0 text-[13.5px] leading-[1.5]">
              <li className="flex gap-2"><span aria-hidden>•</span>{t("cart.get1")}</li>
              <li className="flex gap-2"><span aria-hidden>•</span>{t("cart.get2")}</li>
              <li className="flex gap-2"><span aria-hidden>•</span>{t("cart.get3")}</li>
            </ul>
          </Card>
        </aside>
      </div>
    </SellerPage>
  );
}
