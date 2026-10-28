import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { partnerLevelView } from "@/lib/logistics/partner-levels.server";
import { Card, Pill, PillLink } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { PartnerPage, SubmitButton } from "@/components/logistics/kit";
import { GoalList, LevelLadder, PayAtDoorSteps, TierPerks } from "@/components/logistics/PartnerLevel";
import { PARTNER_LEVEL_LABELS, PARTNER_LEVELS } from "@shared/dropship-rules";
import { applyFeatured } from "./actions";

// The delivery partner's tier (the owner's "Supplier & Dropship Rules"): 1 Verified → 2 Trusted → 3 Top partner, worked
// out from their delivery record every time this page opens (src/lib/logistics/partner-levels.server.ts), the goals
// left to the next tier, what each tier unlocks, and pay on delivery, open from Tier 1 since riders never hold cash.
// Top partners can apply to be featured. The phone app reads the same view from GET /api/mobile/logistics/level.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your tier" };

export default async function LogisticsLevelPage({ searchParams }: { searchParams: Promise<{ featured?: string; error?: string }> }) {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const view = await partnerLevelView(partner.id);
  const { featured, error } = await searchParams;

  return (
    <PartnerPage
      frame={{ user, partner }}
      title="Your tier"
      sub="Tiers control reach, not cash. Your delivery record moves you up."
      actions={<PillLink href="/logistics/coverage#where-you-work" icon="pin">Coverage and services</PillLink>}
    >
      {!view ? (
        <Card className="p-5"><p className="m-0 text-[15px] text-app-ink-soft">We couldn&apos;t load your record. Try again in a moment.</p></Card>
      ) : (
        <div className="grid gap-4">
          {featured ? <Notice tone="success">Thanks! The Shopinbos team will look at your record and get back to you.</Notice> : null}
          {error ? <Notice>{error}</Notice> : null}
          <LevelLadder level={view.level} />

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <section aria-labelledby="partner-next" className="grid gap-2">
              <div className="px-1">
                <h2 id="partner-next" className="m-0 font-app-display text-[19px] font-extrabold tracking-[-0.01em]">
                  {view.next ? `Next: Tier ${PARTNER_LEVELS.indexOf(view.next) + 1} · ${PARTNER_LEVEL_LABELS[view.next]}` : "You're a Top partner"}
                </h2>
                <p className="m-0 text-[13px] text-app-ink-soft">{view.next ? "What's left to get there" : "Keep delivering well to stay here."}</p>
              </div>
              {view.goals.length && view.next ? <GoalList goals={view.goals} /> : null}
              {view.perks.canApplyFeatured ? (
                <form action={applyFeatured} className="grid gap-2 rounded-[20px] bg-white px-4 py-3 sm:px-5">
                  <p className="m-0 font-app-display text-[15px] font-extrabold">Be featured to shops</p>
                  <p className="m-0 text-[13.5px] leading-[1.5] text-app-ink-soft">Top partners can ask to be featured where shops look for delivery partners. The team checks your record first.</p>
                  <SubmitButton>Apply to be featured</SubmitButton>
                </form>
              ) : null}
            </section>

            <section aria-labelledby="partner-tiers" className="grid gap-2">
              <div className="px-1">
                <h2 id="partner-tiers" className="m-0 font-app-display text-[19px] font-extrabold tracking-[-0.01em]">What each tier unlocks</h2>
              </div>
              <TierPerks level={view.level} />
            </section>
          </div>

          <section aria-labelledby="partner-pod" className="grid gap-2">
            <div className="flex items-end justify-between gap-2 px-1">
              <div className="min-w-0">
                <h2 id="partner-pod" className="m-0 font-app-display text-[19px] font-extrabold tracking-[-0.01em]">Pay on delivery</h2>
                <p className="m-0 text-[13px] text-app-ink-soft">
                  {view.podOpen ? (view.podOn ? "On. Shops can offer it on routes you cover." : "Open to you. Switch it on in Coverage.") : view.codPaused ? "Paused until the cash you collected on older jobs is paid in." : "Opens once your company is verified."}
                </p>
              </div>
              <Pill tone={view.podOpen ? "success" : view.codPaused ? "danger" : "muted"} dot>{view.podOpen ? (view.podOn ? "On" : "Open") : view.codPaused ? "Paused" : "Locked"}</Pill>
            </div>
            <div className="grid gap-2 rounded-[20px] bg-white px-4 py-3 sm:px-5">
              <p className="m-0 font-app-display text-[15px] font-extrabold">No cash, no code, no drop</p>
              <PayAtDoorSteps />
            </div>
          </section>
        </div>
      )}
    </PartnerPage>
  );
}
