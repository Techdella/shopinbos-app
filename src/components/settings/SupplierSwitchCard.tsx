import { Card, CardHead } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { CHECKBOX, FIELD_HELP, SUBMIT_INK } from "@/components/seller-settings/fields";
import { saveSupplierSwitchSettings } from "@/app/home/settings/supplier-switch-actions";
import type { SwitchSettings } from "@shared/order-parts";

// Settings › Store: what happens when a supplier doesn't accept a customer's order in time (build spec 7.2).
export function SupplierSwitchCard({ settings }: { settings: SwitchSettings }) {
  const number = "h-10 w-16 rounded-[10px] border border-app-line bg-white px-2 text-center text-[14.5px] font-bold";
  return (
    <form action={saveSupplierSwitchSettings} id="supplier-switch" className="scroll-mt-24">
      <Card className="p-5">
        <CardHead title="When a supplier doesn't accept in time" sub="For your dropship products." />
        <label className="mt-3 flex min-h-[56px] cursor-pointer items-center gap-3 py-2">
          <input type="checkbox" name="auto" defaultChecked={settings.auto} className={CHECKBOX} />
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-bold">Send it to another supplier for me</span>
            <span className="block text-[13px] text-app-ink-soft">We pick a checked supplier with the same product, size and colour, and tell you. You can undo it until they accept.</span>
          </span>
        </label>
        <fieldset className="m-0 mt-2 grid gap-2 border-0 p-0">
          <legend className="mb-1 p-0 text-[14px] font-bold">Only if it costs me</legend>
          <label className="flex min-h-[48px] cursor-pointer flex-wrap items-center gap-2 text-[14px]">
            <input type="radio" name="rule" value="cost" defaultChecked={settings.rule === "cost"} />
            at most <input name="maxIncreasePct" type="number" min={0} max={100} defaultValue={settings.maxIncreasePct} className={number} aria-label="Percent more than my cost" />% more than now
          </label>
          <label className="flex min-h-[48px] cursor-pointer flex-wrap items-center gap-2 text-[14px]">
            <input type="radio" name="rule" value="margin" defaultChecked={settings.rule === "margin"} />
            little enough that I keep at least <input name="minMarginPct" type="number" min={0} max={90} defaultValue={settings.minMarginPct} className={number} aria-label="Percent of my price I keep" />% of my price
          </label>
        </fieldset>
        <p className={`${FIELD_HELP} mt-2`}>We never send it to a supplier who already missed it, and never more than twice for one order.</p>
        <button type="submit" className={`${SUBMIT_INK} mt-4`}><Icon name="check" size={16} /> Save</button>
      </Card>
    </form>
  );
}
