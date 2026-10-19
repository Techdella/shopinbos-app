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
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("logistics"))("quotes.title") };
}

const FILTERS: Array<{ key: string; label: string; statuses?: QuoteStatus[] }> = [
  { key: "pending", label: "Waiting for you", statuses: ["pending"] },
  { key: "quoted", label: "Quoted", statuses: ["responded"] },
  { key: "won", label: "Won", statuses: ["accepted"] },
  { key: "closed", label: "Declined or expired", statuses: ["rejected", "expired"] },
  { key: "all", label: "All" },
];

export default async function LogisticsQuotesPage({ searchParams }: { searchParams: Promise<{ status?: string; saved?: string; error?: string }> }) {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const { status, saved, error } = await searchParams;
  const filter = FILTERS.find((item) => item.key === status) ?? FILTERS[0];
  const t = await getT("logistics", "common");

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
      title={t("quotes.title")}
      sub={t("quotes.sub")}
      toolbar={<FilterChips items={FILTERS.map((item) => ({ label: t.dynamic(`quotes.filter.${item.key}`, item.label), href: item.key === "pending" ? "/logistics/quotes" : `/logistics/quotes?status=${item.key}`, count: countOf(item.statuses), active: item.key === filter.key }))} />}
    >
      <ActionNotice saved={saved} error={error} savedText={t("quotes.saved")} />

      {quotes.length === 0 && (
        <EmptyState icon="chat" title={filter.key === "pending" ? t("quotes.emptyTitle") : t("quotes.nothingHere")}>
          {filter.key === "pending" ? t("quotes.emptyBody") : t("quotes.tryFilter")}
        </EmptyState>
      )}

      {pending.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {pending.map((quote) => {
            const pkg = packageInfo(quote.packageDetails);
            return (
              <Card key={quote.id} as="article" className="flex flex-col p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Pill tone="accent">{quote.expiresAt ? t("today.replyBy", { when: `${lagosDate(quote.expiresAt, undefined, now, t)}, ${lagosTime(quote.expiresAt, t)}` }) : t("today.asked", { when: timeAgo(quote.createdAt, now, t) })}</Pill>
                  <span className="truncate text-[15px] text-app-ink-soft">{quote.seller.name}{quote.seller.city ? ` · ${quote.seller.city}` : ""}</span>
                </div>
                <Route from={quote.pickupLocation} to={quote.destination} className="mt-3 block break-words text-[16px]" toLabel={t("kit.to")} />
                <dl className="m-0 mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[15px]">
                  <div><dt className="text-app-ink-soft">{t("kit.package")}</dt><dd className="m-0 font-bold">{packageSummary(quote.packageDetails, t)}</dd></div>
                  <div><dt className="text-app-ink-soft">{t("quotes.wanted")}</dt><dd className="m-0 font-bold">{quote.preferredDate ? lagosDate(quote.preferredDate, { weekday: "short", day: "numeric", month: "short" }, now, t) : t("quotes.anyDay")}</dd></div>
                  {typeof pkg.declaredValue === "number" && (
                    <div><dt className="text-app-ink-soft">{t("quotes.valueDeclared")}</dt><dd className="m-0 font-bold">{naira(pkg.declaredValue)}</dd></div>
                  )}
                </dl>

                <form action={respondToDeliveryQuote} className="mt-4 grid gap-3 border-t border-app-line pt-4">
                  <input type="hidden" name="quoteId" value={quote.id} />
                  <input type="hidden" name="intent" value="respond" />
                  <div className="min-w-0">
                    <label htmlFor={`price-${quote.id}`} className={labelClass}>{t("quotes.yourPrice")}</label>
                    <input id={`price-${quote.id}`} name="quotedPrice" type="number" min="1" step="1" required inputMode="numeric" defaultValue={partner.basePrice > 0 ? String(partner.basePrice) : ""} className={inputClass} />
                  </div>
                  <details className="group">
                    <summary className="cursor-pointer list-none text-[15px] font-bold text-app-ink-soft [&::-webkit-details-marker]:hidden">
                      {t("jobs.moreOptions")} <span aria-hidden className="inline-block transition group-open:rotate-90">›</span>
                    </summary>
                    <div className="mt-3 grid gap-3">
                      <div className="min-w-0">
                        <label htmlFor={`note-${quote.id}`} className={labelClass}>{t("quotes.noteToSeller")}</label>
                        <textarea id={`note-${quote.id}`} name="partnerResponse" rows={2} maxLength={1000} placeholder={t("quotes.notePlaceholder")} className={textareaClass} />
                        <VoiceInputButton targetId={`note-${quote.id}`} context="a note with a delivery price" className="mt-2" />
                      </div>
                      <div className="min-w-0">
                        <label htmlFor={`expires-${quote.id}`} className={labelClass}>{t("quotes.goodUntil")}</label>
                        <input id={`expires-${quote.id}`} name="expiresAt" type="date" className={inputClass} />
                      </div>
                    </div>
                  </details>
                  <div className="flex flex-wrap items-center justify-end gap-3">
                    <button type="submit" form={`decline-${quote.id}`} className="min-h-[44px] px-2 text-[15px] font-bold text-app-ink-soft underline-offset-4 hover:underline">{t("today.decline")}</button>
                    <SubmitButton>{t("quotes.send")}</SubmitButton>
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
            const stage = quoteStage(quote.status, t);
            return (
              <ListRow key={quote.id}>
                <div className="min-w-0 flex-1 basis-[220px]">
                  <Route from={quote.pickupLocation} to={quote.destination} className="block truncate text-[15px]" toLabel={t("kit.to")} />
                  <div className="truncate text-[15px] text-app-ink-soft">
                    {quote.seller.name} · {packageSummary(quote.packageDetails, t)} · {t("quotes.askedOn", { date: lagosDate(quote.createdAt, undefined, now, t) })}
                  </div>
                  {quote.partnerResponse && <div className="mt-0.5 truncate text-[15px] text-app-ink-soft">{t("quotes.youSaid", { text: quote.partnerResponse })}</div>}
                </div>
                <Pill tone={stage.tone} dot>{stage.label}</Pill>
                <div className="ml-auto text-[15px] font-extrabold">{quote.quotedPrice ? naira(quote.quotedPrice) : t("quotes.noPrice")}</div>
              </ListRow>
            );
          })}
        </ListCard>
      )}
    </PartnerPage>
  );
}
