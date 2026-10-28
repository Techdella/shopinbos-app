import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { partnerLevelView } from "@/lib/logistics/partner-levels.server";
import { Card, CardHead, Pill, PillLink } from "@/components/app-kit";
import { PartnerPage } from "@/components/logistics/kit";
import { CashRules, GoalRow, LevelLadder } from "@/components/logistics/PartnerLevel";
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
        <div className="grid gap-5">
          <LevelLadder level={view.level} />

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-5">
              <CardHead
                title={view.next ? `Next: ${PARTNER_LEVEL_LABELS[view.next]}` : "You're at the top level"}
                sub={view.next ? "What's left to get there" : "Keep delivering well and paying cash in on time to stay here."}
              />
              {view.goals.length && view.next ? (
                <ul className="m-0 mt-4 grid list-none gap-3.5 p-0">
                  {view.goals.map((goal) => <GoalRow key={goal.key} goal={goal} />)}
                </ul>
              ) : null}
            </Card>

            <Card className="p-5">
              <CardHead
                title="Pay on delivery"
                sub={view.podOpen ? (view.podOn ? "On. Shops can offer it on routes you cover." : "Open to you. Switch it on in Coverage.") : view.codPaused && view.level === "cash_trusted" ? "Paused until your late cash is paid in." : "Unlocks at Cash trusted"}
                action={<Pill tone={view.podOpen ? "success" : view.codPaused ? "danger" : "muted"} dot>{view.podOpen ? (view.podOn ? "On" : "Open") : view.codPaused && view.level === "cash_trusted" ? "Paused" : "Locked"}</Pill>}
              />
              {!view.podOpen && !(view.codPaused && view.level === "cash_trusted") ? <p className="mb-0 mt-3 text-[14px] leading-[1.5] text-app-ink-soft">{view.lockedMessage}</p> : null}
              <p className="mb-2 mt-4 font-mono text-[11px] uppercase tracking-[0.16em] text-app-ink-soft">Cash cap {naira(view.cashCap)}</p>
              <CashRules cashCap={view.cashCap} />
            </Card>
          </div>
        </div>
      )}
    </PartnerPage>
  );
}
