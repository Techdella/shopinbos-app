import { respondToSupplierQuote } from "@/app/actions/supplier";
import { AppPage, AssistantNote, Card, EmptyState, FilterChips, Pill, SplitLayout, StatTile, Thumb } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { QUOTE_STATUS, buttonClass, fieldClass, labelClass, money, shortDate, statusOf, supplierFrame, textareaClass, timeAgo } from "@/components/supplier/supplier-kit";
import { db } from "@/lib/db/client";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { requireRole } from "@/lib/server-auth";

type PageProps = {
  searchParams?: Promise<{ error?: string; saved?: string; show?: string }>;
};

const quoteTips = [
  "Answer with a firm unit price and the exact quantity it covers.",
  "Mention packing, processing time, and whether samples are available.",
  "Set an expiry date when material or FX prices may move.",
];

const FILTERS = [
  { key: "waiting", label: "Waiting on you", statuses: ["pending"] },
  { key: "answered", label: "Answered", statuses: ["responded", "accepted"] },
  { key: "closed", label: "Closed", statuses: ["rejected", "expired"] },
] as const;

function openQuoteValue(quotes: Array<{ quantity: number; quotedPrice: number | null }>) {
  return quotes.reduce((total, quote) => total + (quote.quotedPrice ?? 0) * quote.quantity, 0);
}

export default async function SupplierQuoteRequestsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);

  const quotes = await db.supplierQuoteRequest.findMany({
    where: { supplierId: supplier.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      quantity: true,
      destination: true,
      notes: true,
      status: true,
      quotedPrice: true,
      supplierResponse: true,
      expiresAt: true,
      createdAt: true,
      seller: { select: { name: true, email: true, city: true, country: true } },
      supplierProduct: {
        select: {
          name: true,
          images: true,
          currency: true,
          wholesalePrice: true,
          moq: true,
          processingTime: true,
        },
      },
    },
  });

  const pendingQuotes = quotes.filter((quote) => quote.status === "pending");
  const respondedQuotes = quotes.filter((quote) => quote.status === "responded" || quote.status === "accepted");
  const closedQuotes = quotes.filter((quote) => quote.status === "rejected" || quote.status === "expired");
  const filter = FILTERS.find((item) => item.key === params?.show);
  const visible = filter ? quotes.filter((quote) => (filter.statuses as readonly string[]).includes(quote.status)) : quotes;
  const verified = supplier.verificationStatus === "verified";

  return (
    <AppPage
      frame={supplierFrame(user, supplier)}
      title="Price requests"
      sub="Shops asking for your price. Tell them your price, how long it lasts and when it can be ready, so they can order."
      toolbar={
        <FilterChips
          items={[
            { label: "All", href: "/supplier/quote-requests", count: quotes.length, active: !filter },
            { label: "Waiting on you", href: "/supplier/quote-requests?show=waiting", count: pendingQuotes.length, active: filter?.key === "waiting" },
            { label: "Answered", href: "/supplier/quote-requests?show=answered", count: respondedQuotes.length, active: filter?.key === "answered" },
            { label: "Closed", href: "/supplier/quote-requests?show=closed", count: closedQuotes.length, active: filter?.key === "closed" },
          ]}
        />
      }
    >
      <SplitLayout
        sideWidth="360px"
        main={
          <>
            {(params?.error || params?.saved) && <Notice tone={params?.error ? "error" : "success"}>{params?.error ?? "Quote updated."}</Notice>}
            {!verified && (
              <AssistantNote who="rex">
                You can read requests now. Replies open once your business is verified.
              </AssistantNote>
            )}

            {visible.length === 0 ? (
              <EmptyState icon="chat" title={quotes.length === 0 ? "No quote requests yet" : "Nothing here"}>
                {quotes.length === 0
                  ? "When a seller asks for bulk pricing, the request lands here with the product, quantity, destination and notes ready for your reply."
                  : "No requests match this filter."}
              </EmptyState>
            ) : (
              visible.map((quote) => {
                const pending = quote.status === "pending";
                const status = statusOf(QUOTE_STATUS, quote.status);
                const basePrice = quote.quotedPrice ?? quote.supplierProduct.wholesalePrice;
                const currency = quote.supplierProduct.currency;
                const place = [quote.seller.city, quote.seller.country].filter(Boolean).join(", ");

                return (
                  <Card key={quote.id} as="article" className="scroll-mt-6 overflow-hidden">
                    <div id={`quote-${quote.id}`} className="flex flex-wrap items-start gap-3 p-4 sm:p-5">
                      <Thumb src={quote.supplierProduct.images[0]} label={quote.supplierProduct.name} size={52} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="m-0 min-w-0 truncate text-[16px] font-extrabold">{quote.seller.name}</h2>
                          <Pill tone={status.tone}>{status.label}</Pill>
                        </div>
                        <div className="mt-0.5 text-[13.5px] text-app-ink-soft">
                          {quote.quantity.toLocaleString("en-NG")} × {quote.supplierProduct.name} to {quote.destination}
                        </div>
                        <div className="mt-0.5 text-[12.5px] text-app-ink-soft">
                          {timeAgo(quote.createdAt)}{place && ` · ${place}`} · MOQ {quote.supplierProduct.moq.toLocaleString("en-NG")}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[20px] font-extrabold leading-none">{money(basePrice * quote.quantity, currency)}</div>
                        <div className="mt-1 text-[12px] text-app-ink-soft">{quote.quotedPrice ? "quoted value" : "at list price"}</div>
                      </div>
                    </div>

                    <div className="grid gap-4 border-t border-app-line p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                      <div className="grid content-start gap-3">
                        <div className="rounded-[16px] bg-app-canvas px-4 py-3">
                          <div className="text-[13px] font-bold">Seller&apos;s note</div>
                          <p className="mb-0 mt-1 text-[14px] leading-[1.55]">
                            {quote.notes || "No note. Reply with price, availability and next step."}
                          </p>
                        </div>
                        {!pending && (
                          <div className="rounded-[16px] bg-app-mint px-4 py-3">
                            <div className="text-[13px] font-bold">Your reply</div>
                            <p className="mb-0 mt-1 text-[14px] leading-[1.55]">{quote.supplierResponse || "Reply sent."}</p>
                            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-app-ink-soft">
                              {quote.quotedPrice && <span>{money(quote.quotedPrice, currency)} per unit</span>}
                              {quote.expiresAt && <span>Valid until {shortDate(quote.expiresAt)}</span>}
                            </div>
                          </div>
                        )}
                      </div>

                      {pending ? (
                        <form action={respondToSupplierQuote} className="grid content-start gap-3">
                          <input type="hidden" name="quoteId" value={quote.id} />
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label htmlFor={`price-${quote.id}`} className={labelClass}>Unit price ({currency})</label>
                              <input id={`price-${quote.id}`} name="quotedPrice" type="number" min="1" step="0.01" defaultValue={quote.supplierProduct.wholesalePrice} className={fieldClass} />
                            </div>
                            <div>
                              <label htmlFor={`expires-${quote.id}`} className={labelClass}>Valid until</label>
                              <input id={`expires-${quote.id}`} name="expiresAt" type="date" className={fieldClass} />
                            </div>
                          </div>
                          <div>
                            <label htmlFor={`message-${quote.id}`} className={labelClass}>Message</label>
                            <textarea
                              id={`message-${quote.id}`}
                              name="supplierResponse"
                              rows={3}
                              defaultValue={`Yes, we can supply ${quote.quantity.toLocaleString("en-NG")} units to ${quote.destination}.`}
                              className={`${textareaClass} resize-y`}
                            />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button type="submit" name="intent" value="respond" className={buttonClass.ink}>
                              <Icon name="send" size={14} /> Send my price
                            </button>
                            <button type="submit" name="intent" value="reject" className={buttonClass.white}>
                              Pass
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="rounded-[16px] border border-app-line px-4 py-3 text-[13.5px] leading-[1.55] text-app-ink-soft">
                          <div className="mb-1 flex items-center gap-2 font-bold text-app-ink">
                            <Icon name="check" size={14} /> What happens next
                          </div>
                          {quote.status === "accepted"
                            ? "The seller accepted this quote. Watch Orders for the wholesale order."
                            : quote.status === "responded"
                              ? "Your quote is with the seller. Keep stock ready until the expiry date."
                              : "This request is closed. New requests from this seller still show up here."}
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })
            )}
          </>
        }
        side={
          <>
            <Card className="p-5">
              <h2 className="m-0 text-[17px] font-extrabold">Your price requests</h2>
              <div className="mt-2 grid grid-cols-2 gap-1">
                <StatTile label="Waiting on you" value={pendingQuotes.length} />
                <StatTile label="Answered" value={respondedQuotes.length} />
                <StatTile label="Closed" value={closedQuotes.length} />
                <StatTile label="Value of prices sent" value={money(openQuoteValue(quotes), quotes[0]?.supplierProduct.currency ?? "NGN")} />
              </div>
            </Card>
            <section className="rounded-[22px] bg-app-peach p-5">
              <div className="mb-3 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/app/rex.png" alt="Rex" className="h-10 w-10 object-contain" />
                <h2 className="m-0 text-[17px] font-extrabold">Prices that win orders</h2>
              </div>
              <ul className="m-0 grid list-none gap-2 p-0">
                {quoteTips.map((tip) => (
                  <li key={tip} className="flex gap-2.5 rounded-[14px] bg-white px-3.5 py-2.5 text-[13.5px] leading-[1.5]">
                    <Icon name="check" size={14} className="mt-1 shrink-0 text-app-success" />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        }
      />
    </AppPage>
  );
}
