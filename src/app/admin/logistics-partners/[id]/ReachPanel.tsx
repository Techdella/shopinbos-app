import { Card, CardHead, Pill } from "@/components/app-kit";
import { formatDate } from "@/components/admin/AdminKit";
import { db } from "@/lib/db/client";
import { partnerLevelRecord } from "@/lib/logistics/partner-levels.server";
import { PARTNER_LEVEL_LABELS, partnerLevel, partnerLevelGoals, partnerLevelOf, partnerTierName, type LevelGoal, type PartnerLevel } from "@shared/dropship-rules";
import { TIER_UNLOCKS, UNLOCK_WORDS, featuredStatusOf, interstateGated, isFeaturedNow } from "@shared/partner-reach";
import { TierActionButton } from "./TierActionButton";

// Admin › Logistics partners › [id]: the partner's reach tier (Tier 1 Verified → Tier 2 Trusted → Tier 3 Top partner,
// shared/dropship-rules.ts + shared/partner-reach.ts), worked out from their record now (the stored one refreshes on
// each delivery), what's left to the next tier, and the featured application: approve, turn down or remove.
export async function ReachPanel({ partnerId }: { partnerId: string }) {
  const [partner, record] = await Promise.all([
    db.logisticsPartner.findUnique({ where: { id: partnerId }, select: { level: true, services: true, verificationStatus: true, featuredStatus: true, featuredAppliedAt: true, featuredAt: true, featuredNote: true, interstateNoticeAt: true } }),
    partnerLevelRecord(partnerId),
  ]);
  if (!partner || !record) return null;
  const { next, goals } = partnerLevelGoals(record);
  return <ReachPanelView partnerId={partnerId} partner={partner} now={partnerLevel(record)} next={next} goals={goals} />;
}

type ReachPartner = { level: string; services: string[]; verificationStatus: unknown; featuredStatus: string; featuredAppliedAt: Date | null; featuredAt: Date | null; featuredNote: string | null; interstateNoticeAt: Date | null };

/** The panel itself, from loaded data. */
export function ReachPanelView({ partnerId, partner, now, next, goals }: { partnerId: string; partner: ReachPartner; now: PartnerLevel; next: PartnerLevel | null; goals: LevelGoal[] }) {
  const stored = partnerLevelOf(partner.level);
  const featured = featuredStatusOf(partner.featuredStatus);
  const url = `/api/admin/logistics-partners/${partnerId}/featured`;
  return (
    <Card className="mb-5 scroll-mt-6 p-0">
      <span id="featured" className="block scroll-mt-6" aria-hidden />
      <CardHead
        title={`Reach tier: ${partnerTierName(stored)}`}
        sub={now !== stored ? `Their record now says ${partnerTierName(now)}; it's stored on their next delivery or when they open their level screen.` : "Tiers control reach: interstate, place in shops' lists, high-value parcels, featured."}
        className="px-4 pt-4 sm:px-5"
      />
      <div className="grid gap-4 px-4 pb-4 pt-3 sm:px-5 lg:grid-cols-2">
        <div className="grid content-start gap-2 text-[14px]">
          <p className="m-0 font-bold">Unlocked: {(["verified", "trusted", "cash_trusted"] as const).slice(0, ["verified", "trusted", "cash_trusted"].indexOf(stored) + 1).flatMap((level) => TIER_UNLOCKS[level]).map((key) => UNLOCK_WORDS[key]).join(" · ")}</p>
          {next ? (
            <>
              <p className="m-0 font-extrabold">To {PARTNER_LEVEL_LABELS[next]}:</p>
              <ul className="m-0 grid list-none gap-1 p-0">
                {goals.map((goal) => (
                  <li key={goal.key} className="flex items-center justify-between gap-3">
                    <span>{goal.label}</span>
                    <Pill tone={goal.done ? "success" : "muted"}>{goal.kind === "count" ? `${goal.have} / ${goal.need}` : goal.done ? "Done" : "Not yet"}</Pill>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="m-0 text-app-ink-soft">At the top tier.</p>
          )}
          {interstateGated({ services: partner.services, level: stored, verificationStatus: String(partner.verificationStatus) }) ? (
            <p className="m-0 rounded-[12px] bg-app-canvas px-3 py-2 text-[13px]">
              Still offers interstate below Trusted: interstate jobs don&apos;t go to them, and it&apos;s taken off on their next tier refresh (they&apos;re told once).
            </p>
          ) : partner.interstateNoticeAt && stored === "verified" ? (
            <p className="m-0 rounded-[12px] bg-app-canvas px-3 py-2 text-[13px]">
              Interstate taken off below Trusted. Told on {formatDate(partner.interstateNoticeAt)}.
            </p>
          ) : null}
        </div>
        <div className="grid content-start gap-2 rounded-[16px] bg-app-canvas p-3 text-[14px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-extrabold">Featured</span>
            <Pill tone={isFeaturedNow(partner) ? "accent" : featured === "applied" ? "warning" : featured === "rejected" ? "danger" : "muted"}>
              {isFeaturedNow(partner) ? "Featured" : featured === "featured" ? "Featured (paused: not a Top partner now)" : featured === "applied" ? "Applied" : featured === "rejected" ? "Turned down" : "Not applied"}
            </Pill>
          </div>
          {partner.featuredAppliedAt ? <span className="text-[13px] text-app-ink-soft">Applied {formatDate(partner.featuredAppliedAt)}{partner.featuredAt ? ` · featured since ${formatDate(partner.featuredAt)}` : ""}</span> : null}
          {partner.featuredNote ? <span className="text-[13px]">“{partner.featuredNote}”</span> : null}
          <div className="flex flex-wrap gap-2">
            {featured === "applied" ? (
              <>
                <TierActionButton url={url} body={{ action: "approve" }} label="Approve featured" confirm="Feature this partner? They get a Featured badge and the top of shops' rider lists." />
                <TierActionButton url={url} body={{ action: "reject" }} label="Turn down" tone="danger" reason={{ title: "Turn down the featured application?", message: "They see this reason and can apply again later." }} />
              </>
            ) : featured === "featured" ? (
              <TierActionButton url={url} body={{ action: "remove" }} label="Remove featured" tone="white" reason={{ title: "Stop featuring this partner?", message: "They see this reason." }} />
            ) : (
              <span className="text-[13px] text-app-ink-soft">Top partners (Tier 3) apply from their level screen.</span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
