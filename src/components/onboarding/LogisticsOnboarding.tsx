"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FieldLabel, Mascot, Notice, PillButton, ProgressBars, TextInput, Wordmark, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import intentRouting from "@/lib/intent-routing";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatMoney } from "@shared/i18n";
import { NG_STATES, SUGGESTED_PRICES, canonicalState, reachAreas, reachOf, type DeliverReach } from "@shared/delivery-market";
import { friendlyError } from "@/lib/errors/report-client";

// Delivery partner set-up on the web: the same two questions as the phone (apps/mobile/src/app/logistics/setup.tsx),
// in the same order, so a partner can start on one and finish on the other.
//   1 of 2  Your business: its name and the state they work from (saved at once, completed: false).
//   2 of 2  How you deliver: what they ride or drive, and where they deliver (only their state, some other states, or
//           all of Nigeria). Finishing puts them on the marketplace with a starter rate card at typical prices
//           (shared/delivery-market.ts suggestedRateRows) in the same call, then opens verification.
// Name and phone come from sign-up. Prices, the bank, riders, pickup points and CAC wait on the dashboard; the partner
// terms are accepted at verification's Review step. Each step is saved, so coming back opens the step they left.

const STEPS = 2;
const VEHICLES = ["bike", "car", "van", "tricycle", "truck", "other"] as const;
const stateLabel = (state: string) => (state === "FCT" ? "Abuja (FCT)" : state);

interface InitialUser {
  name: string | null;
  city: string | null;
  country: string | null;
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        "inline-flex min-h-[44px] items-center rounded-full border px-4 text-[15px] font-bold transition",
        on ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong",
      )}
    >
      {children}
    </button>
  );
}

const selectClass = "h-[54px] w-full rounded-[16px] border border-app-line bg-white px-4 text-[16px] text-app-ink outline-none transition focus:border-app-ink";
const cardClass = "grid gap-5 rounded-[22px] border border-app-line bg-white p-5 sm:p-6";

export function LogisticsOnboarding({ initialUser }: { initialUser?: InitialUser | null }) {
  const t = useT("onboarding", "common");
  const tk = useT("partnerKyc");
  const locale = useLocale();
  const naira = (value: number) => formatMoney(Math.round(value), locale);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { extractIntentParams, getContinuationPath } = intentRouting;

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState(initialUser?.name ?? "");
  const [home, setHome] = useState("");
  const [vehicles, setVehicles] = useState<string[]>([]);
  const [reach, setReach] = useState<DeliverReach>("home");
  const [states, setStates] = useState<string[]>([]);
  // Where "Finish" goes: verified partners to the dashboard, everyone else on to the verification steps.
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    fetch("/api/logistics/onboarding")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const data = json?.data ?? json;
        if (!data) return;
        setName(data.displayName || data.companyName || "");
        if (data.verificationStatus === "verified") setVerified(true);
        // Sign-up fills in Lagos and a bike for everyone: only a saved set-up step counts as an answer.
        if (data.onboardingState?.source !== "logistics-onboarding") return;
        const saved = canonicalState(data.coverageZones?.[0] ?? "") ?? canonicalState(data.city ?? "");
        if (!saved) return;
        setHome(saved);
        setVehicles((data.vehicleTypes ?? []).filter((type: string) => (VEHICLES as readonly string[]).includes(type)));
        if (Array.isArray(data.deliveryAreas) && data.deliveryAreas.length) {
          const was = reachOf(saved, data.deliveryAreas);
          setReach(was.reach);
          setStates(was.states);
        }
        if (!data.onboardingState?.completed) setStep(2);
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  async function patch(body: Record<string, unknown>) {
    const response = await fetch("/api/logistics/onboarding", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (!response?.ok) {
      const json = await response?.json().catch(() => null);
      throw new Error(json?.error?.message ?? t("saveFailed"));
    }
  }

  async function saveBusiness() {
    setError("");
    if (name.trim().length < 2) return setError(t("lps.needName"));
    if (!home) return setError(t("lps.needHome"));
    setSaving(true);
    try {
      await patch({ displayName: name.trim(), city: home, country: "Nigeria", coverageZones: [home], completed: false });
      setStep(2);
      window.scrollTo({ top: 0 });
    } catch (cause) {
      setError(cause instanceof Error ? friendlyError(cause) : String(cause));
    } finally {
      setSaving(false);
    }
  }

  async function finish() {
    setError("");
    if (!vehicles.length) return setError(t("lps.needVehicle"));
    if (reach === "states" && !states.length) return setError(t("lps.needStates", { state: stateLabel(home) }));
    setSaving(true);
    try {
      await patch({
        displayName: name.trim(),
        city: home,
        country: "Nigeria",
        coverageZones: [home],
        vehicleTypes: vehicles,
        deliveryTypes: ["next_day"],
        pickupAreas: [home],
        deliveryAreas: reachAreas(home, reach, states),
        services: reach === "home" ? ["doorstep"] : ["doorstep", "interstate"],
        starterRates: true,
        completed: true,
      });
      const destination = getContinuationPath({ role: "logistics_partner", ...extractIntentParams(searchParams) });
      // Set-up done: a partner who isn't verified yet goes straight on to the verification steps.
      router.push(destination || (verified ? "/logistics/dashboard" : "/logistics/verification"));
    } catch (cause) {
      setError(cause instanceof Error ? friendlyError(cause) : String(cause));
      setSaving(false);
    }
  }

  const toggle = (value: string, list: string[], set: (next: string[]) => void) => set(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  const where = stateLabel(home);
  const reaches: { value: DeliverReach; title: string; sub: string }[] = [
    { value: "home", title: t("lps.reach.home", { state: where }), sub: t("lps.reach.homeSub") },
    { value: "states", title: t("lps.reach.states", { state: where }), sub: t("lps.reach.statesSub") },
    { value: "nationwide", title: t("lps.reach.nationwide"), sub: t("lps.reach.nationwideSub") },
  ];

  return (
    <div className="min-h-dvh w-full bg-app-canvas font-app text-app-ink">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-4 bg-app-canvas/90 px-4 py-3 backdrop-blur sm:px-6 xl:px-8">
        <Wordmark />
        <div className="order-3 w-full sm:order-none sm:w-auto sm:flex-1"><ProgressBars total={STEPS} current={step - 1} /></div>
        <span className="ml-auto text-[13px] font-bold text-app-ink-soft sm:ml-0">{t("stepOf", { step, total: STEPS })}</span>
      </header>

      <main className="w-full px-4 pb-10 pt-4 sm:px-6 xl:px-8">
        {error && <Notice tone="error">{error}</Notice>}

        <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="min-w-0">
            {loading ? (
              <p className="m-0 py-16 text-center text-[15px] text-app-ink-soft">{t("lp.loading")}</p>
            ) : step === 1 ? (
              <>
                <h1 className="m-0 text-[30px] font-extrabold leading-[1.1] tracking-[-0.8px] sm:text-[34px]">{t("lps.bizTitle")}</h1>
                <p className="mb-0 mt-2 max-w-[640px] text-[15px] leading-[1.5] text-app-ink-soft">{t("lps.bizSub")}</p>
                <div className={cx(cardClass, "mt-6")}>
                  <div>
                    <FieldLabel htmlFor="lp-name">{t("lps.name")}</FieldLabel>
                    <TextInput id="lp-name" value={name} onChange={(e) => setName(e.target.value)} />
                    <p className="mb-0 mt-2 text-[13px] text-app-ink-soft">{t("lps.nameHint")}</p>
                  </div>
                  <div>
                    <FieldLabel htmlFor="lp-home">{t("lps.home")}</FieldLabel>
                    <select id="lp-home" className={selectClass} value={home} onChange={(e) => setHome(e.target.value)}>
                      <option value="">{t("lps.homePick")}</option>
                      {[...NG_STATES].sort((a, b) => stateLabel(a).localeCompare(stateLabel(b))).map((state) => <option key={state} value={state}>{stateLabel(state)}</option>)}
                    </select>
                  </div>
                </div>
                <div className="mt-6 flex justify-end">
                  <PillButton tone="ink" size="md" onClick={() => void saveBusiness()} busy={saving}>
                    {t("continue")} <Icon name="arrow" size={15} />
                  </PillButton>
                </div>
              </>
            ) : (
              <>
                <h1 className="m-0 text-[30px] font-extrabold leading-[1.1] tracking-[-0.8px] sm:text-[34px]">{t("lps.deliverTitle")}</h1>
                <div className={cx(cardClass, "mt-6")}>
                  <fieldset className="m-0 border-0 p-0">
                    <legend className="mb-2 text-[14px] font-bold">{t("lps.vehicles")}</legend>
                    <div className="flex flex-wrap gap-2">
                      {VEHICLES.map((vehicle) => <Chip key={vehicle} on={vehicles.includes(vehicle)} onClick={() => toggle(vehicle, vehicles, setVehicles)}>{tk.dynamic(`method.${vehicle}`, vehicle)}</Chip>)}
                    </div>
                  </fieldset>
                  <fieldset className="m-0 grid gap-2 border-0 p-0">
                    <legend className="mb-2 text-[14px] font-bold">{t("lps.reach")}</legend>
                    {reaches.map((option) => (
                      <label key={option.value} className={cx("flex min-h-[56px] cursor-pointer items-center gap-3 rounded-[16px] border px-4 py-3", reach === option.value ? "border-app-ink" : "border-app-line")}>
                        <input type="radio" name="reach" checked={reach === option.value} onChange={() => setReach(option.value)} className="h-[18px] w-[18px] accent-[#16141F]" />
                        <span className="grid">
                          <span className="text-[15px] font-bold">{option.title}</span>
                          <span className="text-[13px] text-app-ink-soft">{option.sub}</span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  {reach === "states" && (
                    <fieldset className="m-0 border-0 p-0">
                      <legend className="mb-2 text-[14px] font-bold">{t("lps.pickStates")}</legend>
                      <div className="flex flex-wrap gap-2">
                        {NG_STATES.filter((state) => state !== home).map((state) => <Chip key={state} on={states.includes(state)} onClick={() => toggle(state, states, setStates)}>{stateLabel(state)}</Chip>)}
                      </div>
                    </fieldset>
                  )}
                  <p className="m-0 rounded-[16px] bg-app-mint px-4 py-3 text-[14.5px] leading-[1.5]">
                    {t("lps.prices", { near: naira(SUGGESTED_PRICES.doorstep), far: naira(SUGGESTED_PRICES.otherStates), state: where })}
                  </p>
                </div>
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                  <PillButton tone="ghost" size="md" onClick={() => setStep(1)} disabled={saving}>
                    <Icon name="arrowLeft" size={15} /> {t("back")}
                  </PillButton>
                  <PillButton tone="accent" size="md" onClick={() => void finish()} busy={saving}>
                    {t("lps.finish")} <Icon name="arrow" size={15} />
                  </PillButton>
                </div>
              </>
            )}
          </section>

          <aside className="grid content-start gap-4 xl:mt-[92px]">
            <div className="rounded-[22px] border border-app-line bg-white p-5">
              <h2 className="m-0 text-[17px] font-extrabold">{t("whatNext")}</h2>
              <ol className="m-0 mt-3 grid list-none gap-3 p-0 text-[14px] leading-[1.5]">
                {[t("lp.next1"), t("lp.next2"), t("lp.next3")].map((line, index) => (
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
