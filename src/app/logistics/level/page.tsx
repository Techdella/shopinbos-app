import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { partnerLevelView } from "@/lib/logistics/partner-levels.server";
import { getT } from "@/lib/i18n/server";
import { Card, Pill, PillLink } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { PartnerPage } from "@/components/logistics/kit";
import { FeaturedCard, GoalList, InterstateNote, LevelLadder, PayAtDoorSteps, TierUnlocks, tierName } from "@/components/logistics/PartnerLevel";
import { applyFeaturedAction } from "./actions";

// The delivery partner's tier (the owner's "Logistics tiers control reach, not cash"): Tier 1 Verified → Tier 2 Trusted
// → Tier 3 Top partner, worked out from their delivery record every time this page opens
// (src/lib/logistics/partner-levels.server.ts), what's left to the next tier, what each tier unlocks
// (shared/partner-reach.ts), "Apply to be featured" for Top partners, below Trusted what interstate needs, and pay on
// delivery: open from Tier 1, since customers pay in the app at the door and riders never hold cash (paused only while
// cash from older jobs is owed). No cash cap here. The phone app reads the same view from GET
// /api/mobile/logistics/level.

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("logistics"))("reach.title") };
}

export default async function LogisticsLevelPage(props: { searchParams?: Promise<{ applied?: string; error?: string }> }) {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const [view, t, notice] = await Promise.all([partnerLevelView(partner.id), getT("logistics", "common"), props.searchParams]);

  return (
    <PartnerPage
      frame={{ user, partner }}
      title={t("reach.title")}
      sub={t("reach.sub")}
      actions={<PillLink href="/logistics/coverage#where-you-work" icon="pin">{t("reach.coverageLink")}</PillLink>}
    >
      {!view ? (
        <Card className="p-5"><p className="m-0 text-[15px] text-app-ink-soft">{t("reach.loadError")}</p></Card>
      ) : (
        <div className="grid gap-4">
          {notice?.applied ? <Notice tone="success">{t("reach.featured.applied")}</Notice> : null}
          {notice?.error ? <Notice tone="error">{notice.error}</Notice> : null}
          <LevelLadder level={view.level} featured={view.featuredNow} t={t} />
          {view.interstateGated ? <InterstateNote t={t} /> : null}

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <section aria-labelledby="partner-next" className="grid gap-2">
              <div className="px-1">
                <h2 id="partner-next" className="m-0 font-app-display text-[19px] font-extrabold tracking-[-0.01em]">{view.next ? t("reach.next", { name: tierName(view.next, t) }) : t("reach.top")}</h2>
                <p className="m-0 text-[13px] text-app-ink-soft">{view.next ? t("reach.nextSub") : t("reach.topSub")}</p>
              </div>
              {view.goals.length && view.next ? <GoalList goals={view.goals} /> : null}
            </section>
            <FeaturedCard level={view.level} status={view.featuredStatus} featuredNow={view.featuredNow} note={view.featuredNote} apply={applyFeaturedAction} t={t} />
          </div>

          <TierUnlocks level={view.level} fasterPayoutsLive={view.fasterPayoutsLive} t={t} />

          <section aria-labelledby="partner-pod" className="grid gap-2">
            <div className="flex items-end justify-between gap-2 px-1">
              <div className="min-w-0">
                <h2 id="partner-pod" className="m-0 font-app-display text-[19px] font-extrabold tracking-[-0.01em]">{t("reach.pod.title")}</h2>
                <p className="m-0 text-[13px] text-app-ink-soft">
                  {view.podOpen ? (view.podOn ? t("reach.pod.on") : t("reach.pod.open")) : view.codPaused ? t("reach.pod.paused") : t("reach.pod.locked")}
                </p>
              </div>
              <Pill tone={view.podOpen ? "success" : view.codPaused ? "danger" : "muted"} dot>
                {view.podOpen ? (view.podOn ? t("reach.pod.pillOn") : t("reach.pod.pillOpen")) : view.codPaused ? t("reach.pod.pillPaused") : t("reach.pod.pillLocked")}
              </Pill>
            </div>
            <div className="grid gap-2 rounded-[20px] bg-white px-4 py-3 sm:px-5">
              <p className="m-0 font-app-display text-[15px] font-extrabold">{t("reach.pod.stepsTitle")}</p>
              <PayAtDoorSteps t={t} />
            </div>
          </section>
          <p className="m-0 px-1 text-[13px] text-app-ink-soft">{t("reach.safetyNote")}</p>
        </div>
      )}
    </PartnerPage>
  );
}
