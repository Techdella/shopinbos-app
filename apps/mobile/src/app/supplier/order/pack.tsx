import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { naira } from "@shared/onboarding";
import { AppIcon } from "@/components/icons";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { useWords } from "@/components/supplier/DropshipKit";
import { Notice, PillButton, T } from "@/components/ui";
import { orderItems } from "@/components/SupplierOrderRow";
import { packButton, sellerInitials, toggleStep } from "@/lib/dropship-pure";
import { fetchPack, fetchSupplierOrder, savePack, uploadMediaPhoto, type DropshipOrder, type PackView } from "@/lib/supplier";
import { useLoad } from "@/lib/useLoad";
import { colors, fonts, radii } from "@/theme";

// Pack it the seller's way (P-Order; the web's PackChecklist on /supplier/orders/[id]), for one dropship order: for
// which shop (their logo or initials, the items, their SKU), where it goes, who picks it up, delivery and what the
// supplier gets (with the branding fee), then the checklist from the server (pack plain, the seller's slip or
// sticker, the order code on the parcel, and "Snap the sealed parcel": the camera, uploaded to the media library,
// POST /api/app/media). "Ready for pickup" stays off ("2 steps left") until every step is ticked and the photo is
// there; then POST /api/supplier/orders/[id]/pack { packed: true } (the server refuses with the step left otherwise).
// The photo decides most disputes. Opened from the order screen ("Pack it {shop}'s way").

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexBasis: "47%", flexGrow: 1, backgroundColor: colors.surface, borderRadius: 16, padding: 12, gap: 3 }}>
      <T weight="extrabold" style={{ fontSize: 10.5, letterSpacing: 0.8, color: colors.inkSoft }}>{label}</T>
      <T weight="bold" style={{ fontSize: 14, lineHeight: 19 }}>{value}</T>
    </View>
  );
}

export default function PackScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const words = useWords();
  const loaded = useLoad(async () => {
    const [order, pack] = await Promise.all([fetchSupplierOrder("dropship", String(id)), fetchPack(String(id))]);
    return { order: order as DropshipOrder, pack };
  }, String(id));
  const [pack, setPack] = useState<PackView | null>(null);
  const [busy, setBusy] = useState<"step" | "photo" | "packed" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const view = pack ?? loaded.data?.pack ?? null;
  const order = loaded.data?.order ?? null;

  async function tick(stepId: string) {
    if (!view || busy) return;
    const steps = toggleStep(view.packSteps, stepId);
    setPack({ ...view, packSteps: steps, steps: view.steps.map((step) => (step.id === stepId ? { ...step, done: !step.done } : step)) });
    setBusy("step");
    setError(null);
    try {
      setPack(await savePack(view.orderId, { steps }));
    } catch (tickError) {
      setPack(view);
      setError(tickError instanceof Error ? tickError.message : words("pack.failed", "Couldn't save that. Try again."));
    } finally {
      setBusy(null);
    }
  }

  async function snap() {
    if (!view || busy) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(words("pack.cameraOff", "Camera is off"), words("pack.allowCamera", "Allow the camera in your phone's settings to snap the parcel."));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.6 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setBusy("photo");
    setError(null);
    try {
      const photoUrl = await uploadMediaPhoto({ uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName });
      setPack(await savePack(view.orderId, { photoUrl }));
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : words("pack.photoFailed", "The photo didn't upload. Try again."));
    } finally {
      setBusy(null);
    }
  }

  async function ready() {
    if (!view) return;
    setBusy("packed");
    setError(null);
    try {
      const next = await savePack(view.orderId, { packed: true });
      setPack(next);
      router.back();
    } catch (packError) {
      setError(packError instanceof Error ? packError.message : words("pack.failed", "Couldn't save that. Try again."));
    } finally {
      setBusy(null);
    }
  }

  if (!view || !order) {
    return (
      <Screen title={words("pack.title", "Pack it")} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
        {loaded.loading ? <LoadingBlock /> : null}
        {loaded.error ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      </Screen>
    );
  }

  const seller = view.branding.sellerName;
  const button = packButton(view.steps, view.photoUrl, words);
  const goesTo = [order.label.address[order.label.address.length - 1], order.label.to].filter(Boolean)[0] ?? "";
  const pieces = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const feeWord = view.branding.choice === "stickers" ? words("pack.stickerFee", "sticker fee") : words("pack.slipFee", "slip fee");
  const youGet = view.branding.fee > 0 ? `${naira(order.yourTotal)} + ${naira(view.branding.fee)} ${feeWord}` : naira(order.yourTotal);
  const delivery = order.selfDelivery ? (order.deliveryFee ? words("pack.youDeliver", "You deliver it, +{fee}", { fee: naira(order.deliveryFee) }) : words("pack.youDeliverFree", "You deliver it")) : words("pack.paidByShop", "Paid at checkout, not by you");

  return (
    <Screen
      title={words("pack.order", "Order {ref}", { ref: order.ref })}
      refreshing={loaded.refreshing}
      onRefresh={() => {
        setPack(null);
        void loaded.refresh();
      }}
      footer={
        view.packed ? (
          <PillButton title={words("pack.done", "Packed. Back to the order")} tone="white" onPress={() => router.back()} />
        ) : (
          <>
            <T style={{ fontSize: 13, textAlign: "center", color: colors.inkSoft }}>{words("pack.paidFriday", "Paid on Friday after the customer confirms delivery.")}</T>
            <PillButton title={button.label} tone={button.ready ? "accent" : "white"} disabled={!button.ready || Boolean(busy)} busy={busy === "packed"} onPress={() => void ready()} />
          </>
        )
      }
    >
      {error ? <Notice>{error}</Notice> : null}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: radii.card, padding: 14 }}>
        {view.branding.logoUrl ? (
          <Image source={{ uri: view.branding.logoUrl }} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.grayTint }} contentFit="cover" accessibilityIgnoresInvertColors />
        ) : (
          <View accessibilityElementsHidden importantForAccessibility="no" style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" }}>
            <T style={{ fontFamily: fonts.display, fontSize: 16, color: "#FFFFFF" }}>{sellerInitials(seller)}</T>
          </View>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <T weight="extrabold" style={{ fontSize: 17 }} numberOfLines={1}>{words("pack.for", "For {seller}", { seller })}</T>
          <T style={{ fontSize: 13, color: colors.inkSoft }} numberOfLines={2}>{`${orderItems(order)} · ${pieces === 1 ? words("pack.onePiece", "1 piece") : words("pack.pieces", "{count} pieces", { count: pieces })}`}</T>
        </View>
        {view.branding.skus.length ? (
          <View style={{ backgroundColor: colors.canvas, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5, maxWidth: 110 }}>
            <T weight="bold" style={{ fontFamily: fonts.mono, fontSize: 12 }} numberOfLines={2} selectable>{view.branding.skus.join(", ")}</T>
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Info label={words("pack.goesTo", "GOES TO")} value={goesTo} />
        <Info label={words("pack.pickup", "PICKUP")} value={order.selfDelivery ? words("pack.ownCourier", "You or your courier") : order.pickup?.text ?? words("pack.pickupAfter", "Booked after you pack")} />
        <Info label={words("pack.delivery", "DELIVERY")} value={delivery} />
        <Info label={words("pack.youGet", "YOU GET")} value={youGet} />
      </View>

      <View style={{ gap: 8 }}>
        <T weight="extrabold" style={{ fontSize: 17 }}>{words("pack.way", "Pack it {seller}'s way", { seller })}</T>
        {view.steps.map((step) => {
          const photo = step.id === "photo";
          const done = photo ? Boolean(view.photoUrl) : step.done;
          return (
            <Pressable
              key={step.id}
              accessibilityRole={photo ? "button" : "checkbox"}
              accessibilityState={photo ? { busy: busy === "photo" } : { checked: done, disabled: view.packed }}
              accessibilityLabel={`${step.text}. ${step.detail}`}
              disabled={view.packed || busy === "photo"}
              onPress={() => (photo ? void snap() : void tick(step.id))}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, borderWidth: 1.5, borderColor: done ? colors.success : colors.line, backgroundColor: done ? colors.successTint : colors.surface, opacity: pressed ? 0.85 : 1 })}
            >
              <View style={{ width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: done ? colors.success : colors.lineStrong, backgroundColor: done ? colors.success : colors.surface, alignItems: "center", justifyContent: "center" }}>
                {done ? <AppIcon name="check" size={15} color="#FFFFFF" strokeWidth={3} /> : null}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T weight="bold" style={{ fontSize: 15 }}>{step.text}</T>
                <T style={{ fontSize: 13, color: colors.inkSoft }}>{step.detail}</T>
              </View>
              {photo ? (
                view.photoUrl ? (
                  <Image source={{ uri: view.photoUrl }} style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: colors.grayTint }} contentFit="cover" accessibilityLabel={words("pack.photo", "Photo of the sealed parcel")} />
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.ink, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}>
                    <AppIcon name="camera" size={15} color="#FFFFFF" />
                    <T weight="bold" style={{ fontSize: 13, color: "#FFFFFF" }}>{busy === "photo" ? words("pack.uploading", "Uploading…") : words("pack.snap", "Snap")}</T>
                  </View>
                )
              ) : null}
            </Pressable>
          );
        })}
        {view.photoUrl && !view.packed ? <T accessibilityRole="button" weight="bold" onPress={() => void snap()} style={{ fontSize: 14, color: colors.accentInk, alignSelf: "flex-start", paddingVertical: 4 }}>{words("pack.retake", "Take the photo again")}</T> : null}
      </View>
    </Screen>
  );
}
