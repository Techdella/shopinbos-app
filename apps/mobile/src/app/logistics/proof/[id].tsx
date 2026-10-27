import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { naira } from "@shared/onboarding";
import { Heading, Keypad, Seg, Sub } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { LabeledInput } from "@/components/PartnerKit";
import { Screen } from "@/components/Screen";
import { LinkButton, Notice, PillButton, T } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { fetchJob, moveJob, uploadJobProof } from "@/lib/logistics";
import { nairaInput } from "@/lib/logistics-pure";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// Proof of delivery ("Delivery partner app" prototype `proof`): the customer's 4-digit code on a keypad (checked
// when you press Delivered), or "No code? Use a photo instead": a photo of the parcel at the door and who received
// it. For pay-on-delivery jobs, how much cash was collected and how.

export default function ProofScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT("m_partner", "common");
  const job = useLoad(() => fetchJob(String(id)), String(id));
  const [code, setCode] = useState("");
  const [photoMode, setPhotoMode] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [cash, setCash] = useState<string | null>(null);
  const [method, setMethod] = useState<"cash" | "transfer">("cash");
  const [busy, setBusy] = useState<null | "photo" | "deliver">(null);
  const [codeBad, setCodeBad] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = job.data?.job;

  async function takePhoto() {
    if (!current) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t("job.cameraOff"), t("job.cameraOffBody"));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.6 });
    if (result.canceled || !job.data) return;
    const asset = result.assets[0];
    setBusy("photo");
    setError(null);
    try {
      const { proofUrl } = await uploadJobProof(current.id, { uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName });
      job.setData({ ...job.data, job: { ...current, proofUrl } });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : t("job.photoFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function deliver() {
    if (!current) return;
    const collected = current.collect > 0 ? nairaInput(cash ?? String(current.collect)) : null;
    if (current.collect > 0 && collected === null) return setError(t("job.typePaid"));
    setBusy("deliver");
    setError(null);
    setCodeBad(false);
    try {
      await moveJob(current.id, {
        action: "status",
        to: "delivered",
        code: photoMode ? null : code,
        recipientName: photoMode ? recipient.trim() || null : null,
        codCollected: collected,
        codMethod: current.collect > 0 ? method : null,
      });
      router.back();
    } catch (deliverError) {
      if (!photoMode && deliverError instanceof ApiError && deliverError.status === 400) setCodeBad(true);
      else setError(deliverError instanceof Error ? deliverError.message : t("error.retry"));
    } finally {
      setBusy(null);
    }
  }

  if (!current) {
    return (
      <Screen title={t("job.proof")}>
        {job.loading ? <LoadingBlock /> : null}
        {job.error ? <ErrorState message={job.error} onRetry={() => void job.reload()} /> : null}
      </Screen>
    );
  }

  const ready = photoMode ? Boolean(current.proofUrl || recipient.trim()) : code.length === 4;
  const footer = ready ? (
    <PillButton tone="forest" busy={busy === "deliver"} disabled={Boolean(busy)} onPress={() => void deliver()} icon="check" title={t("proof.delivered")} />
  ) : undefined;

  return (
    <Screen title={t("job.proof")} footer={footer}>
      {photoMode ? (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel={current.proofUrl ? t("job.retake") : t("job.takePhoto")} disabled={Boolean(busy)} onPress={() => void takePhoto()}>
            {current.proofUrl ? (
              <Image source={{ uri: current.proofUrl }} style={{ width: "100%", height: 200, borderRadius: 24 }} contentFit="cover" accessibilityLabel={t("job.proofPhoto")} />
            ) : (
              <View style={{ height: 200, borderRadius: 24, backgroundColor: colors.mintTint, alignItems: "center", justifyContent: "center", gap: 8 }}>
                <AppIcon name="camera" size={52} color={colors.forest} strokeWidth={1.8} />
                <T weight="bold" style={{ color: colors.forest }}>{busy === "photo" ? t("proof.uploading") : t("job.takePhoto")}</T>
              </View>
            )}
          </Pressable>
          <Sub style={{ marginTop: -6 }}>{t("proof.photoLine")}</Sub>
          <LabeledInput label={t("proof.whoReceived")} value={recipient} onChangeText={setRecipient} autoCapitalize="words" placeholder={current.buyer?.name ?? ""} />
        </>
      ) : (
        <>
          <View style={{ gap: 6, alignItems: "center" }}>
            <Heading style={{ textAlign: "center" }}>{t("proof.codeTitle")}</Heading>
            <Sub style={{ textAlign: "center" }}>{t("proof.codeSub")}</Sub>
          </View>
          <Keypad value={code} length={4} onChange={(next) => { setCode(next); setCodeBad(false); }} />
          {codeBad ? <T weight="bold" style={{ textAlign: "center", color: colors.accentInk, fontSize: 13 }} accessibilityRole="alert">{t("proof.codeBad")}</T> : null}
          <LinkButton title={t("proof.usePhoto")} onPress={() => setPhotoMode(true)} />
        </>
      )}

      {current.collect > 0 ? (
        <View style={{ gap: 10 }}>
          <LabeledInput label={t("proof.cashCollected", { amount: naira(current.collect) })} value={cash ?? String(current.collect)} onChangeText={setCash} keyboardType="number-pad" />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Seg label={t("cash")} on={method === "cash"} onPress={() => setMethod("cash")} />
            <Seg label={t("transfer")} on={method === "transfer"} onPress={() => setMethod("transfer")} />
          </View>
        </View>
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
    </Screen>
  );
}
