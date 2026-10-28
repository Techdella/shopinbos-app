import { Card, CardHead, Pill, PillLink, type Tone } from "@/components/app-kit";
import { getT } from "@/lib/i18n/server";
import { formatMoney } from "@shared/i18n";
import { ITEM_SCREEN, TIER1_ITEMS, type ItemState } from "@shared/partner-tiers";
import { kycState } from "@/lib/logistics/partner-kyc.server";

// The partner's tier on "Today" (spec: current tier and badges, limits and progress toward lifting them, what needs
// fixing with the reason, and "Add CAC" for Tier 1).

const TONE: Record<ItemState, Tone> = { missing: "muted", pending: "warning", approved: "success", rejected: "danger" };

export async function TierCard({ partnerId }: { partnerId: string }) {
  const state = await kycState(partnerId);
  if (!state) return null;
  const t = await getT("partnerKyc");
  const verified = state.state === "tier1_verified" || state.state === "tier2_verified";
  const { limits } = state;
  const progress = limits.progress;
  const naira = (amount: number) => formatMoney(amount, t.locale);

  // What needs the partner's attention: anything rejected (with the reason), then anything still missing.
  const reasons: Record<string, string | null | undefined> = {
    idDocument: state.identity.nin?.rejectionReason ?? state.docs.find((doc) => doc.type === "identity")?.rejectionReason,
    selfie: state.docs.find((doc) => doc.type === "selfie")?.rejectionReason,
  };
  const attention = TIER1_ITEMS.filter((item) => state.tier1[item] === "rejected" || (!verified && state.tier1[item] === "missing"));

  return (
    <Card className="p-5">
      <CardHead
        title={t("card.title")}
        sub={t(`state.${state.state}`)}
        action={<PillLink href="/logistics/verification" size="sm">{t("card.open")}</PillLink>}
      />
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Pill tone={state.tier === "none" ? "muted" : "success"} dot>{t(`tier.${state.tier === "tier1" || state.tier === "tier2" ? state.tier : "none"}`)}</Pill>
        {state.badges.map((badge) => <Pill key={badge} tone="info">{t.dynamic(`badge.${badge}`, badge)}</Pill>)}
      </div>
      {state.statusReason && (state.state === "rejected" || state.state === "suspended") && (
        <p className="m-0 mt-3 text-[14.5px] font-bold text-app-danger">{t("state.reason", { reason: state.statusReason })}</p>
      )}

      {verified && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[16px] bg-app-canvas p-4">
            <h3 className="m-0 text-[14px] font-extrabold">{t("card.limits")}</h3>
            {limits.limited ? (
              <ul className="m-0 mt-2 grid list-none gap-1 p-0 text-[14px]">
                <li>{t("card.maxOrder", { amount: naira(limits.rules.maxOrderValue) })}</li>
                <li>{t("card.maxActive", { count: limits.rules.maxActiveOrders })}</li>
              </ul>
            ) : (
              <p className="m-0 mt-2 text-[14px]">{t("card.noLimits")}{limits.liftedAt && state.tier === "tier1" ? ` · ${t("card.liftedNote")}` : ""}</p>
            )}
          </div>
          {limits.limited && (
            <div className="rounded-[16px] bg-app-canvas p-4">
              <h3 className="m-0 text-[14px] font-extrabold">{t("card.graduation")}</h3>
              <ul className="m-0 mt-2 grid list-none gap-1 p-0 text-[14px]">
                <li className={progress.deliveries.met ? "text-app-success" : ""}>{t("card.deliveries", { have: progress.deliveries.have, need: progress.deliveries.need })}</li>
                <li className={progress.rating.met ? "text-app-success" : ""}>
                  {progress.rating.have > 0 ? t("card.rating", { have: progress.rating.have.toFixed(1), need: progress.rating.need.toFixed(1) }) : t("card.noRating", { need: progress.rating.need.toFixed(1) })}
                </li>
                <li className={progress.disputeRate.met ? "text-app-success" : ""}>{t("card.disputes", { have: progress.disputeRate.have, max: progress.disputeRate.max })}</li>
              </ul>
            </div>
          )}
        </div>
      )}

      {attention.length > 0 && (
        <ul className="m-0 mt-4 grid list-none gap-0 p-0">
          {attention.map((item) => (
            <li key={item} className="flex flex-wrap items-center gap-2 border-t border-app-line py-2.5 first:border-t-0">
              <span className="min-w-0 flex-1 text-[14.5px]">
                {t(`item.${item}`)}
                {state.tier1[item] === "rejected" && reasons[item] ? <span className="block text-[13.5px] text-app-danger">{reasons[item]}</span> : null}
              </span>
              <Pill tone={TONE[state.tier1[item]]}>{t(`status.${state.tier1[item]}`)}</Pill>
              <PillLink href={`/logistics/verification?step=${ITEM_SCREEN[item]}`} size="sm">{t("rev.fix")}</PillLink>
            </li>
          ))}
        </ul>
      )}

      {state.tier === "tier1" && (
        <div className="mt-4">
          <PillLink href="/logistics/verification?step=cac" tone="ink" size="sm">{t("card.upgrade")}</PillLink>
        </div>
      )}
    </Card>
  );
}
