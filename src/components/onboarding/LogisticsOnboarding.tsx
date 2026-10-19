"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FieldLabel, Mascot, Notice, PillButton, ProgressBars, TextInput, Wordmark, cx } from "@/components/app-ui";
import { CacInstantCheck } from "@/components/verification/CacInstantCheck";
import type { VerificationDoc } from "@shared/verification-docs";
import { Icon } from "@/components/ui/Icon";
import intentRouting from "@/lib/intent-routing";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatMoney } from "@shared/i18n";
import { deliveryScopeOptions, westAfricaCountries, type DeliveryScope } from "@/lib/data/west-africa";

// Delivery partner setup in the 2026 app look (same shell as SupplierOnboarding). Everything stays in this
// component's state across steps; the server only gets a save once the profile is complete enough for its schema
// (at least one active zone, vehicle and delivery type), so Continue never fails on a half-filled profile.

interface CoverageZone {
  name: string;
  country: string;
  region: string;
  scope: DeliveryScope;
  service: string;
  basePrice: number;
  active: boolean;
  demandSignal?: string;
  polygon?: Array<[number, number]>;
}

interface InitialUser {
  name: string | null;
  city: string | null;
  country: string | null;
}

const STEPS = ["Company", "Coverage", "Fleet", "Pricing", "Verify", "Review"];
const VERIFY_STEP = 5;
const VEHICLES = ["bike", "van", "truck"];
const DELIVERY_TYPES = ["same_day", "express", "next_day", "bulk"];
const SPEEDS = ["Same-day in active zones", "45-90 minutes in active zones", "Next-day within city", "2-3 business days"];

const selectClass = "h-[54px] w-full rounded-[16px] border border-app-line bg-white px-4 text-[16px] text-app-ink outline-none transition focus:border-app-ink disabled:opacity-55";
const textareaClass = "w-full rounded-[16px] border border-app-line bg-white px-4 py-3 text-[16px] text-app-ink outline-none transition placeholder:text-app-ink-faint focus:border-app-ink";
const cardClass = "grid gap-5 rounded-[22px] border border-app-line bg-white p-5 sm:p-6";

function Chip({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
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

export function LogisticsOnboarding({ initialUser }: { initialUser?: InitialUser | null }) {
  const t = useT("onboarding", "common");
  const locale = useLocale();
  const naira = (value: number) => formatMoney(Math.round(value), locale);
  const scopeText = (scope: DeliveryScope) => t.dynamic(`scope.${scope}.label`, scopeLabel(scope));
  const vehicleText = (vehicle: string) => t.dynamic(`vehicle.${vehicle}`, vehicle);
  const typeText = (type: string) => t.dynamic(`dtype.${type}`, type.replace("_", " "));
  const router = useRouter();
  const searchParams = useSearchParams();
  const { extractIntentParams, getContinuationPath } = intentRouting;

  const [step, setStep] = useState(1);
  const [cacDoc, setCacDoc] = useState<VerificationDoc | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [companyName, setCompanyName] = useState(initialUser?.name ?? "");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState(initialUser?.city ?? "Lagos");
  const [country, setCountry] = useState(initialUser?.country ?? "Nigeria");
  const [zones, setZones] = useState<CoverageZone[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<string[]>([]);
  const [deliveryTypes, setDeliveryTypes] = useState<string[]>([]);
  const [basePrice, setBasePrice] = useState(900);
  const [estimatedSpeed, setEstimatedSpeed] = useState("");
  const [newZoneCountry, setNewZoneCountry] = useState("Nigeria");
  const [newZoneRegion, setNewZoneRegion] = useState("");
  const [newZoneScope, setNewZoneScope] = useState<DeliveryScope>("intrastate");
  const [newZonePrice, setNewZonePrice] = useState(900);

  useEffect(() => {
    fetch("/api/logistics/onboarding")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const data = json?.data ?? json;
        if (!data) return;
        setCompanyName(data.displayName || data.companyName || "");
        setDescription(data.description || "");
        setCity(data.city || "Lagos");
        setCountry(data.country || "Nigeria");
        const mapZones = data.coverageMap?.zones;
        if (Array.isArray(mapZones) && mapZones.length > 0) {
          setZones(mapZones);
        } else if (Array.isArray(data.coverageZones)) {
          // Older profiles only kept zone names; the name doubles as the region so the zone still validates.
          const price = data.basePrice || 900;
          setZones(data.coverageZones.map((name: string) => ({ name, country: data.country || "Nigeria", region: name, scope: "intrastate" as DeliveryScope, service: "Same-day", basePrice: price, active: true })));
        }
        if (Array.isArray(data.vehicleTypes) && data.vehicleTypes.length > 0) setVehicleTypes(data.vehicleTypes);
        if (Array.isArray(data.deliveryTypes) && data.deliveryTypes.length > 0) setDeliveryTypes(data.deliveryTypes);
        if (data.basePrice) setBasePrice(data.basePrice);
        if (data.estimatedSpeed) setEstimatedSpeed(data.estimatedSpeed);
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  const activeZones = zones.filter((zone) => zone.active);
  const savable = activeZones.length > 0 && vehicleTypes.length > 0 && deliveryTypes.length > 0;

  async function persist(completed: boolean) {
    const lowest = activeZones.reduce((min, zone) => Math.min(min, zone.basePrice), basePrice);
    const response = await fetch("/api/logistics/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: companyName.trim().length >= 2 ? companyName.trim() : undefined,
        country: country.trim().length >= 2 ? country.trim() : undefined,
        city: city.trim().length >= 2 ? city.trim() : undefined,
        description,
        coverageZones: activeZones.map((zone) => zone.name),
        coverageMap: { zones, depot: `${city || "Lagos"} depot`, updatedBy: "onboarding" },
        vehicleTypes,
        deliveryTypes,
        pricingModel: "fixed",
        basePrice: completed ? lowest : basePrice,
        estimatedSpeed: estimatedSpeed || (deliveryTypes.includes("express") ? SPEEDS[1] : SPEEDS[0]),
        completed,
      }),
    }).catch(() => null);
    if (!response?.ok) {
      const body = await response?.json().catch(() => null);
      throw new Error(body?.error?.message ?? t("saveFailed"));
    }
  }

  async function goTo(next: number) {
    setError("");
    // Save along the way once the profile is complete enough; before that, answers wait in this page.
    if (savable && next > step) {
      setSaving(true);
      try {
        await persist(false);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        return;
      } finally {
        setSaving(false);
      }
    }
    setStep(next);
    window.scrollTo({ top: 0 });
  }

  async function submit() {
    setError("");
    if (!savable) {
      setError(t("lp.needAll"));
      return;
    }
    setSaving(true);
    try {
      await persist(true);
      const destination = getContinuationPath({ role: "logistics_partner", ...extractIntentParams(searchParams) });
      router.push(destination || "/logistics/dashboard");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setSaving(false);
    }
  }

  function addZone() {
    if (!newZoneCountry || !newZoneRegion || newZonePrice <= 0) return;
    if (zones.some((zone) => zone.region === newZoneRegion && zone.country === newZoneCountry && zone.scope === newZoneScope)) return;
    setZones((current) => [...current, {
      name: `${newZoneRegion} (${scopeLabel(newZoneScope)})`,
      country: newZoneCountry,
      region: newZoneRegion,
      scope: newZoneScope,
      service: "Same-day",
      basePrice: newZonePrice,
      active: true,
    }]);
    setNewZoneRegion("");
  }

  function toggle(value: string, list: string[], setList: (next: string[]) => void) {
    setList(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }

  const canContinue = [
    companyName.trim().length >= 2,
    activeZones.length > 0,
    vehicleTypes.length > 0 && deliveryTypes.length > 0,
    basePrice > 0,
    true,
    true,
  ][step - 1];

  const regions = westAfricaCountries.find((entry) => entry.name === newZoneCountry)?.regions ?? [];

  return (
    <div className="min-h-dvh w-full bg-app-canvas font-app text-app-ink">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-4 bg-app-canvas/90 px-4 py-3 backdrop-blur sm:px-6 xl:px-8">
        <Wordmark />
        <div className="order-3 w-full sm:order-none sm:w-auto sm:flex-1"><ProgressBars total={STEPS.length} current={step - 1} /></div>
        <span className="ml-auto text-[13px] font-bold text-app-ink-soft sm:ml-0">{t("stepOf", { step, total: STEPS.length })}</span>
      </header>

      <main className="w-full px-4 pb-10 pt-4 sm:px-6 xl:px-8">
        <div className="grid gap-3">
          {error && <Notice tone="error">{error}</Notice>}
        </div>

        <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="min-w-0">
            {loading ? (
              <p className="m-0 py-16 text-center text-[15px] text-app-ink-soft">{t("lp.loading")}</p>
            ) : (
              <>
                {step === 1 && (
                  <>
                    <h1 className="m-0 text-[30px] font-extrabold leading-[1.1] tracking-[-0.8px] sm:text-[34px]">{t("lp.companyTitle")}</h1>
                    <p className="mb-0 mt-2 max-w-[640px] text-[15px] leading-[1.5] text-app-ink-soft">{t("lp.companySub")}</p>
                    <div className={cx(cardClass, "mt-6")}>
                      <div>
                        <FieldLabel htmlFor="lp-name">{t("lp.companyName")}</FieldLabel>
                        <TextInput id="lp-name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder={t("lp.companyNamePlaceholder")} />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <FieldLabel htmlFor="lp-city">{t("city")}</FieldLabel>
                          <TextInput id="lp-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder={t("lp.cityPlaceholder")} />
                        </div>
                        <div>
                          <FieldLabel htmlFor="lp-country">{t("country")}</FieldLabel>
                          <select id="lp-country" className={selectClass} value={country} onChange={(e) => setCountry(e.target.value)}>
                            {westAfricaCountries.map((entry) => <option key={entry.code} value={entry.name}>{entry.name}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <FieldLabel htmlFor="lp-about">{t("lp.about")}</FieldLabel>
                        <textarea id="lp-about" className={textareaClass} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("lp.aboutPlaceholder")} />
                      </div>
                    </div>
                  </>
                )}

                {step === 2 && (
                  <>
                    <h1 className="m-0 text-[30px] font-extrabold leading-[1.1] tracking-[-0.8px] sm:text-[34px]">{t("lp.zonesTitle")}</h1>
                    <p className="mb-0 mt-2 max-w-[640px] text-[15px] leading-[1.5] text-app-ink-soft">{t("lp.zonesSub")}</p>
                    <div className={cx(cardClass, "mt-6")}>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <FieldLabel htmlFor="lp-zone-country">{t("country")}</FieldLabel>
                          <select id="lp-zone-country" className={selectClass} value={newZoneCountry} onChange={(e) => { setNewZoneCountry(e.target.value); setNewZoneRegion(""); }}>
                            {westAfricaCountries.map((entry) => <option key={entry.code} value={entry.name}>{entry.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <FieldLabel htmlFor="lp-zone-region">{t("lp.region")}</FieldLabel>
                          <select id="lp-zone-region" className={selectClass} value={newZoneRegion} onChange={(e) => setNewZoneRegion(e.target.value)} disabled={!newZoneCountry}>
                            <option value="">{t("chooseOne")}</option>
                            {regions.map((region) => <option key={region} value={region}>{region}</option>)}
                          </select>
                        </div>
                      </div>
                      <fieldset className="m-0 border-0 p-0">
                        <legend className="mb-2 text-[14px] font-bold">{t("lp.scope")}</legend>
                        <div className="flex flex-wrap gap-2">
                          {deliveryScopeOptions.map((option) => (
                            <Chip key={option.value} on={newZoneScope === option.value} onClick={() => setNewZoneScope(option.value)} title={t.dynamic(`scope.${option.value}.description`, option.description)}>{scopeText(option.value)}</Chip>
                          ))}
                        </div>
                        <p className="mb-0 mt-2 text-[13px] text-app-ink-soft">{t.dynamic(`scope.${newZoneScope}.description`, deliveryScopeOptions.find((option) => option.value === newZoneScope)?.description ?? "")}</p>
                      </fieldset>
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="min-w-[180px] flex-1">
                          <FieldLabel htmlFor="lp-zone-price">{t("lp.startPrice")}</FieldLabel>
                          <TextInput id="lp-zone-price" type="number" inputMode="numeric" min={0} step={100} value={newZonePrice} onChange={(e) => setNewZonePrice(Number(e.target.value))} />
                        </div>
                        <PillButton tone="ink" size="md" onClick={addZone} disabled={!newZoneRegion || newZonePrice <= 0}>
                          <Icon name="plus" size={15} /> {t("lp.addZone")}
                        </PillButton>
                      </div>
                    </div>

                    {zones.length > 0 && (
                      <div className="mt-4 rounded-[22px] border border-app-line bg-white px-5 py-2">
                        {zones.map((zone) => (
                          <div key={zone.name} className="flex items-center gap-3 border-t border-app-line py-3 first:border-t-0">
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
                    <p className="mb-0 mt-3 text-[13px] text-app-ink-soft">{t("lp.zonesOn", { active: activeZones.length, total: zones.length })}</p>
                  </>
                )}

                {step === 3 && (
                  <>
                    <h1 className="m-0 text-[30px] font-extrabold leading-[1.1] tracking-[-0.8px] sm:text-[34px]">{t("lp.fleetTitle")}</h1>
                    <p className="mb-0 mt-2 max-w-[640px] text-[15px] leading-[1.5] text-app-ink-soft">{t("lp.fleetSub")}</p>
                    <div className={cx(cardClass, "mt-6")}>
                      <fieldset className="m-0 border-0 p-0">
                        <legend className="mb-2 text-[14px] font-bold">{t("lp.vehicles")}</legend>
                        <div className="flex flex-wrap gap-2">
                          {VEHICLES.map((vehicle) => <Chip key={vehicle} on={vehicleTypes.includes(vehicle)} onClick={() => toggle(vehicle, vehicleTypes, setVehicleTypes)}>{vehicleText(vehicle)}</Chip>)}
                        </div>
                      </fieldset>
                      <fieldset className="m-0 border-0 p-0">
                        <legend className="mb-2 text-[14px] font-bold">{t("lp.deliveryTypes")}</legend>
                        <div className="flex flex-wrap gap-2">
                          {DELIVERY_TYPES.map((type) => <Chip key={type} on={deliveryTypes.includes(type)} onClick={() => toggle(type, deliveryTypes, setDeliveryTypes)}>{typeText(type)}</Chip>)}
                        </div>
                      </fieldset>
                    </div>
                  </>
                )}

                {step === 4 && (
                  <>
                    <h1 className="m-0 text-[30px] font-extrabold leading-[1.1] tracking-[-0.8px] sm:text-[34px]">{t("lp.pricingTitle")}</h1>
                    <p className="mb-0 mt-2 max-w-[640px] text-[15px] leading-[1.5] text-app-ink-soft">{t("lp.pricingSub")}</p>
                    <div className={cx(cardClass, "mt-6")}>
                      <div>
                        <FieldLabel htmlFor="lp-base">{t("lp.basePrice")}</FieldLabel>
                        <TextInput id="lp-base" type="number" inputMode="numeric" min={0} step={100} value={basePrice} onChange={(e) => setBasePrice(Number(e.target.value))} />
                      </div>
                      <div>
                        <FieldLabel htmlFor="lp-speed">{t("lp.speed")}</FieldLabel>
                        <TextInput id="lp-speed" value={estimatedSpeed} onChange={(e) => setEstimatedSpeed(e.target.value)} placeholder={t("lp.speedPlaceholder")} />
                        <div className="mt-2 flex flex-wrap gap-2">
                          {SPEEDS.map((speed) => <Chip key={speed} on={estimatedSpeed === speed} onClick={() => setEstimatedSpeed(speed)}>{speed}</Chip>)}
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {step === VERIFY_STEP && (
                  <>
                    <h1 className="m-0 text-[30px] font-extrabold leading-[1.1] tracking-[-0.8px] sm:text-[34px]">Verify your business</h1>
                    <p className="mb-0 mt-2 max-w-[640px] text-[15px] leading-[1.5] text-app-ink-soft">
                      Shops only see verified delivery partners, and jobs only come once you&apos;re verified. Check your CAC or business name (BN) registration. You can skip for now and finish later from Verification.
                    </p>
                    <div className="mt-6 grid gap-4">
                      <CacInstantCheck apiPath="/api/logistics/verification/cac" defaultName={companyName} cacDoc={cacDoc} onVerified={setCacDoc} />
                    </div>
                    <button type="button" onClick={() => void goTo(step + 1)} className="mt-4 text-[14px] font-bold text-app-ink-soft underline-offset-4 hover:text-app-ink hover:underline" disabled={saving}>
                      Skip for now. I&apos;ll verify before taking jobs.
                    </button>
                  </>
                )}

                {step === 6 && (
                  <>
                    <h1 className="m-0 text-[30px] font-extrabold leading-[1.1] tracking-[-0.8px] sm:text-[34px]">{t("lp.reviewTitle")}</h1>
                    <p className="mb-0 mt-2 max-w-[640px] text-[15px] leading-[1.5] text-app-ink-soft">{t("lp.reviewSub")}</p>
                    <div className="mt-6 divide-y divide-app-line rounded-[22px] border border-app-line bg-white px-5">
                      {[
                        [t("lp.r.company"), companyName || t("notSet")],
                        [t("lp.r.location"), [city, country].filter(Boolean).join(", ")],
                        [t("lp.r.zones"), activeZones.length ? activeZones.map((zone) => `${zone.region} (${naira(zone.basePrice)})`).join(", ") : t("noneYet")],
                        [t("lp.vehicles"), vehicleTypes.map(vehicleText).join(", ") || t("noneYet")],
                        [t("lp.deliveryTypes"), deliveryTypes.map(typeText).join(", ") || t("noneYet")],
                        [t("lp.r.basePrice"), naira(basePrice)],
                        [t("lp.r.speed"), estimatedSpeed || t("notSet")],
                      ].map(([label, value]) => (
                        <div key={label} className="flex items-baseline justify-between gap-4 py-3 text-[14.5px]">
                          <span className="shrink-0 text-app-ink-soft">{label}</span>
                          <span className="min-w-0 text-right font-bold">{value}</span>
                        </div>
                      ))}
                    </div>
                    {description && <p className="mb-0 mt-4 rounded-[18px] bg-white px-5 py-4 text-[14.5px] leading-[1.55] text-app-ink-soft">{description}</p>}
                  </>
                )}

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                  {step > 1 ? (
                    <PillButton tone="ghost" size="md" onClick={() => void goTo(step - 1)} disabled={saving}>
                      <Icon name="arrowLeft" size={15} /> {t("back")}
                    </PillButton>
                  ) : <span />}
                  {step < STEPS.length ? (
                    <PillButton tone="ink" size="md" onClick={() => void goTo(step + 1)} busy={saving} disabled={!canContinue}>
                      {t("continue")} <Icon name="arrow" size={15} />
                    </PillButton>
                  ) : (
                    <PillButton tone="accent" size="md" onClick={() => void submit()} busy={saving}>
                      {t("lp.submit")} <Icon name="arrow" size={15} />
                    </PillButton>
                  )}
                </div>
              </>
            )}
          </section>

          <aside className="grid content-start gap-4 xl:mt-[92px]">
            <div className="rounded-[22px] border border-app-line bg-white p-5">
              <h2 className="m-0 text-[17px] font-extrabold">{t("whatNext")}</h2>
              <ol className="m-0 mt-3 grid list-none gap-3 p-0 text-[14px] leading-[1.5]">
                {[
                  t("lp.next1"),
                  t("lp.next2"),
                  t("lp.next3"),
                ].map((line, index) => (
                  <li key={line} className="flex gap-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-app-ink text-[12px] font-extrabold text-white">{index + 1}</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="flex items-start gap-3 rounded-[22px] bg-app-mint p-5">
              <Mascot name="peggy" className="h-12 w-12 shrink-0" alt="Peggy" />
              <p className="m-0 text-[14.5px] leading-[1.55]">{t("lp.peggyNote")}</p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
