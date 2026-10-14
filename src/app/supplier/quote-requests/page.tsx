import { respondToSupplierQuote } from "@/app/actions/supplier";
import { AppPage, AssistantNote, Card, EmptyState, FilterChips, Pill, SplitLayout, StatTile, Thumb } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { QUOTE_STATUS, buttonClass, fieldClass, labelClass, money, shortDate, statusOf, supplierFrame, textareaClass, timeAgo } from "@/components/supplier/supplier-kit";
import { db } from "@/lib/db/client";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { requireRole } from "@/lib/server-auth";
import { Mascot } from "@/components/brand/Mascot";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";
import { getT } from "@/lib/i18n/server";

type PageProps = {
  searchParams?: Promise<{ error?: string; saved?: string; show?: string }>;
};

const quoteTips = ["quotes.tip1", "quotes.tip2", "quotes.tip3"] as const;

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
  const t = await getT("supplier", "common");

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
      title={t("dashboard.quoteRequests")}
      sub={t("quotes.sub")}
      toolbar={
        <FilterChips
          items={[
            { label: t("products.filter.all"), href: "/supplier/quote-requests", count: quotes.length, active: !filter },
            { label: t("quotes.waiting"), href: "/supplier/quote-requests?show=waiting", count: pendingQuotes.length, active: filter?.key === "waiting" },
            { label: t("quotes.answered"), href: "/supplier/quote-requests?show=answered", count: respondedQuotes.length, active: filter?.key === "answered" },
            { label: t("quotes.closed"), href: "/supplier/quote-requests?show=closed", count: closedQuotes.length, active: filter?.key === "closed" },
          ]}
        />
      }
    >
      <SplitLayout
        sideWidth="360px"
        main={
          <>
            {(params?.error || params?.saved) && <Notice tone={params?.error ? "error" : "success"}>{params?.error ?? t("quotes.updated")}</Notice>}
            {!verified && (
              <AssistantNote who="rex">
                {t("quotes.unverified")}
              </AssistantNote>
            )}

            {visible.length === 0 ? (
              <EmptyState icon="chat" title={quotes.length === 0 ? t("quotes.emptyTitle") : t("quotes.nothingHere")}>
                {quotes.length === 0
                  ? t("quotes.emptyBody")
                  : t("quotes.noMatch")}
              </EmptyState>
            ) : (
              visible.map((quote) => {
                const pending = quote.status === "pending";
                const status = statusOf(QUOTE_STATUS, quote.status, t);
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
                          {t("dashboard.quoteLine", { qty: quote.quantity.toLocaleString("en-NG"), product: quote.supplierProduct.name, destination: quote.destination })}
                        </div>
                        <div className="mt-0.5 text-[12.5px] text-app-ink-soft">
                          {timeAgo(quote.createdAt, t)}{place && ` · ${place}`} · {t("products.moq", { moq: quote.supplierProduct.moq.toLocaleString("en-NG") })}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[20px] font-extrabold leading-none">{money(basePrice * quote.quantity, currency)}</div>
                        <div className="mt-1 text-[12px] text-app-ink-soft">{quote.quotedPrice ? t("quotes.quotedValueSmall") : t("quotes.atListPrice")}</div>
                      </div>
                    </div>

                    <div className="grid gap-4 border-t border-app-line p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                      <div className="grid content-start gap-3">
                        <div className="rounded-[16px] bg-app-canvas px-4 py-3">
                          <div className="text-[13px] font-bold">{t("quotes.sellerNote")}</div>
                          <p className="mb-0 mt-1 text-[14px] leading-[1.55]">
                            {quote.notes || t("quotes.noNote")}
                          </p>
                        </div>
                        {!pending && (
                          <div className="rounded-[16px] bg-app-mint px-4 py-3">
                            <div className="text-[13px] font-bold">{t("quotes.yourReply")}</div>
                            <p className="mb-0 mt-1 text-[14px] leading-[1.55]">{quote.supplierResponse || t("quotes.replySent")}</p>
                            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-app-ink-soft">
                              {quote.quotedPrice && <span>{t("quotes.perUnit", { amount: money(quote.quotedPrice, currency) })}</span>}
                              {quote.expiresAt && <span>{t("quotes.validUntilDate", { date: shortDate(quote.expiresAt, t.locale) })}</span>}
                            </div>
                          </div>
                        )}
                      </div>

                      {pending ? (
                        <form action={respondToSupplierQuote} className="grid content-start gap-3">
                          <input type="hidden" name="quoteId" value={quote.id} />
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label htmlFor={`price-${quote.id}`} className={labelClass}>{t("quotes.unitPrice", { currency })}</label>
                              <input id={`price-${quote.id}`} name="quotedPrice" type="number" min="1" step="0.01" defaultValue={quote.supplierProduct.wholesalePrice} className={fieldClass} />
                            </div>
                            <div>
                              <label htmlFor={`expires-${quote.id}`} className={labelClass}>{t("quotes.validUntil")}</label>
                              <input id={`expires-${quote.id}`} name="expiresAt" type="date" className={fieldClass} />
                            </div>
                          </div>
                          <div>
                            <label htmlFor={`message-${quote.id}`} className={labelClass}>{t("quotes.message")}</label>
                            <textarea
                              id={`message-${quote.id}`}
                              name="supplierResponse"
                              rows={3}
                              defaultValue={t("quotes.defaultReply", { qty: quote.quantity.toLocaleString("en-NG"), destination: quote.destination })}
                              className={`${textareaClass} resize-y`}
                            />
                            <VoiceInputButton targetId={`message-${quote.id}`} mode="replace" context="a note with a bulk price" className="mt-2" />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button type="submit" name="intent" value="respond" className={buttonClass.ink}>
                              <Icon name="send" size={14} /> {t("quotes.send")}
                            </button>
                            <button type="submit" name="intent" value="reject" className={buttonClass.white}>
                              {t("quotes.pass")}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="rounded-[16px] border border-app-line px-4 py-3 text-[13.5px] leading-[1.55] text-app-ink-soft">
                          <div className="mb-1 flex items-center gap-2 font-bold text-app-ink">
                            <Icon name="check" size={14} /> {t("quotes.next")}
                          </div>
                          {quote.status === "accepted"
                            ? t("quotes.nextAccepted")
                            : quote.status === "responded"
                              ? t("quotes.nextResponded")
                              : t("quotes.nextClosed")}
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
              <h2 className="m-0 text-[17px] font-extrabold">{t("quotes.health")}</h2>
              <div className="mt-2 grid grid-cols-2 gap-1">
                <StatTile label={t("quotes.waiting")} value={pendingQuotes.length} />
                <StatTile label={t("quotes.answered")} value={respondedQuotes.length} />
                <StatTile label={t("quotes.closed")} value={closedQuotes.length} />
                <StatTile label={t("quotes.quotedValue")} value={money(openQuoteValue(quotes), quotes[0]?.supplierProduct.currency ?? "NGN")} />
              </div>
            </Card>
            <section className="rounded-[22px] bg-app-peach p-5">
              <div className="mb-3 flex items-center gap-3">
                <Mascot who="rex" size={40} />
                <h2 className="m-0 text-[17px] font-extrabold">{t("quotes.win")}</h2>
              </div>
              <ul className="m-0 grid list-none gap-2 p-0">
                {quoteTips.map((tip) => (
                  <li key={tip} className="flex gap-2.5 rounded-[14px] bg-white px-3.5 py-2.5 text-[13.5px] leading-[1.5]">
                    <Icon name="check" size={14} className="mt-1 shrink-0 text-app-success" />
                    <span>{t(tip)}</span>
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
