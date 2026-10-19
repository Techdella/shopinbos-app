import type { Metadata } from "next";
import { AppPage, Card, CardHead, EmptyState, ListCard, ListRow, Pill } from "@/components/app-kit";
import { Field, adminFrame, buttonClass, fieldClass, formatDate } from "@/components/admin/AdminKit";
import { savePricing } from "@/app/actions/pricing";
import { requireRole } from "@/lib/server-auth";
import { getPriceBook, priceHistory, savedPriceKeys } from "@/lib/pricing/price-book.server";
import { PRICE_GROUPS, PRICE_KEYS, PRICE_SETTINGS, defaultPrice, formatPriceValue, type PriceGroup, type PriceKey, type PriceSetting } from "@shared/platform-pricing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pricing" };

// Every price and fee Shopinbos charges (shared/platform-pricing.ts). Saving takes effect within 30 seconds on
// every server; payments already started keep the price they started with.

const UNIT_SUFFIX = { naira: "₦", percent: "%", credits: "credits", usd: "$", naira_per_usd: "₦ per $1" } as const;

function PriceInput({ priceKey, value }: { priceKey: PriceKey; value: number | string }) {
  const setting: PriceSetting = PRICE_SETTINGS[priceKey];
  if (setting.kind === "choice") {
    return (
      <select id={priceKey} name={priceKey} defaultValue={String(value)} className={fieldClass}>
        {setting.choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
      </select>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <input
        id={priceKey}
        name={priceKey}
        type="number"
        inputMode="decimal"
        min={setting.min}
        max={setting.max}
        step={setting.integer ? 1 : "any"}
        defaultValue={String(value)}
        required
        className={fieldClass}
      />
      <span className="shrink-0 font-mono text-[12px] text-app-ink-soft">{UNIT_SUFFIX[setting.unit]}</span>
    </div>
  );
}

export default async function AdminPricingPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await requireRole(["admin"], "/admin/login");
  const [query, book, saved, history] = await Promise.all([searchParams, getPriceBook(), savedPriceKeys(), priceHistory(40)]);
  const savedSet = new Set(saved);
  const groups = Object.keys(PRICE_GROUPS) as PriceGroup[];

  return (
    <AppPage
      frame={adminFrame(user)}
      title="Pricing"
      sub="Every fee and price Shopinbos charges. Changes apply within 30 seconds; payments already started keep their price."
    >
      {query.error ? (
        <div role="alert" className="mb-5 rounded-[22px] border border-app-danger bg-white p-4 text-[14px] text-app-danger">{query.error}</div>
      ) : query.saved ? (
        <div role="status" className="mb-5 rounded-[22px] border border-app-line bg-white p-4 text-[14px]">
          {query.saved === "0" ? "Nothing changed." : `Saved ${query.saved} change${query.saved === "1" ? "" : "s"}.`}
        </div>
      ) : null}

      <div className="grid gap-5">
        {groups.map((group) => {
          const keys = PRICE_KEYS.filter((key) => PRICE_SETTINGS[key].group === group);
          return (
            <div key={group} id={group} className="scroll-mt-24">
            <Card className="p-5">
              <CardHead title={PRICE_GROUPS[group].title} sub={PRICE_GROUPS[group].sub} />
              <form action={savePricing} className="mt-4 grid gap-4">
                <input type="hidden" name="group" value={group} />
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {keys.map((key) => {
                    const setting: PriceSetting = PRICE_SETTINGS[key];
                    const fallback = defaultPrice(key, process.env);
                    const hint = [
                      setting.hint,
                      savedSet.has(key) ? `Default ${formatPriceValue(key, fallback)}` : "Using the default",
                    ].filter(Boolean).join(" · ");
                    return (
                      <Field key={key} label={setting.label} htmlFor={key} hint={hint}>
                        <PriceInput priceKey={key} value={book[key]} />
                      </Field>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="Note (optional)" htmlFor={`${group}-note`} className="min-w-[220px] flex-1">
                    <input id={`${group}-note`} name="note" maxLength={500} placeholder="Why it changed, e.g. new exchange rate" className={fieldClass} />
                  </Field>
                  <button type="submit" className={buttonClass("ink")}>Save {PRICE_GROUPS[group].title.toLowerCase()}</button>
                </div>
              </form>
            </Card>
            </div>
          );
        })}
      </div>

      <h2 className="mb-3 mt-8 text-[17px] font-extrabold">Change history</h2>
      {history.length ? (
        <ListCard>
          {history.map((row) => {
            const key = row.key;
            const show = (value: unknown) => (value === null || value === undefined ? "default" : formatPriceValue(key, value as number | string));
            return (
              <ListRow key={row.id}>
                <div className="min-w-0 flex-1 basis-[240px]">
                  <div className="text-[14.5px] font-extrabold">
                    {PRICE_GROUPS[PRICE_SETTINGS[key].group].title}: {PRICE_SETTINGS[key].label}
                  </div>
                  <div className="text-[13px] text-app-ink-soft">
                    {formatDate(row.createdAt)} · {row.changedBy?.name || row.changedBy?.email || "Unknown admin"}
                    {row.note ? ` · “${row.note}”` : ""}
                  </div>
                </div>
                <Pill tone="muted">{show(row.before)}</Pill>
                <span aria-hidden className="text-app-ink-soft">→</span>
                <Pill tone="success">{show(row.after)}</Pill>
              </ListRow>
            );
          })}
        </ListCard>
      ) : (
        <EmptyState icon="clock" title="No changes yet">Every saved change shows here with who made it and why.</EmptyState>
      )}
    </AppPage>
  );
}
