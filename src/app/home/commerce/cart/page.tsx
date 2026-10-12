import Link from "next/link";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { Card, CardHead, EmptyState, ListCard, ListRow, Pill, PillLink, StatGrid, StatTile } from "@/components/app-kit";
import { buildDirectStorefrontPath } from "@/lib/domains/storefront";
import { readCartSettings, sanitizeLines, CHECKOUT_STEP_LABELS, type CheckoutStep } from "@shared/cart-checkout";
import { CartSettings } from "./CartSettings";

export const dynamic = "force-dynamic";

const naira = (amount: number) => `₦${Math.round(amount).toLocaleString("en-NG")}`;

function ago(date: Date) {
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export default async function CommerceCartPage() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, brandSettings: true } });
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [open, recovered, recent, wishlistTop, wishlistShoppers] = store
    ? await Promise.all([
        db.abandonedCartEvent.aggregate({ where: { storeId: store.id, recoveredAt: null, createdAt: { gte: since } }, _count: true, _sum: { subtotal: true } }),
        db.abandonedCartEvent.aggregate({ where: { storeId: store.id, recoveredAt: { gte: since } }, _count: true, _sum: { subtotal: true } }),
        db.abandonedCartEvent.findMany({
          where: { storeId: store.id, recoveredAt: null, createdAt: { gte: since } },
          orderBy: { updatedAt: "desc" },
          take: 8,
          select: { id: true, email: true, phone: true, name: true, items: true, subtotal: true, checkoutStep: true, remindersSent: true, updatedAt: true },
        }),
        db.storeWishlistItem.groupBy({ by: ["productId"], where: { storeId: store.id }, _count: { productId: true }, orderBy: { _count: { productId: "desc" } }, take: 5 }),
        db.storeWishlistItem.groupBy({ by: ["visitorId"], where: { storeId: store.id } }),
      ])
    : [null, null, [], [], []];

  const topIds = wishlistTop.map((row) => row.productId);
  const topProducts = topIds.length ? await db.storeProduct.findMany({ where: { id: { in: topIds } }, select: { id: true, name: true } }) : [];
  const nameOf = new Map(topProducts.map((product) => [product.id, product.name]));
  const settings = readCartSettings(store?.brandSettings);

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Cart and wishlist"
      sub="How the bag behaves in your store, wishlists, and the carts shoppers left behind."
      actions={store ? <PillLink href={buildDirectStorefrontPath(store.slug, "/cart")} icon="eye">See your bag page</PillLink> : undefined}
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid min-w-0 content-start gap-5">
          <CartSettings initial={settings} />

          <section aria-labelledby="left-carts" className="grid gap-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="left-carts" className="m-0 text-[19px] font-extrabold">Carts left behind</h2>
                <p className="m-0 mt-0.5 text-[13.5px] text-app-ink-soft">Saved when a shopper gives their email or phone before paying but doesn&apos;t finish. Last 30 days.</p>
              </div>
              <PillLink href="/home/automations" size="sm" icon="automation">Reminder emails</PillLink>
            </div>
            <StatGrid>
              <StatTile tone="card" label="Waiting" value={(open?._count ?? 0).toLocaleString("en-NG")} hint={naira(open?._sum.subtotal ?? 0)} />
              <StatTile tone="card" label="Recovered" value={(recovered?._count ?? 0).toLocaleString("en-NG")} hint={naira(recovered?._sum.subtotal ?? 0)} />
            </StatGrid>
            {recent.length === 0 ? (
              <EmptyState icon="cart" title="No carts left behind">When a customer doesn&apos;t finish paying after giving their email or phone, their bag shows up here.</EmptyState>
            ) : (
              <ListCard>
                {recent.map((cart) => {
                  const lines = sanitizeLines(cart.items);
                  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
                  const step = cart.checkoutStep && cart.checkoutStep in CHECKOUT_STEP_LABELS ? CHECKOUT_STEP_LABELS[cart.checkoutStep as CheckoutStep] : null;
                  return (
                    <ListRow key={cart.id}>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14.5px] font-bold">{cart.name || cart.email || cart.phone}</div>
                        <div className="truncate text-[13px] text-app-ink-soft">
                          {[cart.name ? cart.email || cart.phone : null, `${count} ${count === 1 ? "item" : "items"}: ${lines.map((line) => line.name).slice(0, 2).join(", ")}${lines.length > 2 ? "…" : ""}`].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      {step ? <Pill tone="muted">Left at {step.toLowerCase()}</Pill> : null}
                      {cart.remindersSent ? <Pill tone="info">{cart.remindersSent} reminder{cart.remindersSent === 1 ? "" : "s"}</Pill> : null}
                      <div className="text-right">
                        <div className="text-[14.5px] font-bold tabular-nums">{naira(cart.subtotal)}</div>
                        <div className="text-[12.5px] text-app-ink-soft">{ago(cart.updatedAt)}</div>
                      </div>
                    </ListRow>
                  );
                })}
              </ListCard>
            )}
          </section>
        </div>

        <aside className="grid min-w-0 content-start gap-5">
          <Card className="p-5">
            <CardHead title="Most wished for" sub={`${wishlistShoppers.length.toLocaleString("en-NG")} ${wishlistShoppers.length === 1 ? "shopper has" : "shoppers have"} saved items`} />
            {wishlistTop.length === 0 ? (
              <p className="m-0 mt-3 text-[14px] text-app-ink-soft">Nothing saved yet. Shoppers tap the heart on a product to save it.</p>
            ) : (
              <ol className="m-0 mt-3 grid list-none gap-2 p-0">
                {wishlistTop.map((row, index) => (
                  <li key={row.productId} className="flex items-center gap-3 text-[14px]">
                    <span className="w-5 text-app-ink-soft">{index + 1}</span>
                    <Link href={`/products/${row.productId}`} className="min-w-0 flex-1 truncate font-bold hover:underline">{nameOf.get(row.productId) ?? "Removed product"}</Link>
                    <span className="tabular-nums text-app-ink-soft">{row._count.productId} saved</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
          <Card className="p-5">
            <CardHead title="What shoppers get" />
            <ul className="m-0 mt-3 grid list-none gap-2.5 p-0 text-[13.5px] leading-[1.5]">
              <li className="flex gap-2"><span aria-hidden>•</span>A full bag page with quantities, save for later, discount code, delivery estimate from your zones and free-delivery progress.</li>
              <li className="flex gap-2"><span aria-hidden>•</span>A wishlist page they can share with a link or on WhatsApp.</li>
              <li className="flex gap-2"><span aria-hidden>•</span>A reminder link that puts a left-behind bag back exactly as it was.</li>
            </ul>
          </Card>
        </aside>
      </div>
    </SellerPage>
  );
}
