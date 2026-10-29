import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { naira } from "@shared/onboarding";
import { AppIcon } from "@/components/icons";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { BoardScreen } from "@/components/Screen";
import { useWords } from "@/components/supplier/DropshipKit";
import { Notice, PillButton, T } from "@/components/ui";
import { orderItems } from "@/components/SupplierOrderRow";
import { packButton, sellerInitials, toggleStep } from "@/lib/dropship-pure";
import { fetchPack, fetchSupplierOrder, savePack, uploadMediaPhoto, type DropshipOrder, type PackView } from "@/lib/supplier";
import { useLoad } from "@/lib/useLoad";
import { colors, fonts, radii } from "@/theme";
import { useT } from "@/lib/i18n";

// Pack it the seller's way (P-Order; the web's PackChecklist on /supplier/orders/[id]), for one dropship order: for
// which shop (their logo or initials, the items, their SKU), where it goes, who picks it up, delivery and what the
// supplier gets (with the branding fee), then the checklist from the server (pack plain, the seller's slip or
// sticker, the order code on the parcel, and "Snap the sealed parcel": the camera, uploaded to the media library,
// POST /api/app/media). "Ready for pickup" stays off ("2 steps left") until every step is ticked and the photo is
// there; then POST /api/supplier/orders/[id]/pack { packed: true } (the server refuses with the step left otherwise).
// The photos decide most disputes (shared/fault-matrix.ts): first "Snap the item in the open box" (what was sent),
// last the sealed parcel. Opened from the order screen ("Pack it {shop}'s way"); a bulk order (kind=wholesale) gets
// only the two photos before "Ready for pickup".

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexBasis: "47%", flexGrow: 1, backgroundColor: colors.surface, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, gap: 3 }}>
      <T weight="extrabold" style={{ fontSize: 11, letterSpacing: 0.55, color: colors.inkSoft }}>{label}</T>
      <T weight="extrabold" style={{ fontSize: 14, lineHeight: 18 }}>{value}</T>
    </View>
  );
}

export default function PackScreen() {
  const { id, kind: kindParam } = useLocalSearchParams<{ id: string; kind?: string }>();
  const kind = kindParam === "wholesale" ? "wholesale" : "dropship";
  const words = useWords();
  const f = useT("m_faults");
  const loaded = useLoad(async () => {
    const [order, pack] = await Promise.all([fetchSupplierOrder(kind, String(id)), fetchPack(String(id), kind)]);
    return { order: order as DropshipOrder, pack };
  }, `${kind}:${String(id)}`);
  const [pack, setPack] = useState<PackView | null>(null);
  const [busy, setBusy] = useState<"step" | "photo" | "contents" | "packed" | null>(null);
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
      setPack(await savePack(view.orderId, { steps }, kind));
    } catch (tickError) {
      setPack(view);
      setError(tickError instanceof Error ? tickError.message : words("pack.failed", "Couldn't save that. Try again."));
    } finally {
      setBusy(null);
    }
  }

  async function snap(which: "photo" | "contents" = "photo") {
    if (!view || busy) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(words("pack.cameraOff", "Camera is off"), words("pack.allowCamera", "Allow the camera in your phone's settings to snap the parcel."));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.6 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setBusy(which);
    setError(null);
    try {
      const url = await uploadMediaPhoto({ uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName, width: asset.width, height: asset.height, fileSize: asset.fileSize });
      setPack(await savePack(view.orderId, which === "contents" ? { contentsPhotoUrl: url } : { photoUrl: url }, kind));
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
      const next = await savePack(view.orderId, { packed: true }, kind);
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
      <BoardScreen title={words("pack.title", "Pack it")} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
        {loaded.loading ? <LoadingBlock /> : null}
        {loaded.error ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      </BoardScreen>
    );
  }

  const seller = view.branding.sellerName;
  const button = packButton(view.steps, view.photoUrl, words);
  const wholesale = kind === "wholesale";
  const goesTo = wholesale ? "" : [order.label.address[order.label.address.length - 1], order.label.to].filter(Boolean)[0] ?? "";
  const pieces = wholesale ? 0 : order.items.reduce((sum, item) => sum + item.quantity, 0);
  const feeWord = view.branding.choice === "stickers" ? words("pack.stickerFee", "sticker fee") : words("pack.slipFee", "slip fee");
  const youGet = view.branding.fee > 0 ? `${naira(order.yourTotal)} + ${naira(view.branding.fee)} ${feeWord}` : naira(order.yourTotal);
  const delivery = order.selfDelivery ? (order.deliveryFee ? words("pack.youDeliver", "You deliver it, +{fee}", { fee: naira(order.deliveryFee) }) : words("pack.youDeliverFree", "You deliver it")) : words("pack.paidByShop", "Paid at checkout, not by you");

  return (
    <BoardScreen
      title={words("pack.order", "Order {ref}", { ref: order.ref })}
      sub={wholesale ? f("pack.wholesaleSub") : order.pickup?.text ? words("pack.sub", "Dropship · {pickup}", { pickup: order.pickup.text.charAt(0).toLowerCase() + order.pickup.text.slice(1) }) : words("pack.subPlain", "Dropship")}
      gap={8}
      // Instant split (Shopinbos never holds the money): paid to the supplier's bank the next working day.
      note={view.packed ? null : f("pack.paidNextDay")}
      refreshing={loaded.refreshing}
      onRefresh={() => {
        setPack(null);
        void loaded.refresh();
      }}
      footer={
        view.packed ? (
          <PillButton title={words("pack.done", "Packed. Back to the order")} tone="white" onPress={() => router.back()} />
        ) : (
          <PillButton title={button.label} tone={button.ready ? "accent" : "white"} disabled={!button.ready || Boolean(busy)} busy={busy === "packed"} onPress={() => void ready()} style={button.ready ? undefined : { backgroundColor: colors.line, borderWidth: 0, opacity: 1 }} />
        )
      }
    >
      {error ? <Notice>{error}</Notice> : null}

      {wholesale ? null : (<>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: radii.card, padding: 12 }}>
        {view.branding.logoUrl ? (
          <Image source={{ uri: view.branding.logoUrl }} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.grayTint }} contentFit="cover" accessibilityIgnoresInvertColors />
        ) : (
          <View accessibilityElementsHidden importantForAccessibility="no" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
            <T style={{ fontFamily: fonts.display, fontSize: 15 }}>{sellerInitials(seller)}</T>
          </View>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <T weight="extrabold" style={{ fontSize: 15 }} numberOfLines={1}>{words("pack.for", "For {seller}", { seller })}</T>
          <T style={{ fontSize: 12, color: colors.inkSoft }} numberOfLines={2}>{`${orderItems(order)} · ${pieces === 1 ? words("pack.onePiece", "1 piece") : words("pack.pieces", "{count} pieces", { count: pieces })}`}</T>
        </View>
        {view.branding.skus.length ? (
          <View style={{ backgroundColor: colors.canvas, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, maxWidth: 110 }}>
            <T weight="extrabold" style={{ fontSize: 11, letterSpacing: 0.3 }} numberOfLines={2} selectable>{view.branding.skus.join(", ")}</T>
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Info label={words("pack.goesTo", "GOES TO")} value={goesTo} />
        <Info label={words("pack.pickup", "PICKUP")} value={order.selfDelivery ? words("pack.ownCourier", "You or your courier") : order.pickup?.text ?? words("pack.pickupAfter", "Booked after you pack")} />
        <Info label={words("pack.delivery", "DELIVERY")} value={delivery} />
        <Info label={words("pack.youGet", "YOU GET")} value={youGet} />
      </View>
      </>)}

      <View style={{ gap: 8 }}>
        <T style={{ fontFamily: fonts.display, fontSize: 17, marginTop: 6 }}>{wholesale ? f("pack.photosTitle") : words("pack.way", "Pack it {seller}'s way", { seller })}</T>
        {view.steps.map((step) => {
          const contents = step.id === "contents";
          const photo = step.id === "photo" || contents;
          const shot = contents ? view.contentsPhotoUrl ?? null : view.photoUrl;
          const done = photo ? Boolean(shot) : step.done;
          return (
            <Pressable
              key={step.id}
              accessibilityRole={photo ? "button" : "checkbox"}
              accessibilityState={photo ? { busy: busy === step.id } : { checked: done, disabled: view.packed }}
              accessibilityLabel={`${step.text}. ${step.detail}`}
              disabled={view.packed || busy === "photo" || busy === "contents"}
              onPress={() => (photo ? void snap(contents ? "contents" : "photo") : void tick(step.id))}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 58, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 })}
            >
              <View style={{ width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: done ? colors.success : "#D9D6E2", backgroundColor: done ? colors.success : colors.surface, alignItems: "center", justifyContent: "center" }}>
                {done ? <AppIcon name="check" size={15} color="#FFFFFF" strokeWidth={3} /> : null}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T weight="bold" style={{ fontSize: 14 }}>{step.text}</T>
                <T style={{ fontSize: 12, color: colors.inkSoft }}>{step.detail}</T>
              </View>
              {photo ? (
                shot ? (
                  <Image source={{ uri: shot }} style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: colors.grayTint }} contentFit="cover" accessibilityLabel={contents ? f("pack.contentsPhoto") : words("pack.photo", "Photo of the sealed parcel")} />
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.ink, borderRadius: 999, paddingHorizontal: 12, height: 34 }}>
                    <AppIcon name="camera" size={15} color="#FFFFFF" />
                    <T weight="extrabold" style={{ fontSize: 12, color: "#FFFFFF" }}>{busy === step.id ? words("pack.uploading", "Uploading…") : words("pack.snap", "Snap")}</T>
                  </View>
                )
              ) : null}
            </Pressable>
          );
        })}
        {view.photoUrl && !view.packed ? <T accessibilityRole="button" weight="bold" onPress={() => void snap("photo")} style={{ fontSize: 14, color: colors.accentInk, alignSelf: "flex-start", paddingVertical: 4 }}>{words("pack.retake", "Take the photo again")}</T> : null}
        <T style={{ fontSize: 12.5, color: colors.inkSoft, lineHeight: 18 }}>{f("pack.why")}</T>
      </View>
    </BoardScreen>
  );
}
