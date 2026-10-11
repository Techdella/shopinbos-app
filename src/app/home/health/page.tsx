import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { Card, CardHead, EmptyState, Pill, PillLink, SplitLayout, type Tone } from "@/components/app-kit";
import { ShareBar, formatDate } from "@/components/growth/kit";
import { RecalculateButton } from "./RecalculateButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Store health" };

const FACTORS: Array<{ key: string; label: string; weight: number; note?: string }> = [
  { key: "inventory", label: "Products in stock", weight: 30 },
  { key: "orders", label: "Orders", weight: 25 },
  { key: "products", label: "Products listed", weight: 20 },
  { key: "store", label: "Store setup", weight: 15, note: "Counted as 80 for every store for now" },
  { key: "activity", label: "Activity this week", weight: 10 },
];

// The score API was written for the old /store routes; these are the matching seller pages.
const ACTION_LINK: Record<string, { href: string; label: string }> = {
  restock: { href: "/home/inventory", label: "Restock" },
  add_products: { href: "/products/new", label: "Add products" },
  drive_sales: { href: "/home/marketing", label: "Go to marketing" },
  increase_activity: { href: "/home", label: "Open home" },
};

function band(score: number): { tone: Tone; label: string } {
  if (score < 50) return { tone: "danger", label: "Needs attention" };
  if (score < 75) return { tone: "warning", label: "Fair" };
  return { tone: "success", label: "Good" };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export default async function StoreHealthPage() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  const snapshot = store ? await db.storeHealthSnapshot.findFirst({ where: { storeId: store.id }, orderBy: { createdAt: "desc" } }) : null;

  const factors = record(snapshot?.factors);
  const recommendations = (Array.isArray(snapshot?.recommendations) ? snapshot.recommendations : [])
    .map((item) => record(item))
    .filter((item) => typeof item.label === "string");
  const score = snapshot?.score ?? 0;
  const status = band(score);
  const ring = 2 * Math.PI * 60;

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Store health"
      sub="A quick score from your stock, orders, products and activity."
      actions={snapshot ? <RecalculateButton /> : undefined}
    >
      {!snapshot ? (
        <EmptyState icon="pulse" title="No score yet" action={<RecalculateButton label="Work out my score" tone="ink" />}>
          We look at your stock, orders, products and this week&apos;s activity and give your store a score out of 100.
        </EmptyState>
      ) : (
        <SplitLayout
          main={
            <>
              <Card className="flex flex-col items-center gap-6 p-6 sm:flex-row sm:p-8">
                <div className="relative h-[150px] w-[150px] shrink-0">
                  <svg width="150" height="150" viewBox="0 0 150 150" aria-hidden>
                    <circle cx="75" cy="75" r="60" fill="none" stroke="#ECEAF2" strokeWidth="12" />
                    <circle
                      cx="75" cy="75" r="60" fill="none"
                      className={status.tone === "danger" ? "stroke-app-danger" : status.tone === "warning" ? "stroke-[#F2A93B]" : "stroke-app-success"}
                      strokeWidth="12" strokeLinecap="round"
                      strokeDasharray={ring} strokeDashoffset={ring - (Math.max(0, Math.min(100, score)) / 100) * ring}
                      transform="rotate(-90 75 75)"
                    />
                  </svg>
                  <div className="absolute inset-0 grid place-items-center text-center">
                    <div>
                      <div className="text-[40px] font-extrabold leading-none">{score}</div>
                      <div className="text-[12.5px] text-app-ink-soft">out of 100</div>
                    </div>
                  </div>
                </div>
                <div className="min-w-0 text-center sm:text-left">
                  <Pill tone={status.tone} dot>{status.label}</Pill>
                  <h2 className="mb-0 mt-3 text-[22px] font-extrabold leading-tight">Your store scores {score}.</h2>
                  <p className="mb-0 mt-1.5 text-[14px] text-app-ink-soft">Worked out {formatDate(snapshot.createdAt, true)}.</p>
                </div>
              </Card>

              <Card className="p-5">
                <CardHead title="What goes into it" />
                <div className="mt-4 grid gap-4">
                  {FACTORS.map((factor) => {
                    const value = Math.round(Number(factors[factor.key] ?? 0));
                    return (
                      <div key={factor.key}>
                        <ShareBar label={`${factor.label} (${factor.weight}% of score)`} value={`${value} / 100`} share={value / 100} tone={value >= 75 ? "success" : value >= 50 ? "ink" : "accent"} />
                        {factor.note && <div className="mt-1 text-[12.5px] text-app-ink-soft">{factor.note}</div>}
                      </div>
                    );
                  })}
                </div>
              </Card>
            </>
          }
          side={
            <Card className="overflow-hidden">
              <div className="px-5 pb-3 pt-5"><CardHead title="What to do next" /></div>
              {recommendations.length ? (
                <ul className="m-0 list-none divide-y divide-app-line border-t border-app-line p-0">
                  {recommendations.map((rec, index) => {
                    const link = ACTION_LINK[String(rec.action)];
                    return (
                      <li key={index} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] font-bold">{String(rec.label)}</span>
                          {rec.impact === "high" && <span className="text-[12.5px] text-app-ink-soft">Big effect on your score</span>}
                        </span>
                        {link && <PillLink href={link.href} size="sm" tone="ink">{link.label}</PillLink>}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="m-0 border-t border-app-line px-5 py-6 text-[14px] text-app-ink-soft">Nothing to fix right now.</p>
              )}
            </Card>
          }
        />
      )}
    </SellerPage>
  );
}
