"use client";

import { useState, type ReactNode } from "react";
import { FieldLabel, PillButton, TextInput, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatMoney } from "@shared/i18n";
import { deliveryScopeOptions, westAfricaCountries, type DeliveryScope } from "@/lib/data/west-africa";

// The coverage editor: states picked from the same list as onboarding (src/components/onboarding/LogisticsOnboarding),
// never typed, so sellers and suppliers searching by state or city always find the partner. The form posts the zones
// as JSON (coverageJson) with the vehicles and delivery types; updateLogisticsCoverage saves them.

export interface EditorZone {
  name: string;
  country: string;
  region: string;
  scope: DeliveryScope;
  service: string;
  basePrice: number;
  active: boolean;
  demandSignal?: string;
}

const VEHICLES = ["bike", "car", "van", "truck"];
const DELIVERY_TYPES = ["same_day", "express", "next_day", "bulk"];
const LAUNCH_AREAS = [{ region: "Lagos", label: "Lagos" }, { region: "Oyo", label: "Oyo (Ibadan)" }, { region: "Osun", label: "Osun" }];
const selectClass = "h-[54px] w-full rounded-[16px] border border-app-line bg-white px-4 text-[16px] text-app-ink outline-none transition focus:border-app-ink";

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        "inline-flex min-h-[40px] items-center rounded-full border px-4 text-[14px] font-bold capitalize transition",
        on ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong",
      )}
    >
      {children}
    </button>
  );
}

const scopeLabel = (scope: DeliveryScope) => deliveryScopeOptions.find((option) => option.value === scope)?.label ?? scope;

export function CoverageEditor({ zones: initialZones, vehicleTypes: initialVehicles, deliveryTypes: initialTypes, defaultCountry, defaultPrice }: {
  zones: EditorZone[];
  vehicleTypes: string[];
  deliveryTypes: string[];
  defaultCountry: string;
  defaultPrice: number;
}) {
  const t = useT("logistics", "onboarding", "common");
  const locale = useLocale();
  const naira = (value: number) => formatMoney(Math.round(value), locale);
  const [zones, setZones] = useState<EditorZone[]>(initialZones);
  const [vehicles, setVehicles] = useState<string[]>(initialVehicles);
  const [types, setTypes] = useState<string[]>(initialTypes);
  const [country, setCountry] = useState(westAfricaCountries.some((c) => c.name === defaultCountry) ? defaultCountry : "Nigeria");
  const [region, setRegion] = useState("");
  const [scope, setScope] = useState<DeliveryScope>("intrastate");
  const [price, setPrice] = useState(defaultPrice > 0 ? defaultPrice : 900);

  const regions = westAfricaCountries.find((entry) => entry.name === country)?.regions ?? [];
  const scopeText = (value: DeliveryScope) => t.dynamic(`scope.${value}.label`, scopeLabel(value));
  const toggle = (value: string, list: string[], set: (next: string[]) => void) => set(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

  function addZone() {
    if (!region || price <= 0) return;
    const name = `${region} (${scopeLabel(scope)})`;
    if (zones.some((zone) => zone.name === name)) return;
    setZones((current) => [...current, { name, country, region, scope, service: "Same-day", basePrice: price, active: true }]);
    setRegion("");
  }

  return (
    <div className="grid gap-4">
      <input type="hidden" name="coverageJson" value={JSON.stringify(zones)} />
      <input type="hidden" name="vehicleTypes" value={vehicles.join(",")} />
      <input type="hidden" name="deliveryTypes" value={types.join(",")} />

      <div className="grid gap-3">
        <div className="text-[15px] font-bold">{t("coverage.areas")}</div>
        {zones.length === 0 ? (
          <p className="m-0 text-[14px] text-app-ink-soft">{t("coverage.emptyBody")}</p>
        ) : (
          <div className="rounded-[18px] border border-app-line bg-white px-4 py-1">
            {zones.map((zone) => (
              <div key={zone.name} className="flex items-center gap-3 border-t border-app-line py-2.5 first:border-t-0">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={zone.active}
                  aria-label={zone.active ? t("lp.pauseZone", { region: zone.region }) : t("lp.turnOnZone", { region: zone.region })}
                  onClick={() => setZones((current) => current.map((entry) => (entry.name === zone.name ? { ...entry, active: !entry.active } : entry)))}
                  className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-full border-2", zone.active ? "border-app-ink bg-app-ink text-white" : "border-app-line-strong bg-white")}
                >
                  {zone.active && <Icon name="check" size={12} />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-bold">{zone.region}</div>
                  <div className="text-[13px] text-app-ink-soft">{t("lp.zoneLine", { country: zone.country, scope: scopeText(zone.scope), price: naira(zone.basePrice) })}</div>
                </div>
                <button type="button" aria-label={t("lp.removeZone", { region: zone.region })} onClick={() => setZones((current) => current.filter((entry) => entry.name !== zone.name))} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-app-ink-soft hover:bg-app-canvas hover:text-app-danger">
                  <Icon name="x" size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-3 rounded-[18px] border border-app-line bg-app-canvas p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <div className="min-w-0">
            <FieldLabel htmlFor="cov-country">{t("country")}</FieldLabel>
            <select id="cov-country" className={selectClass} value={country} onChange={(e) => { setCountry(e.target.value); setRegion(""); }}>
              {westAfricaCountries.map((entry) => <option key={entry.code} value={entry.name}>{entry.name}</option>)}
            </select>
          </div>
          <div className="min-w-0">
            <FieldLabel htmlFor="cov-region">{t("lp.region")}</FieldLabel>
            <select id="cov-region" className={selectClass} value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="">{t("chooseOne")}</option>
              {regions.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
            </select>
          </div>
        </div>
        {country === "Nigeria" && (
          <div>
            <p className="m-0 mb-2 text-[13px] text-app-ink-soft">{t("lp.launchAreas")}</p>
            <div className="flex flex-wrap gap-2">
              {LAUNCH_AREAS.map((area) => <Chip key={area.region} on={region === area.region} onClick={() => setRegion(area.region)}>{area.label}</Chip>)}
            </div>
          </div>
        )}
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-2 text-[14px] font-bold">{t("lp.scope")}</legend>
          <div className="flex flex-wrap gap-2">
            {deliveryScopeOptions.map((option) => <Chip key={option.value} on={scope === option.value} onClick={() => setScope(option.value)}>{scopeText(option.value)}</Chip>)}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[160px] flex-1">
            <FieldLabel htmlFor="cov-price">{t("lp.startPrice")}</FieldLabel>
            <TextInput id="cov-price" type="number" inputMode="numeric" min={0} step={100} value={price} onChange={(e) => setPrice(Number(e.target.value))} />
          </div>
          <PillButton tone="white" size="md" onClick={addZone} disabled={!region || price <= 0}>
            <Icon name="plus" size={15} /> {t("lp.addZone")}
          </PillButton>
        </div>
      </div>

      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-2 text-[15px] font-bold">{t("lp.vehicles")}</legend>
        <div className="flex flex-wrap gap-2">
          {[...new Set([...VEHICLES, ...vehicles])].map((value) => <Chip key={value} on={vehicles.includes(value)} onClick={() => toggle(value, vehicles, setVehicles)}>{t.dynamic(`vehicle.${value}`, value)}</Chip>)}
        </div>
      </fieldset>
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-2 text-[15px] font-bold">{t("lp.deliveryTypes")}</legend>
        <div className="flex flex-wrap gap-2">
          {[...new Set([...DELIVERY_TYPES, ...types])].map((value) => <Chip key={value} on={types.includes(value)} onClick={() => toggle(value, types, setTypes)}>{t.dynamic(`dtype.${value}`, value.replace(/_/g, " "))}</Chip>)}
        </div>
      </fieldset>
    </div>
  );
}
