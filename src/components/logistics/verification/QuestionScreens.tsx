"use client";

import { useState } from "react";
import { cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { field } from "@/components/seller-core";
import { NG_STATES, parseArea } from "@shared/delivery-market";
import { lgasOf } from "@shared/ng-lgas";
import { parseCacNumber } from "@/lib/kyb/cac";
import { Choice, DocUpload, QuestionFrame, jsonInit, kycCall, useAction, useKycT, type KycState } from "./kit";

// Screens 1–7 of the partner sign-up, one question each: business name, CAC, state, areas, what they deliver with,
// other states, how they charge. Each saves through /api/logistics/kyc/answers (CAC also looks the number up) and
// moves on with onDone.

export type ScreenProps = { state: KycState; onState: (state: KycState) => void; onDone: () => void };

const answer = (screen: string, body: Record<string, unknown>) => kycCall("/answers", jsonInit("PATCH", { screen, ...body }));

export function NameScreen({ state, onState, onDone, accountName }: ScreenProps & { accountName: string }) {
  const t = useKycT();
  const { busy, error, run } = useAction(onState);
  const [name, setName] = useState(state.flow.answers.name ? state.business.companyName ?? "" : "");
  const save = (companyName: string) => void run("name", () => answer("name", { companyName }), onDone);
  return (
    <QuestionFrame title={t("q.name.title")} sub={t("q.name.sub")} error={error} busy={busy === "name"} canContinue={name.trim().length >= 2} onContinue={() => save(name)}>
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        autoFocus
        autoComplete="organization"
        placeholder={t("q.name.placeholder")}
        aria-label={t("q.name.title")}
        className={cx(field.input, "min-h-[56px] text-[18px]")}
      />
      {accountName.trim().length >= 2 && (
        <button type="button" disabled={busy === "name"} onClick={() => save(accountName)} className="justify-self-start text-[16px] font-bold underline underline-offset-4">
          {t("q.name.useMine", { name: accountName })}
        </button>
      )}
    </QuestionFrame>
  );
}

type CacLookup = { outcome: string; message: string; registeredName?: string };

/** Screen 2. "Yes" asks for the number, looks it up and asks "Is this your company?"; every answer continues. */
export function CacScreen({ state, onState, onDone, reload }: ScreenProps & { reload: () => void }) {
  const t = useKycT();
  const { busy, error, setError, run } = useAction(onState);
  const [registered, setRegistered] = useState(state.flow.answers.cac === "yes" || Boolean(state.business.cacNumber));
  const [number, setNumber] = useState(state.business.cacNumber ?? "");
  const [kind, setKind] = useState<"RC" | "BN" | null>(state.business.cacType === "RC" || state.business.cacType === "BN" ? state.business.cacType : null);
  const [lookup, setLookup] = useState<CacLookup | null>(null);
  const [lookupFailed, setLookupFailed] = useState(false);
  const parsed = parseCacNumber(number);
  const implied = parsed?.impliedType === "COMPANY" ? "RC" : parsed?.impliedType === "BUSINESS_NAME" ? "BN" : null;
  const type = implied ?? kind;
  const companyName = state.business.companyName ?? state.displayName;
  const cacDoc = state.docs.find((doc) => doc.type === "cac");

  const choose = (cac: "no" | "registering") => void run(cac, () => answer("cac", { cac }), onDone);

  async function lookUp() {
    if (!parsed || !type) return;
    setError("");
    setLookup(null);
    setLookupFailed(false);
    await run("lookup", async () => {
      const response = await fetch("/api/logistics/verification/cac", jsonInit("POST", { businessName: companyName, number: `${type} ${parsed.number}`, companyType: type === "RC" ? "COMPANY" : "BUSINESS_NAME" })).catch(() => null);
      const body = (await response?.json().catch(() => null)) as { data?: CacLookup; error?: { message?: string } } | null;
      if (!response?.ok || !body?.data) {
        setLookupFailed(true);
        throw new Error(body?.error?.message || t("q.cac.failed"));
      }
      if (!body.data.registeredName) setLookupFailed(true);
      setLookup(body.data);
      return null;
    });
  }

  /** Keeps the number (the team or a certificate can confirm it later) and moves on. */
  const keep = (registeredName: string) =>
    void run("keep", async () => {
      await kycCall("/business", jsonInit("PATCH", { registeredName, cacType: type, cacNumber: `${type} ${parsed?.number ?? ""}` }));
      return answer("cac", { cac: "yes" });
    }, onDone);

  if (!registered) {
    return (
      <QuestionFrame title={t("q.cac.title")} sub={t("q.cac.sub")} error={error}>
        <div className="grid gap-3">
          <Choice label={t("q.cac.yes")} onPick={() => setRegistered(true)} />
          <Choice label={t("q.cac.no")} disabled={busy !== null} onPick={() => choose("no")} />
          <Choice label={t("q.cac.registering")} sub={t("q.cac.registeringSub")} disabled={busy !== null} onPick={() => choose("registering")} />
        </div>
      </QuestionFrame>
    );
  }

  if (lookup?.registeredName) {
    return (
      <QuestionFrame title={t("q.cac.confirm")} error={error}>
        <div className="rounded-[18px] border-2 border-app-ink bg-white p-5">
          <p className="m-0 text-[20px] font-extrabold">{lookup.registeredName}</p>
          <p className="m-0 mt-1 text-[15px] text-app-ink-soft">{type} {parsed?.number}</p>
        </div>
        <div className="grid gap-3">
          <Choice label={t("q.cac.itsMine")} selected disabled={busy !== null} onPick={() => keep(lookup.registeredName!)} />
          <Choice label={t("q.cac.notMine")} disabled={busy !== null} onPick={() => { setLookup(null); setNumber(""); }} />
        </div>
      </QuestionFrame>
    );
  }

  return (
    <QuestionFrame
      title={t("q.cac.number")}
      sub={t("q.cac.numberHint")}
      error={error}
      busy={busy === "lookup"}
      canContinue={Boolean(parsed && type)}
      continueLabel={t("q.cac.lookUp")}
      onContinue={() => void lookUp()}
    >
      <input
        value={number}
        onChange={(event) => { setNumber(event.target.value.toUpperCase()); setLookup(null); setLookupFailed(false); }}
        autoFocus
        placeholder="RC 1234567"
        aria-label={t("q.cac.number")}
        className={cx(field.input, "min-h-[56px] text-[18px] uppercase tracking-[0.06em]")}
      />
      {parsed && !implied && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Choice label={t("q.cac.typeRc")} selected={kind === "RC"} onPick={() => setKind("RC")} />
          <Choice label={t("q.cac.typeBn")} selected={kind === "BN"} onPick={() => setKind("BN")} />
        </div>
      )}
      {lookup && !lookup.registeredName && <p className="m-0 text-[15px]">{lookup.message}</p>}
      {lookupFailed && (
        <div className="grid gap-3 rounded-[18px] border border-app-line bg-white p-4">
          <p className="m-0 text-[15px] text-app-ink-soft">{t("q.cac.failed")}</p>
          <DocUpload type="cac" doc={cacDoc} hint={t("q.cac.certificate")} onDone={reload} />
          <button type="button" disabled={!parsed || !type || busy !== null} onClick={() => keep(companyName)} className="justify-self-start text-[16px] font-bold underline underline-offset-4 disabled:opacity-50">
            {t("q.cac.continueAnyway")}
          </button>
        </div>
      )}
      <button type="button" onClick={() => setRegistered(false)} className="justify-self-start text-[15px] font-bold text-app-ink-soft underline underline-offset-4">
        {t("q.cac.notRegistered")}
      </button>
    </QuestionFrame>
  );
}

export function StateScreen({ state, onState, onDone }: ScreenProps) {
  const t = useKycT();
  const { busy, error, run } = useAction(onState);
  const current = state.flow.answers.homeState ?? state.coverage.deliveryAreas[0]?.split(":")[0]?.trim() ?? "";
  const [picked, setPicked] = useState(current);
  return (
    <QuestionFrame title={t("q.state.title")} sub={t("q.state.sub")} error={error} busy={busy === "state"} canContinue={Boolean(picked)} onContinue={() => void run("state", () => answer("state", { state: picked }), onDone)}>
      <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3">
        {NG_STATES.map((name) => (
          <li key={name}>
            <button
              type="button"
              aria-pressed={picked === name}
              onClick={() => setPicked(name)}
              className={cx("min-h-[48px] w-full rounded-[14px] border-2 px-3 text-[15px] font-bold", picked === name ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white")}
            >
              {name}
            </button>
          </li>
        ))}
      </ul>
    </QuestionFrame>
  );
}

export function AreasScreen({ state, onState, onDone }: ScreenProps) {
  const t = useKycT();
  const { busy, error, run } = useAction(onState);
  const home = state.flow.answers.homeState ?? state.coverage.deliveryAreas[0]?.split(":")[0]?.trim() ?? "";
  // Areas in other states (added before, or from the portal) are kept as they are.
  const [areas, setAreas] = useState<string[]>(state.coverage.deliveryAreas);
  const lgas = lgasOf(home);
  const own = (area: string) => {
    const token = parseArea(area);
    return (token?.kind === "state" || token?.kind === "area") && token.state === home;
  };
  const wholeState = areas.some((area) => area === home);
  const toggle = (token: string) => setAreas((list) => (list.includes(token) ? list.filter((item) => item !== token) : [...list.filter((item) => item !== home), token]));
  const pickAll = () => setAreas((list) => (wholeState ? list.filter((item) => item !== home) : [...list.filter((item) => !own(item)), home]));
  const chip = (on: boolean) => cx("min-h-[44px] rounded-full border-2 px-4 text-[15px] font-bold", on ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white");

  return (
    <QuestionFrame title={t("q.areas.title")} sub={t("q.areas.sub", { state: home })} error={error} busy={busy === "areas"} canContinue={areas.length > 0} onContinue={() => void run("areas", () => answer("areas", { deliveryAreas: areas }), onDone)}>
      {home ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={wholeState} onClick={pickAll} className={chip(wholeState)}>{t("q.areas.all", { state: home })}</button>
          {lgas.map((lga) => {
            const token = `${home}: ${lga}`;
            const on = !wholeState && areas.includes(token);
            return <button key={lga} type="button" aria-pressed={on} disabled={wholeState} onClick={() => toggle(token)} className={cx(chip(on), wholeState && "opacity-40")}>{lga}</button>;
          })}
        </div>
      ) : (
        <p className="m-0 text-[15px] text-app-ink-soft">{t("q.areas.noState")}</p>
      )}
    </QuestionFrame>
  );
}

const VEHICLE_ICONS: Record<string, string> = { bike: "🏍️", car: "🚗", van: "🚐", truck: "🚚", tricycle: "🛺" };

export function VehiclesScreen({ state, onState, onDone }: ScreenProps) {
  const t = useKycT();
  const { busy, error, run } = useAction(onState);
  const [methods, setMethods] = useState<string[]>(state.coverage.deliveryMethods);
  const toggle = (method: string) => setMethods((list) => (list.includes(method) ? list.filter((item) => item !== method) : [...list, method]));
  return (
    <QuestionFrame title={t("q.vehicles.title")} sub={t("q.vehicles.sub")} error={error} busy={busy === "vehicles"} canContinue={methods.length > 0} onContinue={() => void run("vehicles", () => answer("vehicles", { deliveryMethods: methods }), onDone)}>
      <div className="grid grid-cols-2 gap-3">
        {Object.keys(VEHICLE_ICONS).map((method) => (
          <button
            key={method}
            type="button"
            aria-pressed={methods.includes(method)}
            onClick={() => toggle(method)}
            className={cx("grid min-h-[112px] place-items-center gap-1 rounded-[18px] border-2 p-3 text-center", methods.includes(method) ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white")}
          >
            <span aria-hidden className="text-[36px] leading-none">{VEHICLE_ICONS[method]}</span>
            <span className="text-[16px] font-extrabold">{t(`method.${method}` as "method.bike")}</span>
          </button>
        ))}
      </div>
    </QuestionFrame>
  );
}

export function InterstateScreen({ state, onState, onDone }: ScreenProps) {
  const t = useKycT();
  const { busy, error, run } = useAction(onState);
  const current = state.flow.answers.interstate;
  const pick = (interstate: boolean) => void run("interstate", () => answer("interstate", { interstate }), onDone);
  return (
    <QuestionFrame title={t("q.interstate.title")} sub={t("q.interstate.sub")} error={error}>
      <div className="grid gap-3">
        <Choice label={t("q.yes")} selected={current === true} disabled={busy !== null} onPick={() => pick(true)} />
        <Choice label={t("q.no")} selected={current === false} disabled={busy !== null} onPick={() => pick(false)} />
      </div>
    </QuestionFrame>
  );
}

export function ChargeScreen({ state, onState, onDone }: ScreenProps) {
  const t = useKycT();
  const { busy, error, run } = useAction(onState);
  const [charge, setCharge] = useState<"flat" | "quote" | null>(state.flow.answers.charge ?? null);
  const [amount, setAmount] = useState(state.pricing.basePrice > 0 ? String(state.pricing.basePrice) : "");
  const valid = charge === "quote" || (charge === "flat" && Number(amount) >= 100);
  return (
    <QuestionFrame
      title={t("q.charge.title")}
      sub={t("q.charge.sub")}
      error={error}
      busy={busy === "charge"}
      canContinue={valid}
      onContinue={() => void run("charge", () => answer("charge", charge === "flat" ? { charge, amount: Number(amount) } : { charge }), onDone)}
    >
      <div className="grid gap-3">
        <Choice label={t("q.charge.flat")} selected={charge === "flat"} onPick={() => setCharge("flat")} />
        {charge === "flat" && (
          <label className="grid gap-1.5">
            <span className={field.label}>{t("q.charge.amount")}</span>
            <input value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, "").slice(0, 7))} inputMode="numeric" autoFocus placeholder="2500" className={cx(field.input, "min-h-[56px] text-[18px]")} />
          </label>
        )}
        <Choice label={t("q.charge.quote")} selected={charge === "quote"} onPick={() => setCharge("quote")} />
      </div>
      {/* Pay on delivery waits for the Cash trusted level (shared/dropship-rules.ts POD_LOCKED_MESSAGE). */}
      <p className="m-0 flex gap-2 rounded-[16px] bg-app-canvas p-4 text-[14px] leading-[1.5] text-app-ink-soft">
        <Icon name="lock" size={16} className="mt-0.5 shrink-0" /> {t("q.charge.podLater")}
      </p>
    </QuestionFrame>
  );
}
