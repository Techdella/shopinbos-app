import type { Metadata } from "next";
import { AppPage, Card, CardHead, EmptyState, ListCard, ListRow, Pill, PillLink } from "@/components/app-kit";
import { adminFrame, buttonClass, formatDate } from "@/components/admin/AdminKit";
import { endPromotion } from "@/app/actions/pricing";
import { requireRole } from "@/lib/server-auth";
import { getPricingSnapshot } from "@/lib/pricing/price-book.server";
import { listPromotions } from "@/lib/pricing/promotions.server";
import { PRICE_GROUPS } from "@shared/platform-pricing";
import { PROMO_AUDIENCES, promotionChanges, promotionState, readPromoPrices, toLagosInput, type PromoState } from "@shared/price-promotions";
import { PromotionForm, type PromotionFormInitial } from "./PromotionForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Price promotions" };

// Black Friday and seasonal price drops (shared/price-promotions.ts): new prices for a while, back to normal by
// themselves, announced by email (Product news) and in-app notice + push when they start.

const STATE_PILL: Record<PromoState, { tone: "success" | "info" | "muted" | "danger"; label: string }> = {
  live: { tone: "success", label: "Live" },
  upcoming: { tone: "info", label: "Upcoming" },
  ended: { tone: "muted", label: "Ended" },
  cancelled: { tone: "danger", label: "Cancelled" },
};

const NOTICE_TEXT: Record<string, string> = { pending: "Notice waits for the start", sending: "Sending notices", sent: "Notices sent", off: "No notice" };

function audienceText(audience: string[]) {
  return PROMO_AUDIENCES.filter((a) => audience.includes(a.key)).map((a) => a.label).join(", ") || "Nobody";
}

export default async function AdminPromotionsPage({ searchParams }: { searchParams: Promise<{ saved?: string; edit?: string }> }) {
  const user = await requireRole(["admin"], "/admin/login");
  const [query, promos, { base }] = await Promise.all([searchParams, listPromotions(), getPricingSnapshot()]);
  const now = new Date();
  const editing = query.edit ? promos.find((promo) => promo.id === query.edit && promotionState(promo, now) === "upcoming") ?? null : null;

  const initial: PromotionFormInitial = editing
    ? {
        id: editing.id,
        values: {
          name: editing.name,
          headline: editing.headline,
          message: editing.message ?? "",
          startsAt: toLagosInput(editing.startsAt),
          endsAt: toLagosInput(editing.endsAt),
          ...(editing.announceEmail ? { announceEmail: "on" } : {}),
          ...(editing.announceNotice ? { announceNotice: "on" } : {}),
          ...Object.fromEntries(editing.audience.map((key) => [`audience:${key}`, "on"])),
          ...Object.fromEntries(Object.entries(readPromoPrices(editing.prices)).map(([key, value]) => [`p:${key}`, String(value)])),
        },
      }
    : { id: null, values: { announceEmail: "on", announceNotice: "on", "audience:seller": "on" } };

  return (
    <AppPage
      frame={adminFrame(user)}
      title="Price promotions"
      sub="Black Friday and seasonal price drops: new prices for a while, back to normal by themselves."
      actions={<PillLink href="/admin/pricing" size="sm" icon="arrowLeft">Normal prices</PillLink>}
    >
      {query.saved && (
        <div role="status" className="mb-5 rounded-[22px] border border-app-line bg-white p-4 text-[14px]">{query.saved}</div>
      )}

      {promos.length ? (
        <ListCard>
          {promos.map((promo) => {
            const state = promotionState(promo, now);
            const changes = promotionChanges(promo.prices, base);
            return (
              <ListRow key={promo.id} className="items-start">
                <div className="min-w-0 flex-1 basis-[280px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-extrabold">{promo.name}</span>
                    <Pill tone={STATE_PILL[state].tone} dot>{STATE_PILL[state].label}</Pill>
                  </div>
                  <div className="mt-0.5 text-[13.5px]">{promo.headline}</div>
                  <div className="mt-1 text-[13px] text-app-ink-soft">
                    {formatDate(promo.startsAt)} → {formatDate(promo.endsAt)} · {audienceText(promo.audience)}
                    {promo.announceEmail ? " · Email" : ""} · {NOTICE_TEXT[promo.noticeStatus] ?? promo.noticeStatus}
                    {promo.noticeCount ? ` (${promo.noticeCount.toLocaleString("en-NG")})` : ""}
                  </div>
                  <ul className="mb-0 mt-2 grid gap-0.5 pl-4 text-[13px]">
                    {changes.map((change) => (
                      <li key={change.key}>
                        {PRICE_GROUPS[change.group].title}, {change.label.toLowerCase()}: <s className="text-app-ink-soft">{change.from}</s> → <strong>{change.to}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-wrap gap-2">
                  {promo.broadcastId && <PillLink href="/admin/product-news" size="sm">Email</PillLink>}
                  {state === "upcoming" && <PillLink href={`/admin/pricing/promotions?edit=${promo.id}#form`} size="sm">Edit</PillLink>}
                  {(state === "upcoming" || state === "live") && (
                    <form action={endPromotion}>
                      <input type="hidden" name="id" value={promo.id} />
                      <button type="submit" className={buttonClass("danger", "sm")}>{state === "live" ? "End now" : "Cancel"}</button>
                    </form>
                  )}
                </div>
              </ListRow>
            );
          })}
        </ListCard>
      ) : (
        <EmptyState icon="percent" title="No promotions yet">Schedule one below: it starts and ends by itself.</EmptyState>
      )}

      <div id="form" className="mt-6 scroll-mt-24">
        <Card className="p-5">
          <CardHead
            title={editing ? `Edit “${editing.name}”` : "New promotion"}
            sub="Payments already started keep their price. Once it starts it can only be ended, not edited."
            action={editing ? <PillLink href="/admin/pricing/promotions" size="sm">New instead</PillLink> : undefined}
          />
          <div className="mt-4">
            <PromotionForm key={editing?.id ?? "new"} initial={initial} base={base} />
          </div>
        </Card>
      </div>
    </AppPage>
  );
}
