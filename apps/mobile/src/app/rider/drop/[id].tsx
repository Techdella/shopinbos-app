import { useState } from "react";
import { Alert, Linking, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { naira } from "@shared/onboarding";
import { AppIcon } from "@/components/icons";
import { ChipRow, ErrorState, LoadingBlock } from "@/components/kit";
import { ChoiceSheet, TonePill } from "@/components/partner";
import { Screen } from "@/components/Screen";
import { Card, Chip, Field, Label, Notice, PillButton, T } from "@/components/ui";
import { FAIL_REASONS } from "@/lib/partner-pure";
import { fetchRider, riderAction, uploadRiderProof } from "@/lib/rider";
import { useLoad } from "@/lib/useLoad";
import { colors, radii } from "@/theme";

// One drop for a rider: the buyer, the address, call / WhatsApp / map, then Delivered with the buyer's 4-digit
// code (plus a photo, who received it and the cash collected), or Couldn't deliver with a reason.

export default function RiderDrop() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const rider = useLoad(fetchRider);
  const [code, setCode] = useState("");
  const [recipient, setRecipient] = useState("");
  const [cash, setCash] = useState("");
  const [method, setMethod] = useState<"cash" | "transfer">("cash");
  const [photo, setPhoto] = useState<string | null>(null);
  const [failing, setFailing] = useState(false);
  const [busy, setBusy] = useState<null | "photo" | "deliver" | "fail">(null);
  const [error, setError] = useState<string | null>(null);

  const drop = rider.data?.runs.flatMap((run) => run.drops).find((item) => item.id === id);

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Camera is off", "Allow camera access in your phone's settings to take a proof of delivery photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.6 });
    if (result.canceled) return;
    const asset = result.assets[0];
    setBusy("photo");
    setError(null);
    try {
      await uploadRiderProof(String(id), { uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName });
      setPhoto(asset.uri);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Couldn't upload the photo. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function deliver() {
    if (!drop) return;
    if (code.length !== 4) return setError("Ask the buyer for their 4-digit code.");
    const collected = drop.collect > 0 ? Number(cash.replace(/[,₦\s]/g, "")) : null;
    if (drop.collect > 0 && (!cash.trim() || collected === null || !Number.isFinite(collected) || collected < 0)) return setError("Enter how much the buyer paid.");
    setBusy("deliver");
    setError(null);
    try {
      await riderAction({ action: "delivered", jobId: drop.id, code, recipientName: recipient.trim() || null, codCollected: collected, codMethod: drop.collect > 0 ? method : null });
      Alert.alert("Delivered", drop.collect > 0 && method === "cash" ? `Keep the ${naira(collected ?? 0)} safe and hand it in to your dispatcher.` : "Nice one. On to the next drop.");
      router.back();
    } catch (deliverError) {
      setError(deliverError instanceof Error ? deliverError.message : "Couldn't close this drop. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function fail(reason: string) {
    setFailing(false);
    setBusy("fail");
    setError(null);
    try {
      await riderAction({ action: "failed", jobId: String(id), reason });
      router.back();
    } catch (failError) {
      setError(failError instanceof Error ? failError.message : "Couldn't save that. Try again.");
    } finally {
      setBusy(null);
    }
  }

  if (!drop) {
    return (
      <Screen title="Drop" refreshing={rider.refreshing} onRefresh={() => void rider.refresh()}>
        {rider.loading ? <LoadingBlock /> : null}
        {rider.error ? <ErrorState message={rider.error} onRetry={() => void rider.reload()} /> : null}
        {rider.data ? <Notice tone="info">This drop is closed or was moved to another rider.</Notice> : null}
      </Screen>
    );
  }

  const phone = drop.buyerPhone;
  return (
    <Screen
      title={drop.buyerName ?? "Drop"}
      sub={drop.item}
      footer={
        <View style={{ gap: 8 }}>
          <PillButton title="Delivered" tone="forest" busy={busy === "deliver"} disabled={Boolean(busy)} onPress={() => void deliver()} />
          <PillButton title="Couldn't deliver" tone="white" size="sm" busy={busy === "fail"} disabled={Boolean(busy)} onPress={() => setFailing(true)} />
        </View>
      }
    >
      {error ? <Notice>{error}</Notice> : null}
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <AppIcon name="pin" size={20} color={colors.forest} />
          <T weight="bold" style={{ flex: 1, fontSize: 16, lineHeight: 22 }} selectable>{drop.address}</T>
        </View>
        {drop.collect > 0 ? <TonePill tone="warning" label={`Collect ${naira(drop.collect)}`} /> : null}
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {phone ? (
            <>
              <PillButton tone="white" size="sm" onPress={() => void Linking.openURL(`tel:${phone}`)}>
                <AppIcon name="phone" size={16} />
                <T weight="bold" style={{ fontSize: 13 }}>Call</T>
              </PillButton>
              <PillButton tone="white" size="sm" onPress={() => void Linking.openURL(`https://wa.me/${phone.replace(/\D/g, "")}`)}>
                <AppIcon name="chat" size={16} />
                <T weight="bold" style={{ fontSize: 13 }}>WhatsApp</T>
              </PillButton>
            </>
          ) : null}
          <PillButton tone="white" size="sm" onPress={() => void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(drop.address)}`)}>
            <AppIcon name="pin" size={16} />
            <T weight="bold" style={{ fontSize: 13 }}>Map</T>
          </PillButton>
        </View>
      </Card>

      <Card style={{ gap: 14 }}>
        <View>
          <Label>Buyer&apos;s 4-digit code</Label>
          <Field value={code} onChangeText={(text) => setCode(text.replace(/\D/g, "").slice(0, 4))} keyboardType="number-pad" placeholder="0000" maxLength={4} style={{ letterSpacing: 8, fontSize: 22, textAlign: "center" }} accessibilityLabel="Delivery code" />
        </View>
        {drop.collect > 0 ? (
          <View style={{ gap: 8 }}>
            <Label>Buyer paid (₦)</Label>
            <Field value={cash} onChangeText={setCash} keyboardType="decimal-pad" placeholder={String(drop.collect)} />
            <ChipRow>
              <Chip label="Cash" on={method === "cash"} onPress={() => setMethod("cash")} />
              <Chip label="Transfer" on={method === "transfer"} onPress={() => setMethod("transfer")} />
            </ChipRow>
          </View>
        ) : null}
        <View>
          <Label>Received by (optional)</Label>
          <Field value={recipient} onChangeText={setRecipient} placeholder={drop.buyerName ?? "Name"} autoCapitalize="words" />
        </View>
        {photo ? <Image source={{ uri: photo }} style={{ width: "100%", height: 170, borderRadius: radii.field }} contentFit="cover" accessibilityLabel="Proof of delivery photo" /> : null}
        <PillButton tone="white" size="md" busy={busy === "photo"} disabled={Boolean(busy)} onPress={() => void takePhoto()}>
          <AppIcon name="camera" size={18} />
          <T weight="bold">{photo || drop.hasProof ? "Retake proof photo" : "Proof photo (optional)"}</T>
        </PillButton>
      </Card>

      <ChoiceSheet visible={failing} title="Why couldn't you deliver?" options={FAIL_REASONS.map((reason) => ({ value: reason, label: reason }))} onPick={(reason) => void fail(reason)} onClose={() => setFailing(false)} />
    </Screen>
  );
}
