import { Card, CardHead } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { CHECKBOX, FIELD_HELP, SUBMIT_INK } from "@/components/seller-settings/fields";
import { saveSupplierSwitchSettings } from "@/app/home/settings/supplier-switch-actions";
import type { SwitchSettings } from "@shared/order-parts";
import { getT } from "@/lib/i18n/server";

// Settings › Store: what happens when a supplier doesn't accept a customer's order in time (build spec 7.2).
export async function SupplierSwitchCard({ settings }: { settings: SwitchSettings }) {
  const t = await getT("account", "common");
  const number = "h-10 w-16 rounded-[10px] border border-app-line bg-white px-2 text-center text-[14.5px] font-bold";
  return (
    <form action={saveSupplierSwitchSettings} id="supplier-switch" className="scroll-mt-24">
      <Card className="p-5">
        <CardHead title={t("switch.title")} sub={t("switch.sub")} />
        <label className="mt-3 flex min-h-[56px] cursor-pointer items-center gap-3 py-2">
          <input type="checkbox" name="auto" defaultChecked={settings.auto} className={CHECKBOX} />
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-bold">{t("switch.auto")}</span>
            <span className="block text-[13px] text-app-ink-soft">{t("switch.autoSub")}</span>
          </span>
        </label>
        <fieldset className="m-0 mt-2 grid gap-2 border-0 p-0">
          <legend className="mb-1 p-0 text-[14px] font-bold">{t("switch.onlyIf")}</legend>
          <label className="flex min-h-[48px] cursor-pointer flex-wrap items-center gap-2 text-[14px]">
            <input type="radio" name="rule" value="cost" defaultChecked={settings.rule === "cost"} />
            {t("switch.atMost")} <input name="maxIncreasePct" type="number" min={0} max={100} defaultValue={settings.maxIncreasePct} className={number} aria-label={t("switch.morePct")} />{t("switch.moreThanNow")}
          </label>
          <label className="flex min-h-[48px] cursor-pointer flex-wrap items-center gap-2 text-[14px]">
            <input type="radio" name="rule" value="margin" defaultChecked={settings.rule === "margin"} />
            {t("switch.littleEnough")} <input name="minMarginPct" type="number" min={0} max={90} defaultValue={settings.minMarginPct} className={number} aria-label={t("switch.keepPct")} />{t("switch.ofPrice")}
          </label>
        </fieldset>
        <p className={`${FIELD_HELP} mt-2`}>{t("switch.never")}</p>
        <button type="submit" className={`${SUBMIT_INK} mt-4`}><Icon name="check" size={16} /> {t("save")}</button>
      </Card>
    </form>
  );
}
