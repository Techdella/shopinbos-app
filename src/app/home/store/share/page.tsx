import { redirect } from "next/navigation";
import { featureOn } from "@/lib/feature-switches.server";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { PillLink } from "@/components/app-kit";
import { shopLinkFor } from "@/lib/shop-handle.server";
import { getT } from "@/lib/i18n/server";
import { PLUG_LIVE } from "@shared/shop-handle";
import { ShopLinkPanel } from "./ShopLinkPanel";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT("shopLink");
  return { title: t("title") };
}

// Shop link & QR: the shop's @handle, its short link (app.shopinbos.com/@handle) and a QR code to print for parcels
// and flyers (shared/shop-handle.ts). Opened from the store hub's Share menu.
export default async function ShopLinkPage() {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("shopLink", "store");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, customDomain: true, logoUrl: true } });
  if (!store) redirect("/onboarding?role=seller");

  const link = await shopLinkFor(store);

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("title")}
      sub={t("sub")}
      actions={<PillLink href="/home/store" icon="arrowLeft" iconOnlyOnPhone>{t("hub.title")}</PillLink>}
    >
      {link.handle ? (
        <ShopLinkPanel
          initial={{ handle: link.handle, shortUrl: link.shortUrl, shortHost: link.shortHost, storeUrl: link.storeUrl, storeName: link.storeName, logoUrl: link.logoUrl, canEdit: !user.staff }}
          plug={PLUG_LIVE || (await featureOn(user.id, "plug_follow_card"))}
        />
      ) : (
        <p className="text-[15px] text-app-ink-soft">{t("handle.none")}</p>
      )}
    </SellerPage>
  );
}
