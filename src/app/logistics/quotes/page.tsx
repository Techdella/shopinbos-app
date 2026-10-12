import type { Metadata } from "next";
import type { QuoteStatus } from "@prisma/client";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { respondToDeliveryQuote } from "@/app/actions/logistics";
import { Card, EmptyState, FilterChips, ListCard, ListRow, Pill } from "@/components/app-kit";
import {
  ActionNotice,
  PartnerPage,
  Route,
  SubmitButton,
  inputClass,
  labelClass,
  lagosDate,
  lagosTime,
  naira,
  packageInfo,
  packageSummary,
  quoteStage,
  textareaClass,
  timeAgo,
} from "@/components/logistics/kit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Price requests" };

const FILTERS: Array<{ key: string; label: string; statuses?: QuoteStatus[] }> = [
  { key: "pending", label: "Waiting for you", statuses: ["pending"] },
  { key: "quoted", label: "Price sent", statuses: ["responded"] },
  { key: "won", label: "Booked you", statuses: ["accepted"] },
  { key: "closed", label: "Declined or expired", statuses: ["rejected", "expired"] },
  { key: "all", label: "All" },
];

export default async function LogisticsQuotesPage({ searchParams }: { searchParams: Promise<{ status?: string; saved?: string; error?: string }> }) {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const { status, saved, error } = await searchParams;
  const filter = FILTERS.find((item) => item.key === status) ?? FILTERS[0];

  const [quotes, counts] = await Promise.all([
    db.deliveryQuoteRequest.findMany({
      where: { logisticsPartnerId: partner.id, ...(filter.statuses ? { status: { in: filter.statuses } } : {}) },
      orderBy: { createdAt: filter.key === "pending" ? "asc" : "desc" },
      take: 40,
      select: {
        id: true, pickupLocation: true, destination: true, preferredDate: true, status: true, quotedPrice: true,
        partnerResponse: true, expiresAt: true, createdAt: true, packageDetails: true,
        seller: { select: { name: true, city: true, country: true } },
      },
    }),
    db.deliveryQuoteRequest.groupBy({ by: ["status"], where: { logisticsPartnerId: partner.id }, _count: { _all: true } }),
  ]);
  const countOf = (statuses?: QuoteStatus[]) => counts.filter((row) => !statuses || statuses.includes(row.status)).reduce((sum, row) => sum + row._count._all, 0);
  const now = new Date();
  const pending = quotes.filter((quote) => quote.status === "pending");
  const others = quotes.filter((quote) => quote.status !== "pending");

  return (
    <PartnerPage
      frame={{ user, partner }}
      title="Price requests"
      sub="Sellers asking what you'd charge for a delivery. Send a price, and they can book you straight away."
      toolbar={<FilterChips items={FILTERS.map((item) => ({ label: item.label, href: item.key === "pending" ? "/logistics/quotes" : `/logistics/quotes?status=${item.key}`, count: countOf(item.statuses), active: item.key === filter.key }))} />}
    >
      <ActionNotice saved={saved} error={error} savedText="Sent. The seller can see your answer now." />

      {quotes.length === 0 && (
        <EmptyState icon="chat" title={filter.key === "pending" ? "No one is waiting on you" : "Nothing here"}>
          {filter.key === "pending" ? "When a seller asks what you'd charge, it shows up here." : "Try another filter."}
        </EmptyState>
      )}

      {pending.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {pending.map((quote) => {
            const pkg = packageInfo(quote.packageDetails);
            return (
              <Card key={quote.id} as="article" className="flex flex-col p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Pill tone="accent">{quote.expiresAt ? `Reply by ${lagosDate(quote.expiresAt)}, ${lagosTime(quote.expiresAt)}` : `Asked ${timeAgo(quote.createdAt, now)}`}</Pill>
                  <span className="truncate text-[13.5px] text-app-ink-soft">{quote.seller.name}{quote.seller.city ? ` · ${quote.seller.city}` : ""}</span>
                </div>
                <Route from={quote.pickupLocation} to={quote.destination} className="mt-3 block break-words text-[16px]" />
                <dl className="m-0 mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[13.5px]">
                  <div><dt className="text-app-ink-soft">Package</dt><dd className="m-0 font-bold">{packageSummary(quote.packageDetails)}</dd></div>
                  <div><dt className="text-app-ink-soft">Wanted</dt><dd className="m-0 font-bold">{quote.preferredDate ? lagosDate(quote.preferredDate, { weekday: "short", day: "numeric", month: "short" }) : "Any day"}</dd></div>
                  {typeof pkg.declaredValue === "number" && (
                    <div><dt className="text-app-ink-soft">Value of the goods</dt><dd className="m-0 font-bold">{naira(pkg.declaredValue)}</dd></div>
                  )}
                </dl>

                <form action={respondToDeliveryQuote} className="mt-4 grid gap-3 border-t border-app-line pt-4">
                  <input type="hidden" name="quoteId" value={quote.id} />
                  <input type="hidden" name="intent" value="respond" />
                  <div className="min-w-0">
                    <label htmlFor={`price-${quote.id}`} className={labelClass}>Your price (₦)</label>
                    <input id={`price-${quote.id}`} name="quotedPrice" type="number" min="1" step="1" required inputMode="numeric" defaultValue={partner.basePrice > 0 ? String(partner.basePrice) : ""} className={inputClass} />
                  </div>
                  <details className="group">
                    <summary className="cursor-pointer list-none text-[15px] font-bold text-app-ink-soft [&::-webkit-details-marker]:hidden">
                      More options (optional) <span aria-hidden className="inline-block transition group-open:rotate-90">›</span>
                    </summary>
                    <div className="mt-3 grid gap-3">
                      <div className="min-w-0">
                        <label htmlFor={`note-${quote.id}`} className={labelClass}>Note to the seller</label>
                        <textarea id={`note-${quote.id}`} name="partnerResponse" rows={2} maxLength={1000} placeholder="When you can pick up, how long it takes, anything they should know." className={textareaClass} />
                      </div>
                      <div className="min-w-0">
                        <label htmlFor={`expires-${quote.id}`} className={labelClass}>Price good until</label>
                        <input id={`expires-${quote.id}`} name="expiresAt" type="date" className={inputClass} />
                      </div>
                    </div>
                  </details>
                  <div className="flex flex-wrap items-center justify-end gap-3">
                    <button type="submit" form={`decline-${quote.id}`} className="min-h-[44px] px-2 text-[15px] font-bold text-app-ink-soft underline-offset-4 hover:underline">Decline</button>
                    <SubmitButton>Send price</SubmitButton>
                  </div>
                </form>
                <form id={`decline-${quote.id}`} action={respondToDeliveryQuote} className="hidden">
                  <input type="hidden" name="quoteId" value={quote.id} />
                  <input type="hidden" name="intent" value="reject" />
                </form>
              </Card>
            );
          })}
        </div>
      )}

      {others.length > 0 && (
        <ListCard className={pending.length ? "mt-5" : ""}>
          {others.map((quote) => {
            const stage = quoteStage(quote.status);
            return (
              <ListRow key={quote.id}>
                <div className="min-w-0 flex-1 basis-[220px]">
                  <Route from={quote.pickupLocation} to={quote.destination} className="block truncate text-[15px]" />
                  <div className="truncate text-[13px] text-app-ink-soft">
                    {quote.seller.name} · {packageSummary(quote.packageDetails)} · asked {lagosDate(quote.createdAt)}
                  </div>
                  {quote.partnerResponse && <div className="mt-0.5 truncate text-[13px] text-app-ink-soft">You said: {quote.partnerResponse}</div>}
                </div>
                <Pill tone={stage.tone} dot>{stage.label}</Pill>
                <div className="ml-auto text-[15px] font-extrabold">{quote.quotedPrice ? naira(quote.quotedPrice) : "No price"}</div>
              </ListRow>
            );
          })}
        </ListCard>
      )}
    </PartnerPage>
  );
}
