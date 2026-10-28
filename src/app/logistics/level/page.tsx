import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { partnerLevelView } from "@/lib/logistics/partner-levels.server";
import { Card, Pill, PillLink } from "@/components/app-kit";
import { PartnerPage } from "@/components/logistics/kit";
import { CashRules, GoalList, LevelLadder } from "@/components/logistics/PartnerLevel";
import { PARTNER_LEVEL_LABELS } from "@shared/dropship-rules";

// The delivery partner's level (the owner's "Supplier & Dropship Rules"): Verified → Trusted → Cash trusted, worked
// out from their delivery record every time this page opens (src/lib/logistics/partner-levels.server.ts), the goals
// left to the next level, and pay on delivery, which opens at Cash trusted with a cash cap. The phone app reads the
// same view from GET /api/mobile/logistics/level.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your level" };

const naira = (amount: number) => `₦${Math.round(amount).toLocaleString("en-NG")}`;

export default async function LogisticsLevelPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const view = await partnerLevelView(partner.id);

  return (
    <PartnerPage
      frame={{ user, partner }}
      title="Your level"
      sub="Your delivery record moves you up. Pay on delivery opens at Cash trusted."
      actions={<PillLink href="/logistics/coverage#where-you-work" icon="pin">Coverage and services</PillLink>}
    >
      {!view ? (
        <Card className="p-5"><p className="m-0 text-[15px] text-app-ink-soft">We couldn&apos;t load your record. Try again in a moment.</p></Card>
      ) : (
        <div className="grid gap-4">
          <LevelLadder level={view.level} />

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <section aria-labelledby="partner-next" className="grid gap-2">
              <div className="px-1">
                <h2 id="partner-next" className="m-0 font-app-display text-[19px] font-extrabold tracking-[-0.01em]">{view.next ? `Next: ${PARTNER_LEVEL_LABELS[view.next]}` : "You're at the top level"}</h2>
                <p className="m-0 text-[13px] text-app-ink-soft">{view.next ? "What's left to get there" : "Keep delivering well and paying cash in on time to stay here."}</p>
              </div>
              {view.goals.length && view.next ? <GoalList goals={view.goals} /> : null}
            </section>

            <section aria-labelledby="partner-pod" className="grid gap-2">
              <div className="flex items-end justify-between gap-2 px-1">
                <div className="min-w-0">
                  <h2 id="partner-pod" className="m-0 font-app-display text-[19px] font-extrabold tracking-[-0.01em]">Pay on delivery</h2>
                  <p className="m-0 text-[13px] text-app-ink-soft">{view.podOpen ? (view.podOn ? "On. Shops can offer it on routes you cover." : "Open to you. Switch it on in Coverage.") : view.codPaused && view.level === "cash_trusted" ? "Paused until your late cash is paid in." : "Unlocks at Cash trusted"}</p>
                </div>
                <Pill tone={view.podOpen ? "success" : view.codPaused ? "danger" : "muted"} dot>{view.podOpen ? (view.podOn ? "On" : "Open") : view.codPaused && view.level === "cash_trusted" ? "Paused" : "Locked"}</Pill>
              </div>
              <div className="grid gap-2 rounded-[20px] bg-white px-4 py-3 sm:px-5">
                {!view.podOpen && !(view.codPaused && view.level === "cash_trusted") ? <p className="m-0 text-[13.5px] leading-[1.5] text-app-ink-soft">{view.lockedMessage}</p> : null}
                <p className="m-0 mt-1 font-app-display text-[15px] font-extrabold">{view.podOpen ? "Your cash rules" : "Once unlocked"} · cap {naira(view.cashCap)}</p>
                <CashRules cashCap={view.cashCap} />
              </div>
            </section>
          </div>
        </div>
      )}
    </PartnerPage>
  );
}
