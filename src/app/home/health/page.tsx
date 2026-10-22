import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { Card, CardHead, EmptyState, Pill, PillLink, SplitLayout, type Tone } from "@/components/app-kit";
import { ShareBar, formatDate } from "@/components/growth/kit";
import { RecalculateButton } from "./RecalculateButton";
import { getLocale, getT } from "@/lib/i18n/server";
import { PageTip } from "@/components/learn/PageTip";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("home");
  return { title: t("health.title") };
}

const FACTORS = [
  { key: "inventory", weight: 30 },
  { key: "orders", weight: 25 },
  { key: "products", weight: 20 },
  { key: "store", weight: 15, note: true },
  { key: "activity", weight: 10 },
] as const;

// The score API was written for the old /store routes; these are the matching seller pages.
const ACTION_LINK = {
  restock: "/home/inventory",
  add_products: "/products/new",
  drive_sales: "/home/marketing",
  increase_activity: "/home",
} as const;

function band(score: number): { tone: Tone; label: "health.band.attention" | "health.band.fair" | "health.band.good" } {
  if (score < 50) return { tone: "danger", label: "health.band.attention" };
  if (score < 75) return { tone: "warning", label: "health.band.fair" };
  return { tone: "success", label: "health.band.good" };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export default async function StoreHealthPage() {
  const user = await requireRole(["seller"], "/login");
  const tipT = await getT("tips");
  const t = await getT("home", "common");
  const locale = await getLocale();
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
      title={t("health.title")}
      sub={t("health.sub")}
      actions={snapshot ? <RecalculateButton /> : undefined}
    >
      <PageTip className="mb-5">{tipT("health")}</PageTip>
      {!snapshot ? (
        <EmptyState icon="pulse" title={t("health.noScore")} action={<RecalculateButton label={t("health.workOut")} tone="ink" />}>
          {t("health.emptySub")}
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
                      <div className="text-[12.5px] text-app-ink-soft">{t("health.outOf")}</div>
                    </div>
                  </div>
                </div>
                <div className="min-w-0 text-center sm:text-left">
                  <Pill tone={status.tone} dot>{t(status.label)}</Pill>
                  <h2 className="mb-0 mt-3 text-[22px] font-extrabold leading-tight">{t("health.scores", { score })}</h2>
                  <p className="mb-0 mt-1.5 text-[14px] text-app-ink-soft">{t("health.workedOut", { date: formatDate(snapshot.createdAt, true, locale) })}</p>
                </div>
              </Card>

              <Card className="p-5">
                <CardHead title={t("health.whatGoesIn")} />
                <div className="mt-4 grid gap-4">
                  {FACTORS.map((factor) => {
                    const value = Math.round(Number(factors[factor.key] ?? 0));
                    return (
                      <div key={factor.key}>
                        <ShareBar label={t("health.factorLine", { label: t(`health.factor.${factor.key}`), weight: factor.weight })} value={`${value} / 100`} share={value / 100} tone={value >= 75 ? "success" : value >= 50 ? "ink" : "accent"} />
                        {"note" in factor && <div className="mt-1 text-[12.5px] text-app-ink-soft">{t("health.factor.storeNote")}</div>}
                      </div>
                    );
                  })}
                </div>
              </Card>
            </>
          }
          side={
            <Card className="overflow-hidden">
              <div className="px-5 pb-3 pt-5"><CardHead title={t("health.next")} /></div>
              {recommendations.length ? (
                <ul className="m-0 list-none divide-y divide-app-line border-t border-app-line p-0">
                  {recommendations.map((rec, index) => {
                    const action = String(rec.action);
                    const link = action in ACTION_LINK ? { href: ACTION_LINK[action as keyof typeof ACTION_LINK], label: t(`health.action.${action as keyof typeof ACTION_LINK}`) } : null;
                    return (
                      <li key={index} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] font-bold">{String(rec.label)}</span>
                          {rec.impact === "high" && <span className="text-[12.5px] text-app-ink-soft">{t("health.bigEffect")}</span>}
                        </span>
                        {link && <PillLink href={link.href} size="sm" tone="ink">{link.label}</PillLink>}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="m-0 border-t border-app-line px-5 py-6 text-[14px] text-app-ink-soft">{t("health.nothingToFix")}</p>
              )}
            </Card>
          }
        />
      )}
    </SellerPage>
  );
}
