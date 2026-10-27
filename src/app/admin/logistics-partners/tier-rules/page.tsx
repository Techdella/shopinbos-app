import { AppPage, Card, CardHead, PillLink } from "@/components/app-kit";
import { adminFrame, formatDate } from "@/components/admin/AdminKit";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { TIER_RULES_KEY, readTierRules, type TierRules } from "@shared/partner-tiers";
import { getTierRules } from "@/lib/logistics/partner-tiers.server";
import { TierRulesForm } from "./TierRulesForm";

export const dynamic = "force-dynamic";

function summary(rules: TierRules) {
  const g = rules.graduation;
  return `₦${rules.maxOrderValue.toLocaleString("en-NG")} per order, ${rules.maxActiveOrders} open jobs · lifts at ${g.minDeliveries} deliveries, ${g.minRating.toFixed(1)}★, ≤${g.maxDisputeRate}% disputes`;
}

// Admin › Logistics partners › Tier rules: the limits Verified Individuals (Tier 1) work within and the graduation
// thresholds that lift them (shared/partner-tiers.ts). Every change is kept with who made it and why.
export default async function AdminTierRulesPage() {
  const user = await requireRole(["admin"], "/admin/login");
  const [rules, changes] = await Promise.all([
    getTierRules(),
    db.platformSettingChange.findMany({ where: { key: TIER_RULES_KEY }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, after: true, note: true, createdAt: true, changedBy: { select: { name: true, email: true } } } }),
  ]);
  return (
    <AppPage
      frame={adminFrame(user, "Search logistics partners")}
      title="Tier rules"
      sub="Limits for Verified Individuals (no CAC) and when they lift. Registered Businesses have no limits."
      actions={<PillLink href="/admin/logistics-partners" icon="arrowLeft" iconOnlyOnPhone>All partners</PillLink>}
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card className="p-5">
          <CardHead title="Tier 1 limits and graduation" sub="Changes apply to the next job offered." />
          <TierRulesForm initial={rules} />
        </Card>
        <Card className="content-start p-5">
          <CardHead title="Changes" />
          {changes.length ? (
            <ul className="m-0 mt-3 grid list-none gap-3 p-0 text-[13.5px]">
              {changes.map((change) => (
                <li key={change.id} className="rounded-[14px] bg-app-canvas px-3 py-2.5">
                  <div className="font-bold">{formatDate(change.createdAt)} · {change.changedBy?.name ?? change.changedBy?.email ?? "Someone on the team"}</div>
                  <div className="text-app-ink-soft">{summary(readTierRules(change.after))}</div>
                  {change.note && <div className="mt-1">“{change.note}”</div>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 mt-3 text-[14px] text-app-ink-soft">Still on the defaults. Changes show here.</p>
          )}
        </Card>
      </div>
    </AppPage>
  );
}
