import { useState } from "react";
import { Pressable, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { CAC_TYPES } from "@shared/partner-tiers";
import { ChipWrap, LabeledInput } from "@/components/PartnerKit";
import { Seg } from "@/components/design";
import { PhotoSourceSheet } from "@/components/PhotoSourceSheet";
import { AppIcon } from "@/components/icons";
import { PillButton, T } from "@/components/ui";
import { API_URL } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { acceptTerms, fetchKyc, saveKycBusiness, submitKyc } from "@/lib/kyc";
import { itemsWhereOpen, tierOnSubmit } from "@/lib/kyc-pure";
import { uploadVerificationDoc } from "@/lib/logistics";
import { pickPhotos, type PhotoSource } from "@/lib/photos";
import { colors } from "@/theme";
import { ItemStatus, StepCard, useStepAction, type StepProps } from "./KycKit";

// Optional CAC (Tier 2: business name, BN/RC, number and certificate) with the extra files (utility bill, NIPOST
// licence), then Review & submit: the terms, the tier they'll reach and what's still missing.

export const openOnWeb = (path: string) => void WebBrowser.openBrowserAsync(`${API_URL}${path}`);

type FileType = "cac" | "utility" | "courier-licence";

export function CacStep({ state, onState }: StepProps) {
  const t = useT("m_kyc");
  const action = useStepAction(onState);
  const business = state.business;
  const [name, setName] = useState(business.registeredName ?? business.companyName ?? "");
  const [type, setType] = useState<string>(business.cacType ?? "BN");
  const [number, setNumber] = useState((business.cacNumber ?? "").replace(/^(BN|RC)\s*/i, ""));
  const [address, setAddress] = useState(business.businessAddress ?? "");
  const [sheet, setSheet] = useState<FileType | null>(null);
  const doc = (type: FileType) => state.docs.find((item) => item.type === type);
  const docState = (type: FileType) => {
    const status = doc(type)?.status;
    return status === "approved" ? "approved" : status === "rejected" ? "rejected" : status ? "pending" : "missing";
  };

  async function upload(fileType: FileType, source: PhotoSource) {
    const picked = await pickPhotos(source, 1).catch(() => []);
    if (picked === "denied") return action.setError(source === "camera" ? t("selfie.cameraOff") : t("photos.off"));
    const photo = picked[0];
    if (!photo) return;
    // The upload answers with the document only, so the state is read again after it.
    await action.run(`file:${fileType}`, async () => {
      await uploadVerificationDoc(fileType, photo);
      return fetchKyc();
    });
  }

  const fileRow = (fileType: FileType) => {
    const current = doc(fileType);
    const locked = Boolean(current && ["submitted", "under_review", "approved"].includes(current.status));
    return (
      <View key={fileType} style={{ gap: 6 }}>
        <ItemStatus label={t(`file.${fileType}`)} state={docState(fileType)} reason={current?.rejectionReason} />
        <T style={{ color: colors.inkSoft, fontSize: 13 }}>{t(`file.${fileType}.hint`)}</T>
        {!locked ? (
          <PillButton title={current ? t("vehicle.change") : t("vehicle.add")} size="sm" tone="white" style={{ alignSelf: "flex-start" }} busy={action.busy === `file:${fileType}`} disabled={Boolean(action.busy)} onPress={() => setSheet(fileType)} />
        ) : null}
      </View>
    );
  };

  return (
    <>
      <StepCard title={t("cac.title")} sub={t("cac.sub")}>
        <Pressable accessibilityRole="link" onPress={() => openOnWeb("/logistics/cac-help")} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <AppIcon name="help" size={18} color={colors.forest} />
          <T weight="bold" style={{ color: colors.forest }}>{t("cac.help")}</T>
        </Pressable>
        <LabeledInput label={t("cac.name")} value={name} onChangeText={setName} autoCapitalize="words" />
        <ChipWrap label={t("cac.type")}>
          {CAC_TYPES.map((value) => (
            <Seg key={value} label={t(`cac.type.${value}`)} on={type === value} onPress={() => setType(value)} />
          ))}
        </ChipWrap>
        <LabeledInput label={t("cac.number")} value={number} onChangeText={setNumber} autoCapitalize="characters" placeholder="1234567" />
        <LabeledInput label={t("cac.address")} value={address} onChangeText={setAddress} autoCapitalize="words" />
        <PillButton
          title={t("save")}
          size="sm"
          tone="white"
          style={{ alignSelf: "flex-start" }}
          busy={action.busy === "save"}
          disabled={Boolean(action.busy)}
          onPress={() => void action.run("save", () => saveKycBusiness({ registeredName: name.trim(), cacType: type, cacNumber: `${type} ${number.trim()}`, businessAddress: address.trim() || undefined }), () => action.setDone(t("saved")))}
        />
        {fileRow("cac")}
      </StepCard>
      <StepCard title={t("files.title")} sub={t("files.sub")}>
        {fileRow("utility")}
        {fileRow("courier-licence")}
      </StepCard>
      <PhotoSourceSheet visible={sheet !== null} onClose={() => setSheet(null)} onPick={(source) => sheet && void upload(sheet, source)} />
      {action.notes}
    </>
  );
}

export function ReviewStep({ state, onState }: StepProps) {
  const t = useT("m_kyc");
  const action = useStepAction(onState);
  const [agreed, setAgreed] = useState(state.termsCurrent);
  const reach = tierOnSubmit(state);
  // The terms are the tick box below, accepted when sending, so they never block the button.
  const open = itemsWhereOpen(state.tier1).filter((item) => item.key !== "terms");
  const sent = Boolean(state.submittedAt) && (state.state === "pending_review" || state.state === "tier1_verified" || state.state === "tier2_verified");

  async function submit() {
    if (!agreed) return action.setError(t("terms.needed"));
    await action.run("submit", async () => {
      if (!state.termsCurrent) await acceptTerms();
      return submitKyc();
    }, () => action.setDone(t("review.sent")));
  }

  return (
    <StepCard title={t("review.title")} sub={reach ? t(`review.reach.${reach}`) : t("review.notReady")}>
      {open.length ? (
        <View style={{ gap: 6 }}>
          <T weight="bold">{t("review.missing")}</T>
          {open.map((item) => (
            <ItemStatus key={item.key} label={t.dynamic(`item.name.${item.key}`, item.key)} state={item.state} />
          ))}
        </View>
      ) : null}
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: agreed }} onPress={() => setAgreed((was) => !was)} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: agreed ? colors.forest : colors.line, backgroundColor: agreed ? colors.forest : "#FFFFFF", alignItems: "center", justifyContent: "center" }}>
          {agreed ? <AppIcon name="check" size={16} color="#FFFFFF" /> : null}
        </View>
        <T style={{ flex: 1, lineHeight: 20 }}>{t("terms.agree")}</T>
      </Pressable>
      <Pressable accessibilityRole="link" onPress={() => openOnWeb("/logistics/terms")}>
        <T weight="bold" style={{ color: colors.forest }}>{t("terms.read")}</T>
      </Pressable>
      <PillButton title={sent ? t("review.sendAgain") : t("review.send")} tone="forest" busy={action.busy === "submit"} disabled={Boolean(action.busy) || open.length > 0} onPress={() => void submit()} />
      {action.notes}
    </StepCard>
  );
}
