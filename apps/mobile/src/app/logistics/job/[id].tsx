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
import { fetchJob, moveJob, uploadJobProof, type Job, type JobAction } from "@/lib/logistics";
import { canFail, FAIL_REASONS, jobNextSteps, jobStage, timeAgo } from "@/lib/partner-pure";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors, radii } from "@/theme";

// One delivery job for the dispatcher: where from and to, the buyer, the rider, and the pipeline
// accepted → picked up → on the way → delivered (proof photo, who received it, the buyer's code, cash collected)
// or failed with a reason. Moves go through POST /api/mobile/logistics/jobs/[id] (the web console's job rules).

const PIPELINE = [
  { status: "confirmed", label: "Accepted" },
  { status: "picked_up", label: "Picked up" },
  { status: "in_transit", label: "On the way" },
  { status: "delivered", label: "Delivered" },
];

function Pipeline({ status }: { status: string }) {
  const reached = PIPELINE.findIndex((step) => step.status === status);
  return (
    <View style={{ flexDirection: "row", gap: 6 }} accessibilityLabel={`Progress: ${jobStage(status).label}`}>
      {PIPELINE.map((step, index) => {
        const done = reached >= index;
        return (
          <View key={step.status} style={{ flex: 1, gap: 6 }}>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: done ? (status === "delivered" ? colors.success : colors.ink) : colors.track }} />
            <T weight={done ? "bold" : "regular"} style={{ fontSize: 11.5, color: done ? colors.ink : colors.inkSoft }}>{step.label}</T>
          </View>
        );
      })}
    </View>
  );
}

export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
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
      setError(moveError instanceof Error ? moveError.message : "Couldn't update the job. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function takeProof(current: Job) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Camera is off", "Allow camera access in your phone's settings to take a proof of delivery photo.");
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
      setError(uploadError instanceof Error ? uploadError.message : "Couldn't upload the photo. Try again.");
    } finally {
      setBusy(null);
    }
  }

  function deliver(current: Job) {
    const collected = current.collect > 0 ? Number(cash.replace(/[,₦\s]/g, "")) : null;
    if (current.collect > 0 && (collected === null || !Number.isFinite(collected) || collected < 0)) return setError("Enter how much the buyer paid.");
    void run("delivered", { action: "status", to: "delivered", code: code.trim() || null, recipientName: recipient.trim() || null, codCollected: collected, codMethod: current.collect > 0 ? method : null });
  }

  if (!data) {
    return (
      <Screen title="Job" refreshing={job.refreshing} onRefresh={() => void job.refresh()}>
        {job.loading ? <LoadingBlock /> : null}
        {job.error ? <ErrorState message={job.error} onRetry={() => void job.reload()} web={{ label: "Open on web", onPress: () => void openWeb("/logistics/bookings") }} /> : null}
      </Screen>
    );
  }

  const current = data.job;
  const stage = jobStage(current.status);
  const steps = jobNextSteps(current.status);
  const open = ["confirmed", "picked_up", "in_transit"].includes(current.status);

  const footer =
    current.status === "pending" ? (
      <View style={{ flexDirection: "row", gap: 8 }}>
        <PillButton
          title="Decline"
          tone="white"
          size="md"
          style={{ flex: 0.7 }}
          busy={busy === "decline"}
          disabled={Boolean(busy)}
          onPress={() => Alert.alert("Decline this job?", "The shop is told to book someone else.", [{ text: "Keep it", style: "cancel" }, { text: "Decline", style: "destructive", onPress: () => void run("decline", { action: "decline" }) }])}
        />
        <PillButton title="Accept and assign" size="md" style={{ flex: 1.3 }} busy={busy === "accept"} disabled={Boolean(busy)} onPress={() => setSheet("accept")} />
      </View>
    ) : delivering ? (
      <View style={{ flexDirection: "row", gap: 8 }}>
        <PillButton title="Back" tone="white" size="md" style={{ flex: 0.6 }} disabled={Boolean(busy)} onPress={() => setDelivering(false)} />
        <PillButton title="Confirm delivered" tone="forest" size="md" style={{ flex: 1.4 }} busy={busy === "delivered"} disabled={Boolean(busy)} onPress={() => deliver(current)} />
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
        {canFail(current.status) ? <PillButton title="Couldn't deliver" tone="white" size="sm" disabled={Boolean(busy)} onPress={() => setSheet("fail")} /> : null}
      </View>
    ) : null;

  return (
    <Screen title={`Job ${current.ref}`} sub={`${current.shop} · booked ${timeAgo(current.createdAt)}`} refreshing={job.refreshing} onRefresh={() => void job.refresh()} footer={footer}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <TonePill tone={stage.tone} label={stage.label} />
        <T weight="extrabold" style={{ marginLeft: "auto", fontSize: 20 }}>{naira(current.fee)}</T>
      </View>
      {current.status !== "pending" && current.status !== "cancelled" && current.status !== "failed" ? <Pipeline status={current.status} /> : null}
      {error ? <Notice>{error}</Notice> : null}
      {current.status === "failed" && current.failedReason ? <Notice>Failed: {current.failedReason}</Notice> : null}

      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <AppIcon name="store" size={20} color={colors.accentInk} />
          <View style={{ flex: 1 }}>
            <T style={{ color: colors.inkSoft, fontSize: 12.5 }}>PICK UP</T>
            <T weight="bold">{current.shop}</T>
            <T selectable>{current.from}</T>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <AppIcon name="pin" size={20} color={colors.forest} />
          <View style={{ flex: 1 }}>
            <T style={{ color: colors.inkSoft, fontSize: 12.5 }}>DROP OFF</T>
            {current.buyer ? <T weight="bold">{current.buyer.name}</T> : null}
            <T selectable>{current.buyer?.address ?? current.to}</T>
          </View>
        </View>
        {current.buyer?.phone ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <PillButton tone="white" size="sm" onPress={() => void Linking.openURL(`tel:${current.buyer!.phone}`)}>
              <AppIcon name="phone" size={16} />
              <T weight="bold" style={{ fontSize: 13 }}>Call buyer</T>
            </PillButton>
            <PillButton tone="white" size="sm" onPress={() => void Linking.openURL(`https://wa.me/${current.buyer!.phone!.replace(/\D/g, "")}`)}>
              <AppIcon name="chat" size={16} />
              <T weight="bold" style={{ fontSize: 13 }}>WhatsApp</T>
            </PillButton>
          </View>
        ) : null}
      </Card>

      <Card style={{ paddingVertical: 4 }}>
        <KeyValue first label="Parcel" value={current.item} />
        {current.collect > 0 ? <KeyValue label="Collect on delivery" value={naira(current.collect)} /> : null}
        <KeyValue label="Delivery fee" value={`${naira(current.deliveryFee)} (you keep ${naira(current.fee)})`} />
        {current.trackingCode ? <KeyValue label="Tracking" value={current.trackingCode} /> : null}
        {current.codCollected !== null ? <KeyValue label="Collected" value={`${naira(current.codCollected)} ${current.codMethod ?? ""}`.trim()} /> : null}
        {current.notes ? <KeyValue label="Notes" value={current.notes} /> : null}
      </Card>

      {current.status !== "pending" && current.status !== "cancelled" ? (
        <>
          <SectionTitle>Rider</SectionTitle>
          <Pressable accessibilityRole="button" disabled={!open && current.status !== "failed"} onPress={() => setSheet("rider")} style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <AppIcon name="truck" size={20} />
            <T weight="bold" style={{ flex: 1 }}>{current.rider?.name ?? "No rider yet"}</T>
            {open || current.status === "failed" ? <T weight="bold" style={{ color: colors.accentInk }}>{current.rider ? "Change" : "Assign"}</T> : null}
          </Pressable>
        </>
      ) : null}

      {delivering ? (
        <>
          <SectionTitle>Proof of delivery</SectionTitle>
          <Card style={{ gap: 14 }}>
            {current.proofUrl ? <Image source={{ uri: current.proofUrl }} style={{ width: "100%", height: 180, borderRadius: 14 }} contentFit="cover" accessibilityLabel="Proof of delivery photo" /> : null}
            <PillButton tone="white" size="md" busy={busy === "proof"} disabled={Boolean(busy)} onPress={() => void takeProof(current)}>
              <AppIcon name="camera" size={18} />
              <T weight="bold">{current.proofUrl ? "Retake photo" : "Take a photo of the parcel"}</T>
            </PillButton>
            <View>
              <Label>Received by</Label>
              <Field value={recipient} onChangeText={setRecipient} placeholder={current.buyer?.name ?? "Name of the person"} autoCapitalize="words" />
            </View>
            <View>
              <Label>Buyer&apos;s 4-digit code</Label>
              <Field value={code} onChangeText={(text) => setCode(text.replace(/\D/g, "").slice(0, 4))} keyboardType="number-pad" placeholder="0000" maxLength={4} style={{ letterSpacing: 6, fontSize: 20 }} />
              <T style={{ color: colors.inkSoft, fontSize: 12.5, marginTop: 6 }}>The buyer has this code. Without it, add a photo or who received it.</T>
            </View>
            {current.collect > 0 ? (
              <View style={{ gap: 8 }}>
                <Label>Buyer paid (₦)</Label>
                <Field value={cash} onChangeText={setCash} keyboardType="decimal-pad" placeholder={String(current.collect)} />
                <ChipRow>
                  <Chip label="Cash" on={method === "cash"} onPress={() => setMethod("cash")} />
                  <Chip label="Transfer" on={method === "transfer"} onPress={() => setMethod("transfer")} />
                </ChipRow>
              </View>
            ) : null}
          </Card>
        </>
      ) : current.proofUrl ? (
        <>
          <SectionTitle>Proof of delivery</SectionTitle>
          <Image source={{ uri: current.proofUrl }} style={{ width: "100%", height: 200, borderRadius: radii.card }} contentFit="cover" accessibilityLabel="Proof of delivery photo" />
        </>
      ) : null}

      <PillButton title={`Message ${current.shop}`} tone="white" size="md" onPress={() => router.push({ pathname: "/logistics/chat/[id]", params: { id: current.sellerUserId, name: current.shop } })} />

      <ChoiceSheet
        visible={sheet === "rider" || sheet === "accept"}
        title={sheet === "accept" ? "Who takes this job?" : "Give the job to"}
        options={[...riderOptions(data.riders), { value: "", label: sheet === "accept" ? "Accept, assign later" : "No rider" }]}
        onPick={(value) => {
          const mode = sheet;
          setSheet(null);
          void (mode === "accept" ? run("accept", { action: "accept", riderId: value || null }) : run("rider", { action: "assign", riderId: value || null }));
        }}
        onClose={() => setSheet(null)}
      />
      <ChoiceSheet
        visible={sheet === "fail"}
        title="Why couldn't it be delivered?"
        options={FAIL_REASONS.map((reason) => ({ value: reason, label: reason }))}
        onPick={(reason) => {
          setSheet(null);
          void run("failed", { action: "status", to: "failed", failedReason: reason });
        }}
        onClose={() => setSheet(null)}
      />
    </Screen>
  );
}
