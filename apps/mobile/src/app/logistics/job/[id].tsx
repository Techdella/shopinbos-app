import { useState } from "react";
import { Alert, Linking, Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { naira } from "@shared/onboarding";
import { AppIcon } from "@/components/icons";
import { riderOptions } from "@/components/JobCard";
import { ChipRow, ErrorState, LoadingBlock, SectionTitle } from "@/components/kit";
import { ChoiceSheet, KeyValue, TonePill } from "@/components/partner";
import { Screen } from "@/components/Screen";
import { Card, Chip, Field, Label, Notice, PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { fetchJob, moveJob, uploadJobProof, type Job, type JobAction } from "@/lib/logistics";
import { canFail, failReasonOptions, jobNextSteps, jobStage, timeAgo } from "@/lib/partner-pure";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors, radii } from "@/theme";

// One delivery job for the dispatcher: where from and to, the buyer, the rider, and the pipeline
// accepted → picked up → on the way → delivered (proof photo, who received it, the buyer's code, cash collected)
// or failed with a reason. Moves go through POST /api/mobile/logistics/jobs/[id] (the web console's job rules).

// Labels in m_partner "job.pipeline.<status>".
const PIPELINE = ["confirmed", "picked_up", "in_transit", "delivered"] as const;

function Pipeline({ status }: { status: string }) {
  const t = useT("m_partner");
  const reached = PIPELINE.findIndex((step) => step === status);
  return (
    <View style={{ flexDirection: "row", gap: 6 }} accessibilityLabel={t("job.progress", { stage: jobStage(status, t).label })}>
      {PIPELINE.map((step, index) => {
        const done = reached >= index;
        return (
          <View key={step} style={{ flex: 1, gap: 6 }}>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: done ? (status === "delivered" ? colors.success : colors.ink) : colors.track }} />
            <T weight={done ? "bold" : "regular"} style={{ fontSize: 13, color: done ? colors.ink : colors.inkSoft }}>{t(`job.pipeline.${step}`)}</T>
          </View>
        );
      })}
    </View>
  );
}

export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT("m_partner", "common");
  const job = useLoad(() => fetchJob(String(id)), String(id));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | "rider" | "accept" | "fail">(null);
  const [delivering, setDelivering] = useState(false);
  const [code, setCode] = useState("");
  const [recipient, setRecipient] = useState("");
  const [cash, setCash] = useState("");
  const [method, setMethod] = useState<"cash" | "transfer">("cash");
  const data = job.data;

  async function run(key: string, body: JobAction) {
    setBusy(key);
    setError(null);
    try {
      const result = await moveJob(String(id), body);
      if (result.job && data) job.setData({ ...data, job: result.job });
      setDelivering(false);
      void job.reload();
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : t("error.retry"));
    } finally {
      setBusy(null);
    }
  }

  async function takeProof(current: Job) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t("job.cameraOff"), t("job.cameraOffBody"));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.6 });
    if (result.canceled || !data) return;
    const asset = result.assets[0];
    setBusy("proof");
    setError(null);
    try {
      const { proofUrl } = await uploadJobProof(current.id, { uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName });
      job.setData({ ...data, job: { ...current, proofUrl } });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : t("job.photoFailed"));
    } finally {
      setBusy(null);
    }
  }

  function deliver(current: Job) {
    const collected = current.collect > 0 ? Number(cash.replace(/[,₦\s]/g, "")) : null;
    if (current.collect > 0 && (collected === null || !Number.isFinite(collected) || collected < 0)) return setError(t("job.typePaid"));
    void run("delivered", { action: "status", to: "delivered", code: code.trim() || null, recipientName: recipient.trim() || null, codCollected: collected, codMethod: current.collect > 0 ? method : null });
  }

  if (!data) {
    return (
      <Screen title={t("job.title")} refreshing={job.refreshing} onRefresh={() => void job.refresh()}>
        {job.loading ? <LoadingBlock /> : null}
        {job.error ? <ErrorState message={job.error} onRetry={() => void job.reload()} web={{ label: t("openOnWeb"), onPress: () => void openWeb("/logistics/bookings") }} /> : null}
      </Screen>
    );
  }

  const current = data.job;
  const stage = jobStage(current.status, t);
  const steps = jobNextSteps(current.status, t);
  const open = ["confirmed", "picked_up", "in_transit"].includes(current.status);

  const footer =
    current.status === "pending" ? (
      <View style={{ flexDirection: "row", gap: 8 }}>
        <PillButton
          title={t("decline")}
          tone="white"
          size="md"
          style={{ flex: 0.7 }}
          busy={busy === "decline"}
          disabled={Boolean(busy)}
          onPress={() => Alert.alert(t("decline.title"), t("decline.body"), [{ text: t("keepIt"), style: "cancel" }, { text: t("decline"), style: "destructive", onPress: () => void run("decline", { action: "decline" }) }])}
        />
        <PillButton title={t("acceptAssign")} size="md" style={{ flex: 1.3 }} busy={busy === "accept"} disabled={Boolean(busy)} onPress={() => setSheet("accept")} />
      </View>
    ) : delivering ? (
      <View style={{ flexDirection: "row", gap: 8 }}>
        <PillButton title={t("back")} tone="white" size="md" style={{ flex: 0.6 }} disabled={Boolean(busy)} onPress={() => setDelivering(false)} />
        <PillButton title={t("job.confirmDelivered")} tone="forest" size="md" style={{ flex: 1.4 }} busy={busy === "delivered"} disabled={Boolean(busy)} onPress={() => deliver(current)} />
      </View>
    ) : steps.length ? (
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {steps.map((step) => (
            <PillButton
              key={step.to}
              title={step.label}
              size="md"
              tone={step.to === "delivered" ? "forest" : "ink"}
              style={{ flex: 1 }}
              busy={busy === step.to}
              disabled={Boolean(busy)}
              onPress={() => (step.to === "delivered" ? setDelivering(true) : void run(step.to, { action: "status", to: step.to }))}
            />
          ))}
        </View>
        {canFail(current.status) ? <PillButton title={t("job.couldntDeliver")} tone="white" size="sm" disabled={Boolean(busy)} onPress={() => setSheet("fail")} /> : null}
      </View>
    ) : null;

  return (
    <Screen title={t("job.titleRef", { ref: current.ref })} sub={t("job.sub", { shop: current.shop, ago: timeAgo(current.createdAt, undefined, t) })} refreshing={job.refreshing} onRefresh={() => void job.refresh()} footer={footer}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <TonePill tone={stage.tone} label={stage.label} />
        <T weight="extrabold" style={{ marginLeft: "auto", fontSize: 20 }}>{naira(current.fee)}</T>
      </View>
      {current.status !== "pending" && current.status !== "cancelled" && current.status !== "failed" ? <Pipeline status={current.status} /> : null}
      {error ? <Notice>{error}</Notice> : null}
      {current.status === "failed" && current.failedReason ? <Notice>{t("job.failed", { reason: current.failedReason })}</Notice> : null}

      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <AppIcon name="store" size={20} color={colors.accentInk} />
          <View style={{ flex: 1 }}>
            <T weight="bold" style={{ color: colors.inkSoft, fontSize: 14 }}>{t("job.pickup")}</T>
            <T weight="bold">{current.shop}</T>
            <T selectable>{current.from}</T>
            {current.pickupWindow ? <T weight="extrabold" style={{ color: colors.accentInk, fontSize: 15 }}>{current.pickupWindow}</T> : null}
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <AppIcon name="pin" size={20} color={colors.forest} />
          <View style={{ flex: 1 }}>
            <T weight="bold" style={{ color: colors.inkSoft, fontSize: 14 }}>{t("job.dropoff")}</T>
            {current.buyer ? <T weight="bold">{current.buyer.name}</T> : null}
            <T selectable>{current.buyer?.address ?? current.to}</T>
          </View>
        </View>
        {current.buyer?.phone ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <PillButton tone="white" size="sm" onPress={() => void Linking.openURL(`tel:${current.buyer!.phone}`)}>
              <AppIcon name="phone" size={16} />
              <T weight="bold" style={{ fontSize: 15 }}>{t("job.callCustomer")}</T>
            </PillButton>
            <PillButton tone="white" size="sm" onPress={() => void Linking.openURL(`https://wa.me/${current.buyer!.phone!.replace(/\D/g, "")}`)}>
              <AppIcon name="chat" size={16} />
              <T weight="bold" style={{ fontSize: 15 }}>WhatsApp</T>
            </PillButton>
          </View>
        ) : null}
      </Card>

      <Card style={{ paddingVertical: 4 }}>
        <KeyValue first label={t("job.parcel")} value={current.item} />
        {current.collect > 0 ? <KeyValue label={t("job.cod")} value={naira(current.collect)} /> : null}
        <KeyValue label={t("job.fee")} value={t("job.feeValue", { fee: naira(current.deliveryFee), keep: naira(current.fee) })} />
        {current.trackingCode ? <KeyValue label={t("job.tracking")} value={current.trackingCode} /> : null}
        {current.codCollected !== null ? <KeyValue label={t("job.collected")} value={`${naira(current.codCollected)} ${current.codMethod === "cash" ? t("cash") : current.codMethod === "transfer" ? t("transfer") : (current.codMethod ?? "")}`.trim()} /> : null}
        {current.notes ? <KeyValue label={t("job.notes")} value={current.notes} /> : null}
      </Card>

      {current.status !== "pending" && current.status !== "cancelled" ? (
        <>
          <SectionTitle>{t("job.rider")}</SectionTitle>
          <Pressable accessibilityRole="button" disabled={!open && current.status !== "failed"} onPress={() => setSheet("rider")} style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <AppIcon name="truck" size={20} />
            <T weight="bold" style={{ flex: 1 }}>{current.rider?.name ?? t("job.noRider")}</T>
            {open || current.status === "failed" ? <T weight="bold" style={{ color: colors.accentInk }}>{current.rider ? t("job.change") : t("job.assign")}</T> : null}
          </Pressable>
        </>
      ) : null}

      {delivering ? (
        <>
          <SectionTitle>{t("job.proof")}</SectionTitle>
          <Card style={{ gap: 14 }}>
            {current.proofUrl ? <Image source={{ uri: current.proofUrl }} style={{ width: "100%", height: 180, borderRadius: 14 }} contentFit="cover" accessibilityLabel={t("job.proofPhoto")} /> : null}
            <PillButton tone="white" size="md" busy={busy === "proof"} disabled={Boolean(busy)} onPress={() => void takeProof(current)}>
              <AppIcon name="camera" size={18} />
              <T weight="bold">{current.proofUrl ? t("job.retake") : t("job.takePhoto")}</T>
            </PillButton>
            <View>
              <Label>{t("job.receivedBy")}</Label>
              <Field value={recipient} onChangeText={setRecipient} placeholder={current.buyer?.name ?? t("job.personName")} autoCapitalize="words" accessibilityLabel={t("job.receivedBy")} />
            </View>
            <View>
              <Label>{t("job.code")}</Label>
              <Field value={code} onChangeText={(text) => setCode(text.replace(/\D/g, "").slice(0, 4))} keyboardType="number-pad" placeholder="0000" maxLength={4} accessibilityLabel={t("job.code")} style={{ letterSpacing: 6, fontSize: 20 }} />
              <T style={{ color: colors.inkSoft, fontSize: 14, marginTop: 6 }}>{t("job.codeHint")}</T>
            </View>
            {current.collect > 0 ? (
              <View style={{ gap: 8 }}>
                <Label>{t("job.codCollected")}</Label>
                <Field value={cash} onChangeText={setCash} keyboardType="decimal-pad" placeholder={String(current.collect)} accessibilityLabel={t("job.codCollected")} />
                <ChipRow>
                  <Chip label={t("cash")} on={method === "cash"} onPress={() => setMethod("cash")} />
                  <Chip label={t("transfer")} on={method === "transfer"} onPress={() => setMethod("transfer")} />
                </ChipRow>
              </View>
            ) : null}
          </Card>
        </>
      ) : current.proofUrl ? (
        <>
          <SectionTitle>{t("job.proof")}</SectionTitle>
          <Image source={{ uri: current.proofUrl }} style={{ width: "100%", height: 200, borderRadius: radii.card }} contentFit="cover" accessibilityLabel={t("job.proofPhoto")} />
        </>
      ) : null}

      <PillButton title={t("job.messageShop", { shop: current.shop })} tone="white" size="md" onPress={() => router.push({ pathname: "/logistics/chat/[id]", params: { id: current.sellerUserId, name: current.shop } })} />

      <ChoiceSheet
        visible={sheet === "rider" || sheet === "accept"}
        title={sheet === "accept" ? t("assignRider") : t("job.reassign")}
        options={[...riderOptions(data.riders, data.job.pickupGeo, undefined, t), { value: "", label: sheet === "accept" ? t("acceptLater") : t("job.noRiderOption") }]}
        onPick={(value) => {
          const mode = sheet;
          setSheet(null);
          void (mode === "accept" ? run("accept", { action: "accept", riderId: value || null }) : run("rider", { action: "assign", riderId: value || null }));
        }}
        onClose={() => setSheet(null)}
      />
      <ChoiceSheet
        visible={sheet === "fail"}
        title={t("job.why")}
        options={failReasonOptions(t)}
        onPick={(reason) => {
          setSheet(null);
          void run("failed", { action: "status", to: "failed", failedReason: reason });
        }}
        onClose={() => setSheet(null)}
      />
    </Screen>
  );
}
