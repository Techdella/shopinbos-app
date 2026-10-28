import { Card } from "@/components/app-kit";
import { cx } from "@/components/app-ui/cx";
import { Icon, type IconName } from "@/components/ui/Icon";
import { SUPPLIER_LEVELS, SUPPLIER_LEVEL_LABELS, type LevelGoal, type SupplierLevel } from "@shared/dropship-rules";
import { Meter } from "./dropship-ui";

// "Your level" for suppliers (the P-Tier board): a dark card with the New → Trusted → Established ladder, the goals
// left to the next level with orange meters, what the next level unlocks on a sun-coloured card, and what they have
// now. Used by /supplier/level (the view comes from src/lib/supplier-levels.server.ts supplierLevelView).

/** What reaching each level unlocks (the "Established unlocks" card). */
export const UNLOCKS: Record<string, string[]> = {
  trusted: ["No limit on open orders", "Offer sellers packing slips and stickers", "Paid 2 days after delivery, not 3", "“Trusted” badge"],
  established: ["Pre-orders, with up to 30% advance for materials", "Paid 1 day after delivery, not 2", "Apply to be featured to sellers", "“Established” badge"],
};

/** What each level has now. */
export const HAVE: Record<string, string[]> = {
  new: ["Dropship and wholesale", "Up to 20 open orders at once", "Paid 3 days after delivery"],
  trusted: ["Dropship and wholesale", "No limit on open orders", "Packing slips and stickers for sellers", "Paid 2 days after delivery", "“Trusted” badge"],
  established: ["Dropship, wholesale and pre-orders", "No limit on open orders", "Packing slips and stickers for sellers", "Paid 1 day after delivery", "Apply to be featured to sellers", "“Established” badge"],
};

const lineIcon = (line: string): IconName =>
  /pre-order/i.test(line) ? "calendar" : /paid/i.test(line) ? "card" : /featured/i.test(line) ? "star" : /badge/i.test(line) ? "shield" : /slip|sticker/i.test(line) ? "tag" : "box";

export function goalValue(goal: LevelGoal) {
  if (goal.kind === "count") return `${goal.have.toLocaleString("en-NG")} / ${goal.need.toLocaleString("en-NG")}`;
  if (goal.key === "disputes") return `${goal.have}%`;
  if (goal.key === "rating") return goal.have > 0 ? goal.have.toFixed(1) : "No ratings yet";
  return goal.done ? "Done" : "Not yet";
}

export interface SupplierLevelViewProps {
  level: SupplierLevel;
  next: SupplierLevel | null;
  goals: LevelGoal[];
}

export function SupplierLevelView({ view }: { view: SupplierLevelViewProps }) {
  const at = SUPPLIER_LEVELS.indexOf(view.level);
  const nextLabel = view.next ? SUPPLIER_LEVEL_LABELS[view.next] : null;
  return (
    <div className="grid gap-3 lg:grid-cols-2 lg:gap-4">
      <section aria-labelledby="level-now" className="grid gap-3 rounded-[24px] bg-app-ink p-[18px] text-white sm:p-6 lg:col-span-2">
        <ol className="m-0 flex list-none gap-1.5 p-0" aria-label={`Supplier levels: ${SUPPLIER_LEVEL_LABELS[view.level]}, level ${at + 1} of ${SUPPLIER_LEVELS.length}`}>
          {SUPPLIER_LEVELS.map((level, index) => (
            <li key={level} aria-current={index === at ? "step" : undefined} className={cx("flex flex-1 flex-col gap-1.5 text-[11px] font-extrabold tracking-[0.04em]", index < at ? "text-app-sun" : index === at ? "text-white" : "text-[#8A8697]")}>
              <i aria-hidden className={cx("block h-1.5 rounded-full", index < at ? "bg-app-sun" : index === at ? "bg-white" : "bg-[#3A3646]")} />
              {SUPPLIER_LEVEL_LABELS[level].toUpperCase()}
            </li>
          ))}
        </ol>
        <h2 id="level-now" className="m-0 font-app-display text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] sm:text-[32px]">You&apos;re {SUPPLIER_LEVEL_LABELS[view.level]}</h2>
        <p className="m-0 max-w-[560px] text-[14px] leading-[1.45] text-[#D9D6E2] sm:text-[15px]">
          {view.next === "established" ? "Keep delivering well to reach Established and unlock pre-orders." : view.next === "trusted" ? "Deliver well to reach Trusted: no open-order limit and branding for sellers." : "You've reached the top level. Keep your record clean to stay here."}
        </p>
      </section>

      {view.goals.length > 0 && nextLabel && (
        <section aria-label={`Goals for ${nextLabel}`} className="self-start rounded-[22px] bg-white px-4 py-1.5 sm:px-5">
          <ul className="m-0 list-none p-0">
            {view.goals.map((goal) => (
              <li key={goal.key} className="grid gap-1.5 border-b border-app-line-soft py-[11px] last:border-b-0">
                <div className="flex items-center justify-between gap-3 text-[14px] font-bold">
                  <span>{goal.label}</span>
                  {goal.kind === "count" ? (
                    <b className="font-extrabold tabular-nums">{goalValue(goal)}</b>
                  ) : (
                    <span className={cx("inline-flex items-center gap-1 font-extrabold", goal.done ? "text-app-success" : "text-app-accent-ink")}>
                      {goal.done && <Icon name="check" size={14} strokeWidth={3} />}
                      {goalValue(goal)}
                      <span className="sr-only">{goal.done ? " (done)" : " (not yet)"}</span>
                    </span>
                  )}
                </div>
                {goal.kind === "count" && <Meter have={goal.have} need={goal.need} label={`${goal.label}: ${goalValue(goal)}`} tone={goal.done ? "success" : "accent"} />}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid content-start gap-3 lg:gap-4">
        {view.next && (
          <section aria-labelledby="level-unlocks" className="grid gap-1.5 rounded-[20px] bg-app-sun-tint px-4 py-3 sm:px-5 sm:py-4">
            <h2 id="level-unlocks" className="m-0 font-app-display text-[15px] font-extrabold">{nextLabel} unlocks</h2>
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {UNLOCKS[view.next].map((line) => (
                <li key={line} className="flex items-center gap-2 text-[13px]"><Icon name={lineIcon(line)} size={16} className="shrink-0" />{line}</li>
              ))}
            </ul>
          </section>
        )}

        <Card className="border-0 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="m-0 font-app-display text-[15px] font-extrabold">What you have now</h2>
            <span className="rounded-full bg-app-success-tint px-2 py-1 text-[10.5px] font-extrabold uppercase tracking-[0.05em] text-app-success">{SUPPLIER_LEVEL_LABELS[view.level]}</span>
          </div>
          <ul className="m-0 mt-2 grid list-none gap-1.5 p-0">
            {HAVE[view.level].map((line) => (
              <li key={line} className="flex items-center gap-2 text-[13px]"><Icon name="check" size={15} strokeWidth={2.6} className="shrink-0 text-app-success" />{line}</li>
            ))}
          </ul>
          <p className="mb-0 mt-3 text-[12.5px] leading-[1.5] text-app-ink-soft">Missing two pre-order ready dates drops an Established supplier back to Trusted. CAC is optional at every level, and adds the Registered Business badge.</p>
        </Card>
      </div>
    </div>
  );
}
