import { respondToSupplierQuote } from "@/app/actions/supplier";
import { StatusPill } from "@/components/ops/OpsPrimitives";
import { RolePage, formatDate, formatMoney } from "@/components/role/RolePage";
import { Icon } from "@/components/ui/Icon";
import { MascotAvatar } from "@/components/ui";
import { db } from "@/lib/db/client";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { requireRole } from "@/lib/server-auth";

type PageProps = {
  searchParams?: Promise<{ error?: string; saved?: string }>;
};

const quoteTips = [
  "Answer with a firm unit price and the exact quantity it covers.",
  "Mention packing, processing time, and whether samples are available.",
  "Set an expiry date when material or FX prices may move.",
];

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
  const rejectedQuotes = quotes.filter((quote) => quote.status === "rejected" || quote.status === "expired");

  return (
    <RolePage
      role="supplier"
      eyebrow="Supplier quotes"
      title="Quote Requests"
      description="Reply to sellers with clear prices, expiry dates, and fulfilment notes so they can move from interest to order."
      metrics={[
        { label: "Requests", value: String(quotes.length), icon: "chat", tone: "amber" },
        { label: "Waiting on you", value: String(pendingQuotes.length), icon: "clock", tone: "rose" },
        { label: "Sent replies", value: String(respondedQuotes.length), icon: "send", tone: "teal" },
        { label: "Quoted value", value: formatMoney(openQuoteValue(quotes), quotes[0]?.supplierProduct.currency ?? "NGN"), icon: "coin", tone: "indigo" },
      ]}
      assistantNote="Rex is checking which quotes need fast replies, where the margin looks healthy, and which sellers are ready for bulk follow-up."
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="space-y-3">
          {(params?.error || params?.saved) && (
            <div
              className="rounded-[12px] border px-4 py-3 text-[13px] leading-5"
              style={{
                borderColor: params?.error ? "rgb(232 106 79 / 0.22)" : "rgb(46 126 120 / 0.18)",
                background: params?.error ? "rgb(232 106 79 / 0.08)" : "rgb(46 126 120 / 0.08)",
                color: params?.error ? "var(--color-coral)" : "var(--color-teal-deep)",
              }}
            >
              {params?.error ?? "Quote updated."}
            </div>
          )}

          {quotes.length === 0 ? (
            <div className="card tight">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-[10px] bg-[var(--amber-100)] text-[var(--amber-500)]">
                  <Icon name="chat" size={17} />
                </div>
                <div>
                  <div className="text-[14px] font-semibold text-[var(--ink-900)]">No quote requests yet</div>
                  <p className="mt-1 max-w-[620px] text-[13px] leading-6 text-[var(--ink-500)]">
                    When a seller asks for bulk pricing, Rex will place it here with the product, quantity, destination, and notes ready for your reply.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            quotes.map((quote) => {
              const pending = quote.status === "pending";
              const basePrice = quote.quotedPrice ?? quote.supplierProduct.wholesalePrice;
              const suggestedTotal = basePrice * quote.quantity;

              return (
                <article key={quote.id} className="card tight overflow-hidden p-0">
                  <div className="flex flex-col gap-3 border-b border-[var(--ink-100)] px-4 py-3.5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="m-0 text-[15px] font-semibold text-[var(--ink-900)]">{quote.supplierProduct.name}</h2>
                        <StatusPill status={quote.status} />
                      </div>
                      <div className="mt-1 text-[12px] leading-5 text-[var(--ink-500)]">
                        {quote.seller.name} wants {quote.quantity.toLocaleString()} units for {quote.destination}.
                      </div>
                    </div>
                    <div className="text-left lg:text-right">
                      <div className="font-display text-[22px] font-medium leading-none text-[var(--ink-900)]">
                        {formatMoney(suggestedTotal, quote.supplierProduct.currency)}
                      </div>
                      <div className="mt-1 text-[11px] text-[var(--ink-500)]">estimated order value</div>
                    </div>
                  </div>

                  <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="space-y-3">
                      <div className="grid gap-2 sm:grid-cols-3">
                        {[
                          { label: "Seller", value: quote.seller.name },
                          { label: "MOQ", value: `${quote.supplierProduct.moq.toLocaleString()} units` },
                          { label: "Requested", value: formatDate(quote.createdAt) },
                        ].map((item) => (
                          <div key={item.label} className="rounded-[10px] border border-[var(--ink-100)] bg-[var(--paper)] px-3 py-2.5">
                            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-400)]">{item.label}</div>
                            <div className="mt-1 truncate text-[13px] font-semibold text-[var(--ink-900)]">{item.value}</div>
                          </div>
                        ))}
                      </div>

                      <div className="rounded-[12px] border border-[var(--ink-100)] bg-[var(--ink-50)] px-4 py-3">
                        <div className="text-[12px] font-semibold text-[var(--ink-900)]">Buyer note</div>
                        <p className="mt-1 text-[13px] leading-6 text-[var(--ink-600)]">
                          {quote.notes || "No extra note yet. Reply with price, availability, and next step."}
                        </p>
                      </div>

                      {!pending && (
                        <div className="rounded-[12px] border border-[var(--teal-200)] bg-[var(--teal-50)] px-4 py-3">
                          <div className="text-[12px] font-semibold text-[var(--teal-900)]">Your reply</div>
                          <p className="mt-1 text-[13px] leading-6 text-[var(--ink-700)]">
                            {quote.supplierResponse || "Reply sent."}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2 text-[12px] text-[var(--ink-500)]">
                            {quote.quotedPrice && <span>{formatMoney(quote.quotedPrice, quote.supplierProduct.currency)} per unit</span>}
                            {quote.expiresAt && <span>Valid until {formatDate(quote.expiresAt)}</span>}
                          </div>
                        </div>
                      )}
                    </div>

                    {pending ? (
                      <form action={respondToSupplierQuote} className="rounded-[12px] border border-[var(--ink-100)] bg-[var(--paper)] p-3">
                        <input type="hidden" name="quoteId" value={quote.id} />
                        <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-[var(--ink-900)]">
                          <Icon name="bolt" size={14} color="var(--amber-500)" />
                          Rex reply pad
                        </div>
                        <label className="mb-3 block">
                          <span className="mb-1.5 block text-[12px] font-semibold text-[var(--ink-500)]">Unit price</span>
                          <input
                            name="quotedPrice"
                            type="number"
                            min="1"
                            step="0.01"
                            defaultValue={quote.supplierProduct.wholesalePrice}
                            className="w-full rounded-[10px] border border-[var(--ink-150)] bg-white px-3 py-2.5 text-[13px] text-[var(--ink-900)] outline-none"
                          />
                        </label>
                        <label className="mb-3 block">
                          <span className="mb-1.5 block text-[12px] font-semibold text-[var(--ink-500)]">Valid until</span>
                          <input
                            name="expiresAt"
                            type="date"
                            className="w-full rounded-[10px] border border-[var(--ink-150)] bg-white px-3 py-2.5 text-[13px] text-[var(--ink-900)] outline-none"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-[12px] font-semibold text-[var(--ink-500)]">Message</span>
                          <textarea
                            name="supplierResponse"
                            rows={4}
                            defaultValue={`Yes, we can supply ${quote.quantity.toLocaleString()} units to ${quote.destination}.`}
                            className="w-full resize-none rounded-[10px] border border-[var(--ink-150)] bg-white px-3 py-2.5 text-[13px] leading-5 text-[var(--ink-900)] outline-none"
                          />
                        </label>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="submit" name="intent" value="respond" className="dbtn dBtn-mint dBtn-sm">
                            <Icon name="send" size={13} />
                            Send quote
                          </button>
                          <button type="submit" name="intent" value="reject" className="dbtn dBtn-ghost dBtn-sm">
                            <Icon name="x" size={13} />
                            Pass
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="rounded-[12px] border border-[var(--ink-100)] bg-[var(--paper)] p-3 text-[12px] leading-5 text-[var(--ink-600)]">
                        <div className="mb-2 flex items-center gap-2 font-semibold text-[var(--ink-900)]">
                          <Icon name="check" size={14} color="var(--teal-700)" />
                          Follow-up
                        </div>
                        {quote.status === "accepted"
                          ? "Seller accepted this quote. Watch the wholesale order board for fulfilment."
                          : quote.status === "responded"
                            ? "Quote is with the seller. Keep stock ready until the expiry date."
                            : "This request is closed. Similar future requests will still appear here."}
                      </div>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </section>

        <aside className="space-y-3">
          <div className="card tight">
            <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-[var(--ink-900)]">
              <MascotAvatar role="supplier" size={24} />
              Rex quote coach
            </div>
            <div className="space-y-2">
              {quoteTips.map((tip) => (
                <div key={tip} className="flex gap-2 rounded-[10px] border border-[var(--ink-100)] bg-[var(--ink-50)] px-3 py-2 text-[12px] leading-5 text-[var(--ink-600)]">
                  <Icon name="check" size={13} color="var(--teal-700)" />
                  <span>{tip}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card tight">
            <div className="mb-3 text-[13px] font-semibold text-[var(--ink-900)]">Quote health</div>
            <div className="space-y-3">
              {[
                { label: "Waiting", value: pendingQuotes.length, tone: "var(--rose-500)" },
                { label: "Answered", value: respondedQuotes.length, tone: "var(--teal-700)" },
                { label: "Closed", value: rejectedQuotes.length, tone: "var(--ink-500)" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3">
                  <span className="text-[12px] text-[var(--ink-500)]">{item.label}</span>
                  <span className="font-display text-[24px] font-medium text-[var(--ink-900)]" style={{ color: item.tone }}>
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </RolePage>
  );
}
