import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, Card, CardHead, FilterChips, ListCard, ListRow, Pill, PillLink, StatGrid, StatTile, Thumb, EmptyState, type Tone } from "@/components/app-kit";
import { QuoteRequestForm } from "./QuoteRequestForm";
import { AcceptQuoteButton } from "./AcceptQuoteButton";
import { CancelNetworkBooking, NetworkDelivery } from "./NetworkDelivery";
import { NetworkAccounts } from "./NetworkAccounts";
import { sellerNetworks } from "@/lib/logistics/networks.server";
import { canStoreNetworkAccounts } from "@/lib/logistics/carriers/accounts.server";
import { Notice } from "@/components/app-ui";
import { messagesHref } from "@/lib/conversations/pure";
import { getLocale, getT } from "@/lib/i18n/server";
import { formatDate, formatMoney } from "@shared/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT("shipping");
  return { title: t("lg.title") };
}

const ACTIVE = ["pending", "confirmed", "picked_up", "in_transit"] as const;

const QUOTE_TONE: Record<string, Tone> = { pending: "warning", responded: "info", accepted: "success", rejected: "muted", expired: "muted" };

const BOOKING_TONE: Record<string, Tone> = { pending: "warning", confirmed: "info", picked_up: "info", in_transit: "info", delivered: "success", failed: "danger", cancelled: "muted" };

const FILTERS = [
  { key: "all" },
  { key: "same_day" },
  { key: "nationwide" },
] as const;

// partner may be an id or a slug; logisticsSlug arrives from the marketing site ("Book delivery" intent).
// network: the result of paying for a delivery network booking (booked | failed | pending); order: book for an order.
type Search = { filter?: string; partner?: string; intent?: string; logisticsSlug?: string; network?: string; order?: string };

export default async function SellerLogisticsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const t = await getT("shipping", "common");
  const locale = await getLocale();
  const fmt = (n: number) => formatMoney(Math.round(n), locale);
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace) return null;

  const filter = FILTERS.find((f) => f.key === params.filter)?.key ?? "all";
  const partnerRef = params.partner ?? params.logisticsSlug;
  const chosen = partnerRef
    ? await db.logisticsPartner.findFirst({ where: { OR: [{ id: partnerRef }, { slug: partnerRef }], carrier: null }, select: { id: true } })
    : null;
  const chosenId = chosen?.id;

  const [partners, quoteCount, pendingQuotes, activeCount, deliveredCount, recentQuotes, recentBookings] = await Promise.all([
    db.logisticsPartner.findMany({
      where: {
        status: "active",
        verificationStatus: "verified",
        carrier: null,
        ...(filter === "same_day" ? { deliveryTypes: { has: "same_day" } } : {}),
        ...(filter === "nationwide" ? { coverageZones: { hasSome: ["Nationwide", "nationwide"] } } : {}),
      },
      orderBy: [{ reliabilityScore: "desc" }, { rating: "desc" }],
      take: 30,
    }),
    db.deliveryQuoteRequest.count({ where: { sellerId: user.id } }),
    db.deliveryQuoteRequest.count({ where: { sellerId: user.id, status: { in: ["pending", "responded"] } } }),
    db.deliveryBooking.count({ where: { sellerId: user.id, status: { in: [...ACTIVE] } } }),
    db.deliveryBooking.count({ where: { sellerId: user.id, status: "delivered" } }),
    db.deliveryQuoteRequest.findMany({ where: { sellerId: user.id }, include: { logisticsPartner: { select: { displayName: true } } }, orderBy: { createdAt: "desc" }, take: 6 }),
    db.deliveryBooking.findMany({ where: { sellerId: user.id }, include: { logisticsPartner: { select: { displayName: true } } }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  const networks = await sellerNetworks(user.id);
  const networkOptions = networks
    .map((n) => ({ id: n.id, name: n.name, via: n.account ? ("own" as const) : n.viaShopinbos ? ("shopinbos" as const) : null }))
    .filter((n) => n.via !== null);
  const paymentResult = params.network === "booked" || params.network === "failed" || params.network === "pending" ? params.network : null;

  const allVerified = filter === "all"
    ? partners
    : await db.logisticsPartner.findMany({ where: { status: "active", verificationStatus: "verified", carrier: null }, orderBy: { displayName: "asc" }, take: 100 });
  const partnerOptions = allVerified.map((p) => ({ id: p.id, name: `${p.displayName} · ${p.city}` }));
  const date = (d: Date) => formatDate(d, locale, { day: "numeric", month: "short" });

  return (
    <SellerPage
      user={user}
      store={storeSummary(workspace.store)}
      title={t("lg.title")}
      sub={t("lg.sub")}
      actions={
        <>
          <PillLink href="/marketplace?type=logistics" icon="truck">{t("lg.findPartners")}</PillLink>
          <PillLink href="/home/logistics?intent=book_delivery#quote" tone="accent" icon="plus">{t("lg.book")}</PillLink>
        </>
      }
    >
      <div className="grid gap-5">
        <StatGrid>
          <StatTile tone="card" label={t("lg.onTheWay")} value={activeCount} />
          <StatTile tone="card" label={t("lg.delivered")} value={deliveredCount} />
          <StatTile tone="card" label={t("lg.quotesWaiting")} value={pendingQuotes} hint={t("lg.askedTotal", { count: quoteCount })} />
          <StatTile tone="card" label={t("lg.verified")} value={allVerified.length} />
        </StatGrid>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
          <div className="grid min-w-0 content-start gap-5">
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-end justify-between gap-3 px-5 pb-4 pt-5">
                <CardHead title={t("lg.yourDeliveries")} sub={t("lg.latest")} />
              </div>
              {recentBookings.length === 0 ? (
                <p className="m-0 border-t border-app-line px-5 py-8 text-center text-[14px] text-app-ink-soft">{t("lg.noBookings")}</p>
              ) : (
                <ul className="m-0 list-none divide-y divide-app-line border-t border-app-line p-0">
                  {recentBookings.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3.5 sm:flex-nowrap">
                      <div className="min-w-0 flex-1 basis-[220px]">
                        <div className="truncate text-[14.5px] font-extrabold">{b.pickupLocation} → {b.destination}</div>
                        <div className="truncate text-[13px] text-app-ink-soft">
                          {b.externalCarrier ? t("net.viaNetwork", { network: b.notes?.match(/^Courier: ([^·]+)/)?.[1]?.trim() || b.logisticsPartner.displayName }) : b.logisticsPartner.displayName}
                          {b.externalRef ? ` · ${b.externalRef}` : b.trackingCode ? ` · ${b.trackingCode}` : ""} · {date(b.createdAt)}
                        </div>
                      </div>
                      <Pill tone={BOOKING_TONE[b.status] ?? "muted"} dot>{t.dynamic(`booking.${b.status}`, b.status.replace(/_/g, " "))}</Pill>
                      <span className="w-[90px] shrink-0 text-right text-[14px] font-extrabold">{fmt(b.deliveryFee + (b.externalCarrier ? b.platformFee : 0))}</span>
                      {b.externalCarrier ? (
                        <>
                          {b.externalTrackingUrl && <PillLink href={b.externalTrackingUrl} size="sm" icon="truck">{t("net.track")}</PillLink>}
                          {(b.status === "pending" || b.status === "confirmed") && <CancelNetworkBooking bookingId={b.id} />}
                        </>
                      ) : (
                        <PillLink href={messagesHref("seller", { with: b.logisticsPartnerId, context: { kind: "booking", id: b.id } })} size="sm" icon="chat">{t("lg.message")}</PillLink>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="scroll-mt-4 p-5">
              <div id="networks" className="scroll-mt-4" />
              <CardHead title={t("net.title")} sub={t("net.sub")} />
              {paymentResult && (
                <div className="mt-4">
                  <Notice tone={paymentResult === "booked" ? "success" : paymentResult === "failed" ? "error" : "info"}>{t(`net.paid.${paymentResult}`)}</Notice>
                </div>
              )}
              <div className="mt-4">
                <NetworkDelivery networks={networkOptions} defaultPickup={workspace.store?.city ?? undefined} orderId={params.order} />
              </div>
            </Card>

            <section className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="m-0 text-[17px] font-extrabold">{t("lg.partners")}</h2>
                <FilterChips items={FILTERS.map((f) => ({ label: t(`filter.${f.key}`), href: f.key === "all" ? "/home/logistics" : `/home/logistics?filter=${f.key}`, active: f.key === filter }))} />
              </div>
              {partners.length === 0 ? (
                <EmptyState icon="truck" title={filter === "all" ? t("lg.noVerified") : t("lg.noMatch")}>
                  {filter === "all" ? t("lg.noVerifiedSub") : t("lg.tryFilter")}
                </EmptyState>
              ) : (
                <ListCard>
                  {partners.map((p) => (
                    <ListRow key={p.id} className={chosenId === p.id ? "bg-app-canvas" : undefined}>
                      <Thumb src={p.logoUrl} label={p.displayName} size={44} />
                      <div className="min-w-0 flex-1 basis-[220px]">
                        <div className="truncate text-[14.5px] font-extrabold">{p.displayName}</div>
                        <div className="truncate text-[13px] text-app-ink-soft">
                          {p.city}, {p.country} · {t("lg.reliability", { score: p.reliabilityScore })}{p.rating ? ` · ★ ${p.rating.toFixed(1)}` : ""}
                        </div>
                        {p.coverageZones.length > 0 && <div className="truncate text-[12.5px] text-app-ink-soft">{t("partners.covers", { zones: p.coverageZones.join(", ") })}</div>}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[12.5px] text-app-ink-soft">{t("lg.from")}</div>
                        <div className="text-[14.5px] font-extrabold">{fmt(p.basePrice)}</div>
                      </div>
                      <PillLink href={messagesHref("seller", { with: p.id })} size="sm" icon="chat">{t("lg.message")}</PillLink>
                      <PillLink href={`/home/logistics?intent=quote&partner=${p.id}${filter !== "all" ? `&filter=${filter}` : ""}#quote`} size="sm" tone={chosenId === p.id ? "ink" : "white"}>{t("getQuote")}</PillLink>
                    </ListRow>
                  ))}
                </ListCard>
              )}
            </section>
          </div>

          <aside className="grid min-w-0 content-start gap-5">
            <Card className="scroll-mt-4 p-5">
              <div id="quote" className="scroll-mt-4" />
              <CardHead title={t("lg.askPrice")} sub={t("lg.askPriceSub")} />
              <div className="mt-4">
                <QuoteRequestForm
                  key={chosenId ?? "none"}
                  partners={partnerOptions}
                  defaultPartnerId={chosenId}
                  defaultPickup={workspace.store?.city ?? undefined}
                />
              </div>
            </Card>

            <Card className="overflow-hidden">
              <CardHead title={t("lg.quoteRequests")} sub={t("lg.quoteRequestsSub")} className="px-5 pb-3 pt-5" />
              {recentQuotes.length === 0 ? (
                <p className="m-0 border-t border-app-line px-5 py-6 text-[14px] text-app-ink-soft">{t("lg.noQuotes")}</p>
              ) : (
                <ul className="m-0 list-none divide-y divide-app-line border-t border-app-line p-0">
                  {recentQuotes.map((q) => (
                    <li key={q.id} className="flex items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-extrabold">{q.logisticsPartner.displayName}</div>
                        <div className="truncate text-[13px] text-app-ink-soft">{q.pickupLocation} → {q.destination} · {date(q.createdAt)}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <Pill tone={QUOTE_TONE[q.status] ?? "muted"}>{t.dynamic(`quote.${q.status}`, q.status)}</Pill>
                        {q.quotedPrice != null && <div className="mt-1 text-[13.5px] font-extrabold">{fmt(q.quotedPrice)}</div>}
                        {q.status === "responded" && q.quotedPrice != null && (!q.expiresAt || q.expiresAt.getTime() > Date.now()) && <AcceptQuoteButton quoteId={q.id} />}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {networks.length > 0 && canStoreNetworkAccounts() && (
              <Card className="p-5">
                <CardHead title={t("net.accountsTitle")} sub={t("net.accountsSub")} />
                <div className="mt-4">
                  <NetworkAccounts networks={networks.map((n) => ({ id: n.id, name: n.name, account: n.account ? { label: n.account.label, status: n.account.status } : null, fields: n.credentialFields }))} />
                </div>
              </Card>
            )}

            <AssistantNote who="peggy">{t("lg.peggy")}</AssistantNote>
          </aside>
        </div>
      </div>
    </SellerPage>
  );
}
