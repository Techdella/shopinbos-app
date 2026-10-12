import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, Card, CardHead, FilterChips, ListCard, ListRow, Pill, PillLink, StatGrid, StatTile, Thumb, EmptyState, type Tone } from "@/components/app-kit";
import { QuoteRequestForm } from "./QuoteRequestForm";
import { AcceptQuoteButton } from "./AcceptQuoteButton";
import { messagesHref } from "@/lib/conversations/pure";

export const dynamic = "force-dynamic";

function fmt(n: number) { return "₦" + Math.round(n).toLocaleString("en-US"); }

const ACTIVE = ["pending", "confirmed", "picked_up", "in_transit"] as const;

const QUOTE_TONE: Record<string, Tone> = { pending: "warning", responded: "info", accepted: "success", rejected: "muted", expired: "muted" };
const QUOTE_LABEL: Record<string, string> = { pending: "Waiting", responded: "Price in", accepted: "Accepted", rejected: "Declined", expired: "Expired" };
const BOOKING_TONE: Record<string, Tone> = { pending: "warning", confirmed: "info", picked_up: "info", in_transit: "info", delivered: "success", failed: "danger", cancelled: "muted" };
const BOOKING_LABEL: Record<string, string> = { pending: "Needs a rider", confirmed: "Rider booked", picked_up: "Rider picked it up", in_transit: "Rider on the way", delivered: "Delivered", failed: "Failed", cancelled: "Cancelled" };

const FILTERS = [
  { key: "all", label: "All partners" },
  { key: "same_day", label: "Same day" },
  { key: "nationwide", label: "Nationwide" },
] as const;

// partner may be an id or a slug; logisticsSlug arrives from the marketing site ("Book delivery" intent).
type Search = { filter?: string; partner?: string; intent?: string; logisticsSlug?: string };

export default async function SellerLogisticsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace) return null;

  const filter = FILTERS.find((f) => f.key === params.filter)?.key ?? "all";
  const partnerRef = params.partner ?? params.logisticsSlug;
  const chosen = partnerRef
    ? await db.logisticsPartner.findFirst({ where: { OR: [{ id: partnerRef }, { slug: partnerRef }] }, select: { id: true } })
    : null;
  const chosenId = chosen?.id;

  const [partners, quoteCount, pendingQuotes, activeCount, deliveredCount, recentQuotes, recentBookings] = await Promise.all([
    db.logisticsPartner.findMany({
      where: {
        status: "active",
        verificationStatus: "verified",
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

  const allVerified = filter === "all"
    ? partners
    : await db.logisticsPartner.findMany({ where: { status: "active", verificationStatus: "verified" }, orderBy: { displayName: "asc" }, take: 100 });
  const partnerOptions = allVerified.map((p) => ({ id: p.id, name: `${p.displayName} · ${p.city}` }));
  const date = (d: Date) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return (
    <SellerPage
      user={user}
      store={storeSummary(workspace.store)}
      title="Delivery"
      sub="Book riders, compare delivery partners and follow every parcel."
      actions={
        <>
          <PillLink href="/marketplace?type=logistics" icon="truck">Find partners</PillLink>
          <PillLink href="/home/logistics?intent=book_delivery#quote" tone="accent" icon="plus">Book delivery</PillLink>
        </>
      }
    >
      <div className="grid gap-5">
        <StatGrid>
          <StatTile tone="card" label="On the way" value={activeCount} />
          <StatTile tone="card" label="Delivered" value={deliveredCount} />
          <StatTile tone="card" label="Quotes waiting" value={pendingQuotes} hint={`${quoteCount} asked in total`} />
          <StatTile tone="card" label="Verified partners" value={allVerified.length} />
        </StatGrid>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
          <div className="grid min-w-0 content-start gap-5">
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-end justify-between gap-3 px-5 pb-4 pt-5">
                <CardHead title="Your deliveries" sub="Latest bookings across your store" />
              </div>
              {recentBookings.length === 0 ? (
                <p className="m-0 border-t border-app-line px-5 py-8 text-center text-[14px] text-app-ink-soft">Bookings show here once you confirm a delivery partner.</p>
              ) : (
                <ul className="m-0 list-none divide-y divide-app-line border-t border-app-line p-0">
                  {recentBookings.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3.5 sm:flex-nowrap">
                      <div className="min-w-0 flex-1 basis-[220px]">
                        <div className="truncate text-[14.5px] font-extrabold">{b.pickupLocation} → {b.destination}</div>
                        <div className="truncate text-[13px] text-app-ink-soft">{b.logisticsPartner.displayName}{b.trackingCode ? ` · ${b.trackingCode}` : ""} · {date(b.createdAt)}</div>
                      </div>
                      <Pill tone={BOOKING_TONE[b.status] ?? "muted"} dot>{BOOKING_LABEL[b.status] ?? b.status.replace(/_/g, " ")}</Pill>
                      <span className="w-[90px] shrink-0 text-right text-[14px] font-extrabold">{fmt(b.deliveryFee)}</span>
                      <PillLink href={messagesHref("seller", { with: b.logisticsPartnerId, context: { kind: "booking", id: b.id } })} size="sm" icon="chat">Message</PillLink>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <section className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="m-0 text-[17px] font-extrabold">Delivery partners</h2>
                <FilterChips items={FILTERS.map((f) => ({ label: f.label, href: f.key === "all" ? "/home/logistics" : `/home/logistics?filter=${f.key}`, active: f.key === filter }))} />
              </div>
              {partners.length === 0 ? (
                <EmptyState icon="truck" title={filter === "all" ? "No verified partners yet" : "No partners match"}>
                  {filter === "all" ? "Verified delivery partners show here as soon as they're approved." : "Try another filter to see more partners."}
                </EmptyState>
              ) : (
                <ListCard>
                  {partners.map((p) => (
                    <ListRow key={p.id} className={chosenId === p.id ? "bg-app-canvas" : undefined}>
                      <Thumb src={p.logoUrl} label={p.displayName} size={44} />
                      <div className="min-w-0 flex-1 basis-[220px]">
                        <div className="truncate text-[14.5px] font-extrabold">{p.displayName}</div>
                        <div className="truncate text-[13px] text-app-ink-soft">
                          {p.city}, {p.country} · reliability {p.reliabilityScore}/100{p.rating ? ` · ★ ${p.rating.toFixed(1)}` : ""}
                        </div>
                        {p.coverageZones.length > 0 && <div className="truncate text-[12.5px] text-app-ink-soft">Covers {p.coverageZones.join(", ")}</div>}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[12.5px] text-app-ink-soft">From</div>
                        <div className="text-[14.5px] font-extrabold">{fmt(p.basePrice)}</div>
                      </div>
                      <PillLink href={messagesHref("seller", { with: p.id })} size="sm" icon="chat">Message</PillLink>
                      <PillLink href={`/home/logistics?intent=quote&partner=${p.id}${filter !== "all" ? `&filter=${filter}` : ""}#quote`} size="sm" tone={chosenId === p.id ? "ink" : "white"}>Get a quote</PillLink>
                    </ListRow>
                  ))}
                </ListCard>
              )}
            </section>
          </div>

          <aside className="grid min-w-0 content-start gap-5">
            <Card className="scroll-mt-4 p-5">
              <div id="quote" className="scroll-mt-4" />
              <CardHead title="Ask for a delivery price" sub="The partner replies with a price you can accept." />
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
              <CardHead title="Quote requests" sub="Prices partners sent you, and routes still waiting for an answer" className="px-5 pb-3 pt-5" />
              {recentQuotes.length === 0 ? (
                <p className="m-0 border-t border-app-line px-5 py-6 text-[14px] text-app-ink-soft">When you ask for delivery prices, they show up here.</p>
              ) : (
                <ul className="m-0 list-none divide-y divide-app-line border-t border-app-line p-0">
                  {recentQuotes.map((q) => (
                    <li key={q.id} className="flex items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-extrabold">{q.logisticsPartner.displayName}</div>
                        <div className="truncate text-[13px] text-app-ink-soft">{q.pickupLocation} → {q.destination} · {date(q.createdAt)}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <Pill tone={QUOTE_TONE[q.status] ?? "muted"}>{QUOTE_LABEL[q.status] ?? q.status}</Pill>
                        {q.quotedPrice != null && <div className="mt-1 text-[13.5px] font-extrabold">{fmt(q.quotedPrice)}</div>}
                        {q.status === "responded" && q.quotedPrice != null && (!q.expiresAt || q.expiresAt.getTime() > Date.now()) && <AcceptQuoteButton quoteId={q.id} />}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <AssistantNote who="peggy">Book riders before 2pm for same-day delivery. I compare reliability, price and reply time before you book.</AssistantNote>
          </aside>
        </div>
      </div>
    </SellerPage>
  );
}
