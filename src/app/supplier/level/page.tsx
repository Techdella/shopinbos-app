import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { AppPage, Card, CardHead, Pill } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { supplierLevelView } from "@/lib/supplier-levels.server";
import { SUPPLIER_LEVELS, SUPPLIER_LEVEL_LABELS, type LevelGoal } from "@shared/dropship-rules";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your level" };

// "Your level" (Supplier & Dropship Rules): New → Trusted → Established, worked out fresh from the delivery record
// (src/lib/supplier-levels.server.ts). The goals left to the next level, and what it unlocks. The phone app uses
// GET /api/supplier/level.

/** What reaching each level unlocks (the "Established unlocks" card). */
const UNLOCKS: Record<string, string[]> = {
  trusted: ["No limit on open orders", "Offer sellers packing slips and stickers", "Paid 2 days after delivery, not 3", "\u201cTrusted\u201d badge"],
  established: ["Pre-orders, with up to 30% advance for materials", "Paid 1 day after delivery, not 2", "Apply to be featured to sellers", "\u201cEstablished\u201d badge"],
};

/** What each level has now. */
const HAVE: Record<string, string[]> = {
  new: ["Dropship and wholesale", "Up to 20 open orders at once", "Paid 3 days after delivery"],
  trusted: ["Dropship and wholesale", "No limit on open orders", "Packing slips and stickers for sellers", "Paid 2 days after delivery", "\u201cTrusted\u201d badge"],
  established: ["Dropship, wholesale and pre-orders", "No limit on open orders", "Packing slips and stickers for sellers", "Paid 1 day after delivery", "Apply to be featured to sellers", "\u201cEstablished\u201d badge"],
};

function goalValue(goal: LevelGoal) {
  if (goal.kind === "count") return `${goal.have.toLocaleString("en-NG")} / ${goal.need.toLocaleString("en-NG")}`;
  if (goal.key === "disputes") return `${goal.have}%`;
  if (goal.key === "rating") return goal.have > 0 ? goal.have.toFixed(1) : "No ratings yet";
  return goal.done ? "Done" : "Not yet";
}

export default async function SupplierLevelPage() {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);
  const view = await supplierLevelView(supplier.id);
  if (!view) notFound();
  const at = SUPPLIER_LEVELS.indexOf(view.level);
  const nextLabel = view.next ? SUPPLIER_LEVEL_LABELS[view.next] : null;

  return (
    <AppPage frame={supplierFrame(user, supplier)} title="Your level" sub="Levels go up by themselves as you deliver well">
      <div className="mx-auto grid max-w-[720px] gap-4">
        <Card className="grid gap-5 p-5 sm:p-6">
          <ol className="m-0 grid list-none grid-cols-3 gap-2 p-0" aria-label="Supplier levels">
            {SUPPLIER_LEVELS.map((level, index) => (
              <li key={level} aria-current={index === at ? "step" : undefined} className={`rounded-[14px] px-3 py-2.5 text-center text-[12px] font-extrabold tracking-[0.12em] ${index === at ? "bg-app-ink text-white" : index < at ? "bg-app-success-tint text-app-success" : "bg-app-canvas text-app-ink-soft"}`}>
                {SUPPLIER_LEVEL_LABELS[level].toUpperCase()}
              </li>
            ))}
          </ol>
          <div>
            <h2 className="m-0 text-[26px] font-extrabold tracking-[-0.5px]">You&apos;re {SUPPLIER_LEVEL_LABELS[view.level]}</h2>
            <p className="mb-0 mt-1 text-[14.5px] text-app-ink-soft">
              {view.next === "established" ? "Keep delivering well to reach Established and unlock pre-orders." : view.next === "trusted" ? "Deliver well to reach Trusted: no open-order limit and branding for sellers." : "You've reached the top level. Keep your record clean to stay here."}
            </p>
          </div>
          {view.goals.length > 0 && nextLabel && (
            <ul className="m-0 grid list-none gap-3 p-0" aria-label={`Goals for ${nextLabel}`}>
              {view.goals.map((goal) => (
                <li key={goal.key} className="grid gap-1.5">
                  <div className="flex items-center justify-between gap-3 text-[14px]">
                    <span className="flex items-center gap-2 font-bold">
                      {goal.done ? <Icon name="checkCircle" size={16} className="text-app-success" /> : <span className="h-4 w-4 rounded-full border-2 border-app-toggle-off" />}
                      {goal.label}
                    </span>
                    <span className="font-mono text-[13px] text-app-ink-soft">{goalValue(goal)}</span>
                  </div>
                  {goal.kind === "count" && (
                    <div className="h-2 overflow-hidden rounded-full bg-app-canvas" role="progressbar" aria-label={goal.label} aria-valuemin={0} aria-valuemax={goal.need} aria-valuenow={Math.min(goal.have, goal.need)}>
                      <div className={`h-full rounded-full ${goal.done ? "bg-app-success" : "bg-app-ink"}`} style={{ width: `${Math.min(100, Math.round((goal.have / Math.max(1, goal.need)) * 100))}%` }} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {view.next && (
          <Card className="p-5">
            <CardHead title={`${nextLabel} unlocks`} />
            <ul className="m-0 mt-3 grid list-none gap-2 p-0">
              {UNLOCKS[view.next].map((line) => (
                <li key={line} className="flex items-start gap-2.5 text-[14.5px]"><Icon name="lock" size={15} className="mt-0.5 shrink-0 text-app-ink-soft" />{line}</li>
              ))}
            </ul>
          </Card>
        )}

        <Card className="p-5">
          <CardHead title="What you have now" action={<Pill tone="success">{SUPPLIER_LEVEL_LABELS[view.level]}</Pill>} />
          <ul className="m-0 mt-3 grid list-none gap-2 p-0">
            {HAVE[view.level].map((line) => (
              <li key={line} className="flex items-start gap-2.5 text-[14.5px]"><Icon name="check" size={15} className="mt-0.5 shrink-0 text-app-success" />{line}</li>
            ))}
          </ul>
          <p className="mb-0 mt-4 text-[13px] leading-[1.55] text-app-ink-soft">Missing two pre-order ready dates drops an Established supplier back to Trusted. CAC is optional at every level, and adds the Registered Business badge.</p>
        </Card>
      </div>
    </AppPage>
  );
}
