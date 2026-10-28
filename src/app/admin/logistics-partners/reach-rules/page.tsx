import { AppPage, Card, CardHead, PillLink } from "@/components/app-kit";
import { adminFrame, formatDate } from "@/components/admin/AdminKit";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { PARTNER_LEVELS, partnerTierName } from "@shared/dropship-rules";
import { HIGH_VALUE_KEY, TIER_UNLOCKS, UNLOCK_WORDS, readHighValueRules, type HighValueRules } from "@shared/partner-reach";
import { PRODUCT_TYPES } from "@shared/product-types";
import { getHighValueRules, interstateGatedCount } from "@/lib/logistics/partner-reach.server";
import { ReachRulesForm } from "./ReachRulesForm";

export const dynamic = "force-dynamic";

function summary(rules: HighValueRules) {
  return `Over ₦${rules.minOrderValue.toLocaleString("en-NG")} · ${rules.productTypes.join(", ") || "no types"} · ${rules.keywords.join(", ") || "no words"}`;
}

// Admin › Logistics partners › Reach rules: the reach tiers (Tier 1 Verified, Tier 2 Trusted, Tier 3 Top partner) and
// what each unlocks, and the high-value parcel rules only Top partners carry (shared/partner-reach.ts). The tiers'
// thresholds are fixed in shared/dropship-rules.ts; the safety limits for new partners are on Safety limits.
export default async function AdminReachRulesPage() {
  const user = await requireRole(["admin"], "/admin/login");
  const [rules, changes, gated] = await Promise.all([
    getHighValueRules(),
    db.platformSettingChange.findMany({ where: { key: HIGH_VALUE_KEY }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, after: true, note: true, createdAt: true, changedBy: { select: { name: true, email: true } } } }),
    interstateGatedCount().catch(() => null),
  ]);
  const types = PRODUCT_TYPES.filter((type) => type.key !== "digital" && type.key !== "service").map((type) => ({ key: type.key, label: type.label }));
  return (
    <AppPage
      frame={adminFrame(user, "Search logistics partners")}
      title="Reach rules"
      sub="What each partner tier unlocks, and which parcels count as high-value (only Top partners carry them)."
      actions={
        <>
          <PillLink href="/admin/logistics-partners/tier-rules" size="sm" icon="settings">Safety limits</PillLink>
          <PillLink href="/admin/logistics-partners" icon="arrowLeft" iconOnlyOnPhone>All partners</PillLink>
        </>
      }
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="grid content-start gap-5">
          <Card className="p-5">
            <CardHead title="Partner tiers" sub="Worked out from each partner's delivery record. Tiers control reach, not cash." />
            <ul className="m-0 mt-3 grid list-none gap-2 p-0">
              {PARTNER_LEVELS.map((level) => (
                <li key={level} className="rounded-[14px] bg-app-canvas px-3 py-2.5 text-[14px]">
                  <div className="font-extrabold">{partnerTierName(level)}</div>
                  <div className="text-app-ink-soft">{TIER_UNLOCKS[level].map((key) => UNLOCK_WORDS[key]).join(" · ")}</div>
                </li>
              ))}
            </ul>
            {gated !== null ? (
              <p className="m-0 mt-3 text-[13.5px] text-app-ink-soft">
                {gated} verified partner{gated === 1 ? "" : "s"} offer interstate below Trusted: interstate jobs don&apos;t go to them, it&apos;s taken off on their next tier refresh (the delivery-jobs cron runs it), and each is told once what they need.
              </p>
            ) : null}
          </Card>
          <Card className="p-5">
            <CardHead title="High-value parcels" sub="Only Top partners (Tier 3) are offered, booked or can accept these. Changes apply to the next checkout." />
            <ReachRulesForm initial={rules} types={types} />
          </Card>
        </div>
        <Card className="content-start p-5">
          <CardHead title="Changes" />
          {changes.length ? (
            <ul className="m-0 mt-3 grid list-none gap-3 p-0 text-[13.5px]">
              {changes.map((change) => (
                <li key={change.id} className="rounded-[14px] bg-app-canvas px-3 py-2.5">
                  <div className="font-bold">{formatDate(change.createdAt)} · {change.changedBy?.name ?? change.changedBy?.email ?? "Someone on the team"}</div>
                  <div className="text-app-ink-soft">{summary(readHighValueRules(change.after))}</div>
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
