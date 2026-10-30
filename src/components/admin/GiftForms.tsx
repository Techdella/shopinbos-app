import { ListCard, ListRow } from "@/components/app-kit";
import { PendingButton } from "@/components/admin/PendingButton";
import { Field, buttonClass, fieldClass, formatDate } from "@/components/admin/AdminKit";
import { endGiftAction, giveCreditsAction, givePlanAction } from "@/app/admin/pricing/gifts/actions";
import { GIFT_LIMITS, giftPlanChoices } from "@shared/admin-gifts";
import type { giftPerson } from "@/lib/admin/gifts.server";

// The gift forms for one person (free AI credits, a free plan, ending a team gift early), on Admin › Pricing › Gifts
// and free plans and on Admin › Accounts. `back` is the page the actions return to.

type Person = NonNullable<Awaited<ReturnType<typeof giftPerson>>>;

const SOURCE_LABEL: Record<string, string> = {
  admin: "Team gift",
  join_offer: "Join offer",
  referral: "Referral reward",
  referral_welcome: "Referral welcome",
  milestone: "Milestone reward",
};

export function GiftForms({ person, back, now }: { person: Person; back: string; now: Date }) {
  return (
    <>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <form action={giveCreditsAction} className="grid content-start gap-3 rounded-[18px] border border-app-line p-4">
          <h3 className="m-0 text-[16px] font-extrabold">Give AI credits</h3>
          <p className="m-0 text-[13px] text-app-ink-soft">Added to what they have. They last 12 months, like bought credits.</p>
          <input type="hidden" name="userId" value={person.id} />
          <input type="hidden" name="back" value={back} />
          <Field label="Credits" htmlFor="gift-credits">
            <input id="gift-credits" name="credits" type="number" inputMode="numeric" min={1} max={GIFT_LIMITS.maxCredits} step={1} required defaultValue={100} className={fieldClass} />
          </Field>
          <Field label="Why (for the log)" htmlFor="gift-credits-note">
            <input id="gift-credits-note" name="note" required minLength={3} maxLength={GIFT_LIMITS.noteMax} placeholder="e.g. early member, sorry for the outage" className={fieldClass} />
          </Field>
          <PendingButton pending="Giving…" className={buttonClass("ink")}>
            Give credits
          </PendingButton>
        </form>

        <form action={givePlanAction} className="grid content-start gap-3 rounded-[18px] border border-app-line p-4">
          <h3 className="m-0 text-[16px] font-extrabold">Give a plan for free</h3>
          <p className="m-0 text-[13px] text-app-ink-soft">Starts now and opens everything the plan includes, with its monthly credits. They go back to their own plan when it ends.</p>
          <input type="hidden" name="userId" value={person.id} />
          <input type="hidden" name="back" value={back} />
          <Field label="Plan" htmlFor="gift-tier">
            <select id="gift-tier" name="tier" required className={fieldClass} disabled={person.paysByCard}>
              {giftPlanChoices(person.role).map((choice) => (
                <option key={choice.tier} value={choice.tier}>
                  {choice.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="For how long" htmlFor="gift-months">
            <select id="gift-months" name="months" defaultValue="1" className={fieldClass} disabled={person.paysByCard}>
              {Array.from({ length: GIFT_LIMITS.maxMonths }, (_, i) => i + 1).map((months) => (
                <option key={months} value={months}>
                  {months} month{months === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Why (for the log)" htmlFor="gift-plan-note">
            <input
              id="gift-plan-note"
              name="note"
              required
              minLength={3}
              maxLength={GIFT_LIMITS.noteMax}
              placeholder="e.g. pilot shop, launch partner"
              className={fieldClass}
              disabled={person.paysByCard}
            />
          </Field>
          {person.paysByCard ? (
            <p className="m-0 text-[13px] font-bold text-app-ink-soft">They pay for their plan by card, so Paystack decides their plan. Give credits instead.</p>
          ) : (
            <PendingButton pending="Giving…" className={buttonClass("ink")}>
              Give plan
            </PendingButton>
          )}
        </form>
      </div>

      <h3 className="mb-2 mt-6 text-[16px] font-extrabold">Free plan time</h3>
      {person.grants.length ? (
        <ListCard>
          {person.grants.map((grant) => (
            <ListRow key={grant.id}>
              <div className="min-w-0 flex-1 basis-[220px]">
                <div className="text-[14.5px] font-extrabold">{grant.plan}</div>
                <div className="text-[13px] text-app-ink-soft">
                  {SOURCE_LABEL[grant.source] ?? grant.source} · {grant.startsAt > now ? `starts ${formatDate(grant.startsAt)}, ` : ""}
                  ends {formatDate(grant.endsAt)}
                </div>
              </div>
              {grant.source === "admin" ? (
                <form action={endGiftAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="userId" value={person.id} />
                  <input type="hidden" name="back" value={back} />
                  <input type="hidden" name="grantId" value={grant.id} />
                  <label className="sr-only" htmlFor={`end-${grant.id}`}>
                    Why end it
                  </label>
                  <input id={`end-${grant.id}`} name="note" required minLength={3} maxLength={GIFT_LIMITS.noteMax} placeholder="Why end it" className={`${fieldClass} w-[180px]`} />
                  <PendingButton pending="Ending…" className={buttonClass("white", "sm")}>
                    End now
                  </PendingButton>
                </form>
              ) : null}
            </ListRow>
          ))}
        </ListCard>
      ) : (
        <p className="m-0 text-[14px] text-app-ink-soft">None running.</p>
      )}
    </>
  );
}
