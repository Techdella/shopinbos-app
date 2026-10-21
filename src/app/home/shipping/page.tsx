import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, CardHead, EmptyState, ListCard, ListRow, Pill, PillLink, TextLink, Thumb } from "@/components/app-kit";
import { DeliveryTip } from "@/components/delivery-market/DeliveryTip";
import { Icon } from "@/components/ui/Icon";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT("shipping");
  return { title: t("zones.title") };
}

type RateTier = { name?: string; label?: string; price?: number | string; minOrder?: number; freeOver?: number };
type ShippingT = Awaited<ReturnType<typeof getT<["shipping", "common"]>>>;

function formatRate(rate: RateTier, t: ShippingT, currency = "NGN") {
  const symbol = currency === "GHS" ? "GH₵" : currency === "KES" ? "KSh" : "₦";
  if (rate.freeOver != null) return t("rate.freeOver", { amount: `${symbol}${Number(rate.freeOver).toLocaleString()}` });
  if (rate.price === 0 || rate.price === "0") return t("rate.free");
  if (rate.price == null) return t("rate.quote");
  return `${symbol}${Number(rate.price).toLocaleString()}`;
}

export default async function ShippingPage() {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("shipping", "common");
  const workspace = await getSellerWorkspace(user.id);
  const store = workspace?.store;
  const currency = store?.currency ?? "NGN";

  const [shippingZones, logisticsPartners] = await Promise.all([
    store
      ? db.shippingZone.findMany({
          where: { storeId: store.id },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        })
      : Promise.resolve([]),
    db.logisticsPartner.findMany({
      where: { status: "active" },
      orderBy: { reliabilityScore: "desc" },
      take: 6,
      select: {
        id: true,
        displayName: true,
        city: true,
        country: true,
        coverageZones: true,
        reliabilityScore: true,
        rating: true,
        logoUrl: true,
        description: true,
      },
    }),
  ]);

  return (
    <SellerPage
      user={user}
      store={storeSummary(store ?? null)}
      title={t("zones.title")}
      sub={t("zones.sub")}
      actions={<PillLink href="/home/shipping/new" tone="accent" icon="plus">{t("zones.add")}</PillLink>}
    >
      <div className="grid gap-6">
        <DeliveryTip>
          <AssistantNote who="peggy">{t("tip.list")}</AssistantNote>
        </DeliveryTip>

        <section className="grid gap-3">
          <div>
            <h2 className="m-0 text-[17px] font-extrabold">{t("zones.yours")}</h2>
            <p className="m-0 mt-0.5 text-[13px] text-app-ink-soft">{t("zones.yoursSub")}</p>
          </div>
          {shippingZones.length === 0 ? (
            <EmptyState icon="pin" title={t("zones.empty")} action={<PillLink href="/home/shipping/new" tone="ink" icon="plus">{t("zones.create")}</PillLink>}>
              {t("zones.emptySub")}
            </EmptyState>
          ) : (
            <ListCard>
              {shippingZones.map((zone) => {
                const rates = Array.isArray(zone.rates) ? (zone.rates as RateTier[]) : [];
                return (
                  <ListRow key={zone.id} className={zone.active ? "" : "opacity-70"}>
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-app-canvas"><Icon name="pin" size={18} /></span>
                    <div className="min-w-0 flex-1 basis-[200px]">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-[14.5px] font-extrabold">{zone.name}</span>
                        <Pill tone={zone.active ? "success" : "muted"} dot>{zone.active ? t("on") : t("off")}</Pill>
                      </div>
                      {zone.regions.length > 0 && (
                        <div className="truncate text-[13px] text-app-ink-soft">
                          {zone.regions.slice(0, 4).join(" · ")}{zone.regions.length > 4 ? ` ${t("zones.more", { count: zone.regions.length - 4 })}` : ""}
                        </div>
                      )}
                    </div>
                    {rates.length > 0 && (
                      <div className="flex min-w-0 flex-wrap gap-2">
                        {rates.map((rate, j) => (
                          <span key={j} className="rounded-[12px] bg-app-canvas px-3 py-1.5">
                            <span className="block text-[12px] text-app-ink-soft">{rate.label ?? rate.name ?? t("rate.fee", { n: j + 1 })}</span>
                            <span className={`block text-[13.5px] font-extrabold ${rate.price === 0 || rate.freeOver != null ? "text-app-success" : ""}`}>{formatRate(rate, t, currency)}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    <PillLink href={`/home/shipping/${zone.id}`} size="sm" icon="edit">{t("edit")}</PillLink>
                  </ListRow>
                );
              })}
            </ListCard>
          )}
        </section>

        {logisticsPartners.length > 0 && (
          <section className="grid gap-3">
            <CardHead title={t("partners.title")} sub={t("partners.sub")} action={<TextLink href="/home/logistics">{t("partners.seeAll")}</TextLink>} />
            <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
              {logisticsPartners.map((partner) => {
                const zones = (partner.coverageZones ?? []) as string[];
                return (
                  <li key={partner.id} className="flex min-w-0 flex-col gap-3 rounded-[22px] border border-app-line bg-white p-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <Thumb src={partner.logoUrl} label={partner.displayName} size={44} />
                      <div className="min-w-0">
                        <div className="truncate text-[14.5px] font-extrabold">{partner.displayName}</div>
                        <div className="truncate text-[13px] text-app-ink-soft">
                          {partner.city}{partner.country ? `, ${partner.country}` : ""}
                          {partner.rating ? ` · ★ ${Number(partner.rating).toFixed(1)}` : ""}
                        </div>
                      </div>
                    </div>
                    {zones.length > 0 && (
                      <div className="text-[13px] text-app-ink-soft">
                        {t("partners.covers", { zones: zones.slice(0, 3).join(", ") })}{zones.length > 3 ? ` +${zones.length - 3}` : ""}
                      </div>
                    )}
                    <PillLink href={`/home/logistics?partner=${partner.id}`} size="sm" className="mt-auto">{t("getQuote")}</PillLink>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </SellerPage>
  );
}
