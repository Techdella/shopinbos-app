import { useEffect, useState } from "react";
import { View } from "react-native";
import { DELIVERY_METHODS } from "@shared/partner-tiers";
import { Seg } from "@/components/design";
import { ChipWrap, LabeledInput } from "@/components/PartnerKit";
import { PhotoSourceSheet } from "@/components/PhotoSourceSheet";
import { TonePill } from "@/components/partner";
import { PillButton, Segmented, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { deleteVehicle, fetchPayoutBanks, saveKycCoverage, savePayout, saveVehicle, type PickedPhoto } from "@/lib/kyc";
import { digitsUpTo, ITEM_TONE } from "@/lib/kyc-pure";
import { deliveryAreasFor, STATE_CHIPS, stateLabel, statesIn } from "@/lib/logistics-pure";
import { pickPhotos, type PhotoSource } from "@/lib/photos";
import { colors } from "@/theme";
import { NATIONWIDE } from "@shared/delivery-market";
import { ItemStatus, StepCard, useStepAction, type StepProps } from "./KycKit";

// Step 2, Bank (a bank account in the NIN's name; partners are never asked for a BVN), and step 3, Your delivery (the
// company name, where and how the partner delivers, and their vehicles: photo + licence each, checked by the team).

export function BankStep({ state, onState }: StepProps) {
  const t = useT("m_kyc");
  const payout = state.identity.payout;
  const action = useStepAction(onState);
  const [banks, setBanks] = useState<string[]>([]);
  const [bank, setBank] = useState<string | null>(payout?.bankName ?? null);
  const [account, setAccount] = useState("");

  useEffect(() => {
    let live = true;
    fetchPayoutBanks().then((result) => live && setBanks(result.banks)).catch(() => null);
    return () => {
      live = false;
    };
  }, []);

  function save() {
    if (!bank || account.length !== 10) return action.setError(t("bank.needAccount"));
    void action.run("save", () => savePayout({ method: "bank", bankName: bank, accountNumber: account }), () => action.setDone(t("bank.checked")));
  }

  return (
    <StepCard title={t("bank.title")} sub={t("bank.sub")}>
      <ItemStatus label={t("item.name.payout")} state={state.tier1.payout} reason={payout?.rejectionReason} />
      {payout ? (
        <T style={{ color: colors.inkSoft, fontSize: 14 }}>
          {t("bank.ending", { bank: payout.bankName ?? "", last4: payout.last4, name: payout.accountName ?? "" })}
        </T>
      ) : null}
      {state.tier1.payout !== "approved" ? (
        <>
          {banks.length ? (
            <ChipWrap label={t("bank.pick")}>
              {banks.map((name) => (
                <Seg key={name} label={name} on={bank === name} onPress={() => setBank(name)} />
              ))}
            </ChipWrap>
          ) : null}
          <LabeledInput label={t("bank.number")} value={account} onChangeText={(text) => setAccount(digitsUpTo(text, 10))} keyboardType="number-pad" />
          <T style={{ color: colors.inkSoft, fontSize: 13 }}>{t("bank.ownName")}</T>
          <PillButton title={t("bank.check")} busy={action.busy === "save"} disabled={Boolean(action.busy)} onPress={save} />
        </>
      ) : null}
      {action.notes}
    </StepCard>
  );
}

type Slot = "photo" | "licence";

export function VehiclesStep({ state, onState }: StepProps) {
  const t = useT("m_kyc");
  const action = useStepAction(onState);
  const [editing, setEditing] = useState<string | null>(state.vehicles.length ? null : "new");
  const [type, setType] = useState<string>("bike");
  const [plate, setPlate] = useState("");
  const [files, setFiles] = useState<Partial<Record<Slot, PickedPhoto>>>({});
  const [picking, setPicking] = useState<Slot | null>(null);
  const [sheet, setSheet] = useState<Slot | null>(null);

  function open(id: string | null) {
    const vehicle = state.vehicles.find((item) => item.id === id);
    setEditing(id ?? "new");
    setType(vehicle?.type ?? "bike");
    setPlate(vehicle?.plateNumber ?? "");
    setFiles({});
    action.setError(null);
  }

  async function pick(slot: Slot, source: PhotoSource) {
    setPicking(slot);
    const picked = await pickPhotos(source, 1).catch(() => [] as PickedPhoto[]);
    setPicking(null);
    if (picked === "denied") return action.setError(source === "camera" ? t("selfie.cameraOff") : t("photos.off"));
    if (picked[0]) setFiles((was) => ({ ...was, [slot]: picked[0] }));
  }

  function save() {
    const id = editing === "new" ? undefined : editing ?? undefined;
    if (!plate.trim()) return action.setError(t("vehicle.needPlate"));
    if (!id && (!files.photo || !files.licence)) return action.setError(t("vehicle.needPhotos"));
    void action.run("save", () => saveVehicle({ id, type, plateNumber: plate.trim(), photo: files.photo, licence: files.licence }), () => {
      setEditing(null);
      setFiles({});
      action.setDone(t("vehicle.saved"));
    });
  }

  return (
    <StepCard title={t("vehicle.title")} sub={t("vehicle.sub")}>
      <ItemStatus label={t("item.name.vehicles")} state={state.tier1.vehicles} />
      {state.vehicles.map((vehicle) => (
        <View key={vehicle.id} style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10, gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <T weight="bold" style={{ flex: 1 }}>{`${t.dynamic(`method.${vehicle.type}`, vehicle.type)} · ${vehicle.plateNumber}`}</T>
            <TonePill tone={ITEM_TONE[vehicle.status === "approved" ? "approved" : vehicle.status === "rejected" ? "rejected" : "pending"]} label={t.dynamic(`item.${vehicle.status}`, vehicle.status)} />
          </View>
          {vehicle.status === "rejected" && vehicle.rejectionReason ? <T style={{ color: colors.danger, fontSize: 14 }}>{vehicle.rejectionReason}</T> : null}
          {vehicle.status !== "approved" ? (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <PillButton title={t("vehicle.fix")} size="sm" tone="white" disabled={Boolean(action.busy)} onPress={() => open(vehicle.id)} />
              <PillButton title={t("vehicle.remove")} size="sm" tone="white" busy={action.busy === `del:${vehicle.id}`} disabled={Boolean(action.busy)} onPress={() => void action.run(`del:${vehicle.id}`, () => deleteVehicle(vehicle.id))} />
            </View>
          ) : null}
        </View>
      ))}
      {editing ? (
        <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 }}>
          <ChipWrap label={t("vehicle.type")}>
            {DELIVERY_METHODS.map((method) => (
              <Seg key={method} label={t(`method.${method}`)} on={type === method} onPress={() => setType(method)} />
            ))}
          </ChipWrap>
          <LabeledInput label={t("vehicle.plate")} value={plate} onChangeText={setPlate} autoCapitalize="characters" />
          {(["photo", "licence"] as const).map((slot) => (
            <View key={slot} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <T style={{ flex: 1 }}>{files[slot] ? t(`vehicle.${slot}Added`) : t(`vehicle.${slot}`)}</T>
              <PillButton title={files[slot] ? t("vehicle.change") : t("vehicle.add")} size="sm" tone="white" busy={picking === slot} disabled={Boolean(action.busy)} onPress={() => setSheet(slot)} />
            </View>
          ))}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <PillButton title={t("save")} size="sm" busy={action.busy === "save"} disabled={Boolean(action.busy)} onPress={save} />
            {state.vehicles.length ? <PillButton title={t("cancel")} size="sm" tone="white" disabled={Boolean(action.busy)} onPress={() => setEditing(null)} /> : null}
          </View>
        </View>
      ) : (
        <PillButton title={t("vehicle.addAnother")} size="sm" tone="white" style={{ alignSelf: "flex-start" }} disabled={Boolean(action.busy)} onPress={() => open(null)} />
      )}
      <PhotoSourceSheet visible={sheet !== null} onClose={() => setSheet(null)} onPick={(source) => sheet && void pick(sheet, source)} />
      {action.notes}
    </StepCard>
  );
}

/** Step 3, "Your delivery": the company or trading name, where and how the partner delivers, then their vehicles. */
export function DeliveryStep(props: StepProps) {
  const { state, onState } = props;
  const t = useT("m_kyc");
  const action = useStepAction(onState);
  const saved = state.coverage.deliveryAreas;
  const [company, setCompany] = useState(state.business.companyName ?? "");
  const [nationwide, setNationwide] = useState(saved.includes(NATIONWIDE));
  const [states, setStates] = useState<string[]>(statesIn(saved));
  const [methods, setMethods] = useState<string[]>(state.coverage.deliveryMethods.filter((method) => (DELIVERY_METHODS as readonly string[]).includes(method)));
  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

  function save() {
    const companyName = company.replace(/\s+/g, " ").trim();
    if (companyName.length < 2) return action.setError(t("delivery.needCompany"));
    const areas = deliveryAreasFor(nationwide ? "all" : "some", [], states, saved);
    if (!areas.length) return action.setError(t("coverage.needArea"));
    if (!methods.length) return action.setError(t("coverage.needMethod"));
    void action.run("save", () => saveKycCoverage({ companyName, deliveryAreas: areas, deliveryMethods: methods }), () => action.setDone(t("saved")));
  }

  return (
    <>
      <StepCard title={t("delivery.title")} sub={t("delivery.sub")}>
        <LabeledInput label={t("delivery.company")} value={company} onChangeText={setCompany} autoCapitalize="words" maxLength={80} />
        <T style={{ color: colors.inkSoft, fontSize: 13 }}>{t("delivery.companyHint")}</T>
        <ItemStatus label={t("item.name.coverage")} state={state.tier1.coverage} />
        <Segmented
          options={[
            { value: "some", label: t("coverage.some") },
            { value: "all", label: t("coverage.all") },
          ]}
          value={nationwide ? "all" : "some"}
          onChange={(value) => setNationwide(value === "all")}
        />
        {!nationwide ? (
          <ChipWrap label={t("coverage.states")}>
            {STATE_CHIPS.map((name) => (
              <Seg key={name} label={stateLabel(name)} on={states.includes(name)} onPress={() => setStates((was) => toggle(was, name))} />
            ))}
          </ChipWrap>
        ) : null}
        <ItemStatus label={t("item.name.methods")} state={state.tier1.methods} />
        <ChipWrap label={t("coverage.methods")}>
          {DELIVERY_METHODS.map((method) => (
            <Seg key={method} label={t(`method.${method}`)} on={methods.includes(method)} onPress={() => setMethods((was) => toggle(was, method))} />
          ))}
        </ChipWrap>
        <PillButton title={t("save")} busy={action.busy === "save"} disabled={Boolean(action.busy)} onPress={save} />
        {action.notes}
      </StepCard>
      <VehiclesStep {...props} />
    </>
  );
}
