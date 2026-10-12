import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { CardHead, EmptyState, ListCard, ListRow, Pill, PillLink, TextLink, Thumb } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";

export const dynamic = "force-dynamic";

type RateTier = { name?: string; label?: string; price?: number | string; minOrder?: number; freeOver?: number };

function formatRate(rate: RateTier, currency = "NGN") {
  const symbol = currency === "GHS" ? "GH₵" : currency === "KES" ? "KSh" : "₦";
  if (rate.freeOver != null) return `Free over ${symbol}${Number(rate.freeOver).toLocaleString()}`;
  if (rate.price === 0 || rate.price === "0") return "Free";
  if (rate.price == null) return "Quote";
  return `${symbol}${Number(rate.price).toLocaleString()}`;
}

export default async function ShippingPage() {
  const user = await requireRole(["seller"], "/login");
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
      title="Delivery fees"
      sub="The delivery zones and fees customers pay, and delivery companies you can book."
      actions={<PillLink href="/home/shipping/new" tone="accent" icon="plus">Add zone</PillLink>}
    >
      <div className="grid gap-6">
        <section className="grid gap-3">
          <h2 className="m-0 text-[17px] font-extrabold">Your delivery zones</h2>
          {shippingZones.length === 0 ? (
            <EmptyState icon="pin" title="No delivery zones yet" action={<PillLink href="/home/shipping/new" tone="ink" icon="plus">Create a zone</PillLink>}>
              Add zones to set the delivery fees customers pay: a flat fee, free delivery, or different fees by area.
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
                        <Pill tone={zone.active ? "success" : "muted"} dot>{zone.active ? "On" : "Off"}</Pill>
                      </div>
                      {zone.regions.length > 0 && (
                        <div className="truncate text-[13px] text-app-ink-soft">
                          {zone.regions.slice(0, 4).join(" · ")}{zone.regions.length > 4 ? ` +${zone.regions.length - 4} more` : ""}
                        </div>
                      )}
                    </div>
                    {rates.length > 0 && (
                      <div className="flex min-w-0 flex-wrap gap-2">
                        {rates.map((rate, j) => (
                          <span key={j} className="rounded-[12px] bg-app-canvas px-3 py-1.5">
                            <span className="block text-[12px] text-app-ink-soft">{rate.label ?? rate.name ?? `Fee ${j + 1}`}</span>
                            <span className={`block text-[13.5px] font-extrabold ${rate.price === 0 || rate.freeOver != null ? "text-app-success" : ""}`}>{formatRate(rate, currency)}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    <PillLink href={`/home/shipping/${zone.id}`} size="sm" icon="edit">Edit</PillLink>
                  </ListRow>
                );
              })}
            </ListCard>
          )}
        </section>

        {logisticsPartners.length > 0 && (
          <section className="grid gap-3">
            <CardHead title="Delivery partners on Shopinbos" action={<TextLink href="/home/logistics">See all</TextLink>} />
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
                        Covers {zones.slice(0, 3).join(", ")}{zones.length > 3 ? ` +${zones.length - 3}` : ""}
                      </div>
                    )}
                    <PillLink href={`/home/logistics?partner=${partner.id}`} size="sm" className="mt-auto">Get a quote</PillLink>
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
