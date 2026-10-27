"use client";

import { useEffect, useState } from "react";
import { PillButton, cx } from "@/components/app-ui";
import { Pill } from "@/components/app-kit";
import { field } from "@/components/seller-core";
import { NG_STATES, formatArea, parseArea } from "@shared/delivery-market";
import { lgasOf } from "@shared/ng-lgas";
import { DELIVERY_METHODS, type DeliveryMethod, type ItemState } from "@shared/partner-tiers";
import { docFileUrl } from "@/components/verification/upload-client";
import { Field, FilePick, Row, StatusPill, StepCard, StepError, jsonInit, kycCall, useAction, useKycT, type KycState } from "./kit";

// Vehicles (type, plate, photo, licence; the team checks each), Coverage (where and how) and the Guarantor.

type StepProps = { state: KycState; onState: (state: KycState) => void };

async function sendVehicle(path: string, input: { type: string; plateNumber: string; photo: File | null; licence: File | null }) {
  const form = new FormData();
  form.append("type", input.type);
  form.append("plateNumber", input.plateNumber);
  if (input.photo) form.append("photo", input.photo);
  if (input.licence) form.append("licence", input.licence);
  return kycCall(path, { method: "POST", body: form });
}

function VehicleForm({ busy, initial, onSend, submitLabel }: { busy: boolean; initial?: { type: string; plateNumber: string }; onSend: (input: { type: string; plateNumber: string; photo: File | null; licence: File | null }) => Promise<boolean>; submitLabel: string }) {
  const t = useKycT();
  const [type, setType] = useState<string>(initial?.type ?? "bike");
  const [plateNumber, setPlateNumber] = useState(initial?.plateNumber ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [licence, setLicence] = useState<File | null>(null);
  const needsFiles = !initial;
  return (
    <div className="grid gap-3 rounded-[16px] border border-app-line bg-app-canvas p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("veh.type")}>
          <select value={type} onChange={(event) => setType(event.target.value)} className={field.select}>
            {DELIVERY_METHODS.map((method) => <option key={method} value={method}>{t(`method.${method}`)}</option>)}
          </select>
        </Field>
        <Field label={t("veh.plate")}><input value={plateNumber} onChange={(event) => setPlateNumber(event.target.value.toUpperCase())} className={field.input} /></Field>
        <FilePick label={t("veh.photo")} file={photo} onPick={setPhoto} />
        <FilePick label={t("veh.licence")} file={licence} onPick={setLicence} imagesOnly={false} />
      </div>
      <div>
        <PillButton
          size="md"
          busy={busy}
          disabled={plateNumber.trim().length < 4 || (needsFiles ? !photo || !licence : !photo && !licence && plateNumber === initial?.plateNumber && type === initial?.type)}
          onClick={async () => {
            if (await onSend({ type, plateNumber, photo, licence })) {
              setPhoto(null);
              setLicence(null);
              if (!initial) setPlateNumber("");
            }
          }}
        >
          {submitLabel}
        </PillButton>
      </div>
    </div>
  );
}

export function VehiclesStep({ state, onState }: StepProps) {
  const t = useKycT();
  const { busy, error, run } = useAction(onState);
  const [fixing, setFixing] = useState<string | null>(null);
  return (
    <StepCard title={t("veh.title")} sub={t("veh.sub")}>
      <StepError error={error} />
      <Row label={t("item.vehicles")} state={state.tier1.vehicles}>
        {state.vehicles.length === 0 && <p className="m-0 text-[14.5px] text-app-ink-soft">{t("veh.none")}</p>}
        <ul className="m-0 grid list-none gap-3 p-0">
          {state.vehicles.map((vehicle) => (
            <li key={vehicle.id} className="grid gap-2 rounded-[16px] border border-app-line p-4">
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-[15px]">{t.dynamic(`method.${vehicle.type}`, vehicle.type)} · {vehicle.plateNumber}</b>
                <StatusPill state={vehicle.status as ItemState} />
                <span className="ml-auto flex flex-wrap gap-3 text-[13.5px] font-bold">
                  <a href={docFileUrl(vehicle.photoPath)} target="_blank" rel="noreferrer" className="text-app-ink underline underline-offset-4">{t("veh.photo")}</a>
                  <a href={docFileUrl(vehicle.licencePath)} target="_blank" rel="noreferrer" className="text-app-ink underline underline-offset-4">{t("veh.licence")}</a>
                </span>
              </div>
              {vehicle.status === "rejected" && vehicle.rejectionReason && <p className="m-0 text-[14px] text-app-danger">{t("status.rejectedReason", { reason: vehicle.rejectionReason })}</p>}
              <div className="flex flex-wrap gap-2">
                {vehicle.status !== "approved" && (
                  <button type="button" onClick={() => setFixing(fixing === vehicle.id ? null : vehicle.id)} className="inline-flex min-h-[36px] items-center rounded-full border border-app-line bg-white px-3.5 text-[13px] font-bold">{t("veh.fix")}</button>
                )}
                <button
                  type="button"
                  disabled={busy === `remove-${vehicle.id}`}
                  onClick={() => void run(`remove-${vehicle.id}`, () => kycCall(`/vehicles/${vehicle.id}`, { method: "DELETE" }))}
                  className="inline-flex min-h-[36px] items-center rounded-full border border-app-line bg-white px-3.5 text-[13px] font-bold text-app-danger disabled:opacity-50"
                >
                  {t("veh.remove")}
                </button>
              </div>
              {fixing === vehicle.id && (
                <VehicleForm
                  busy={busy === `fix-${vehicle.id}`}
                  initial={{ type: vehicle.type, plateNumber: vehicle.plateNumber }}
                  submitLabel={t("veh.fix")}
                  onSend={(input) => run(`fix-${vehicle.id}`, () => sendVehicle(`/vehicles/${vehicle.id}`, input), () => setFixing(null))}
                />
              )}
            </li>
          ))}
        </ul>
        <VehicleForm busy={busy === "add"} submitLabel={t("veh.add")} onSend={(input) => run("add", () => sendVehicle("/vehicles", input))} />
      </Row>
    </StepCard>
  );
}

export function CoverageStep({ state, onState }: StepProps) {
  const t = useKycT();
  const { busy, error, run } = useAction(onState);
  const [methods, setMethods] = useState<string[]>(state.coverage.deliveryMethods.filter((method) => (DELIVERY_METHODS as readonly string[]).includes(method)));
  const [areas, setAreas] = useState<string[]>(state.coverage.deliveryAreas);
  const [pickedState, setPickedState] = useState("");
  const [lga, setLga] = useState("");
  const token = pickedState ? (lga ? `${pickedState}: ${lga}` : pickedState) : "";

  function addArea() {
    const parsed = parseArea(token);
    if (!parsed) return;
    const text = formatArea(parsed);
    if (!areas.some((area) => area.toLowerCase() === text.toLowerCase())) setAreas([...areas, text]);
    setLga("");
  }

  const toggle = (method: DeliveryMethod) => setMethods(methods.includes(method) ? methods.filter((item) => item !== method) : [...methods, method]);
  const cover: ItemState = state.tier1.coverage === "approved" && state.tier1.methods === "approved" ? "approved" : "missing";

  return (
    <StepCard title={t("cov.title")} sub={t("cov.sub")}>
      <StepError error={error} />
      <Row label={t("cov.methods")} state={state.tier1.methods}>
        <div className="flex flex-wrap gap-2">
          {DELIVERY_METHODS.map((method) => (
            <button
              key={method}
              type="button"
              aria-pressed={methods.includes(method)}
              onClick={() => toggle(method)}
              className={cx("inline-flex min-h-[40px] items-center rounded-full border px-4 text-[14px] font-bold transition", methods.includes(method) ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink")}
            >
              {t(`method.${method}`)}
            </button>
          ))}
        </div>
      </Row>
      <Row label={t("cov.areas")} state={state.tier1.coverage}>
        <div className="flex flex-wrap items-end gap-2">
          <select aria-label={t("id.state")} value={pickedState} onChange={(event) => { setPickedState(event.target.value); setLga(""); }} className={cx(field.select, "sm:max-w-[220px]")}>
            <option value="">{t("cov.pickState")}</option>
            {NG_STATES.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <select aria-label={t("cov.wholeState")} value={lga} onChange={(event) => setLga(event.target.value)} disabled={!pickedState} className={cx(field.select, "sm:max-w-[260px]")}>
            <option value="">{t("cov.wholeState")}</option>
            {lgasOf(pickedState).map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <PillButton tone="white" size="md" disabled={!token} onClick={addArea}>{t("cov.addArea")}</PillButton>
        </div>
        {areas.length === 0 ? (
          <p className="m-0 text-[14px] text-app-ink-soft">{t("cov.noAreas")}</p>
        ) : (
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {areas.map((area) => (
              <li key={area}>
                <button type="button" onClick={() => setAreas(areas.filter((item) => item !== area))} aria-label={t("cov.removeArea", { area })} className="inline-flex min-h-[36px] items-center gap-2 rounded-full border border-app-line bg-white px-3.5 text-[13.5px] font-bold">
                  {area} <span aria-hidden>×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Row>
      <div className="flex flex-wrap items-center gap-3">
        <PillButton size="md" busy={busy === "coverage"} disabled={!methods.length || !areas.length} onClick={() => void run("coverage", () => kycCall("/coverage", jsonInit("PATCH", { deliveryAreas: areas, deliveryMethods: methods })))}>
          {t("nav.save")}
        </PillButton>
        {cover === "approved" && <Pill tone="success" dot>{t("status.approved")}</Pill>}
      </div>
    </StepCard>
  );
}

export function GuarantorStep({ state, onState, reload }: StepProps & { reload: () => void }) {
  const t = useKycT();
  const { busy, error, run } = useAction(onState);
  const g = state.guarantor;
  const [fullName, setFullName] = useState(g?.fullName ?? "");
  const [phone, setPhone] = useState(g?.phone ?? "");
  const [address, setAddress] = useState(g?.address ?? "");
  const [relationship, setRelationship] = useState(g?.relationship ?? "");
  // null: they've had as many texts as they get.
  const [wait, setWait] = useState<number | null>(g ? g.resendIn : 0);

  useEffect(() => setWait(g ? g.resendIn : 0), [g]);
  useEffect(() => {
    if (!wait) return;
    const timer = setTimeout(() => setWait((left) => Math.max(0, (left ?? 0) - 1)), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  return (
    <StepCard title={t("gua.title")} sub={t("gua.sub")}>
      <StepError error={error} />
      <Row label={t("item.guarantor")} state={state.tier1.guarantor}>
        {g && (
          <p className={cx("m-0 text-[14.5px]", g.status === "declined" && "text-app-danger")}>
            {g.status === "confirmed" ? t("gua.confirmed", { name: g.fullName }) : g.status === "declined" ? t("gua.declined", { name: g.fullName }) : t("gua.pending", { name: g.fullName })}
          </p>
        )}
        {g?.status === "pending" && (
          <div>
            {wait === null ? null : wait > 0 ? (
              <span className="text-[13.5px] text-app-ink-soft">{t("gua.resendIn", { seconds: wait })}</span>
            ) : (
              <PillButton tone="white" size="sm" busy={busy === "resend"} onClick={() => void run("resend", () => kycCall("/guarantor", jsonInit("POST", { action: "resend" })))}>{t("gua.resend")}</PillButton>
            )}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("gua.name")}><input value={fullName} onChange={(event) => setFullName(event.target.value)} className={field.input} /></Field>
          <Field label={t("gua.phone")}><input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" className={field.input} /></Field>
          <Field label={t("gua.address")}><input value={address} onChange={(event) => setAddress(event.target.value)} className={field.input} /></Field>
          <Field label={t("gua.relationship")} hint={t("gua.relationshipHint")}><input value={relationship} onChange={(event) => setRelationship(event.target.value)} className={field.input} /></Field>
        </div>
        <div>
          <PillButton
            size="md"
            busy={busy === "save"}
            disabled={fullName.trim().length < 3 || !phone.trim() || address.trim().length < 5 || relationship.trim().length < 2}
            onClick={async () => {
              // Saved but not texted still saves the guarantor: show what's stored.
              if (!(await run("save", () => kycCall("/guarantor", jsonInit("PUT", { fullName, phone, address, relationship }))))) reload();
            }}
          >
            {t("gua.saveSend")}
          </PillButton>
        </div>
      </Row>
    </StepCard>
  );
}
