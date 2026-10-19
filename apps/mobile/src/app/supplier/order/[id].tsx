import { useEffect, useState } from "react";
import { Alert, Linking, Pressable, Share, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { naira } from "@shared/onboarding";
import { AppIcon, type AppIconName } from "@/components/icons";
import { AcceptCountdown } from "@/components/AcceptCountdown";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { KeyValue, Thumb } from "@/components/partner";
import { Screen } from "@/components/Screen";
import { Card, Chip, Field, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { capitalise } from "@/lib/friendly";
import { useT } from "@/lib/i18n";
import { dayWord } from "@/lib/partner-pure";
import {
  bookPickup,
  cancelPickup,
  fetchPickup,
  fetchSupplierOrder,
  markPacked,
  moveSupplierOrder,
  type DropshipOrder,
  type OrderAction,
  type PickupView,
  type SupplierOrder,
} from "@/lib/supplier";
import { orderKindLabel, supplierOrderGroup, supplierOrderStage } from "@/lib/supplier-pure";
import { useLoad } from "@/lib/useLoad";
import { colors, radii } from "@/theme";

// One supplier order, as a guided flow (build spec 8A): a new order shows what you get and Accept; then "Pack it
// with this label" (print or send it, show it on the phone, or write it by hand) and "I've packed it"; then "When
// can a rider pick it up?" with big choices (the soonest picked) and the pickup address, and "Book the rider". Once
// booked: "Rider booked: pick up today 12–4pm. We'll message you when they're on the way." The time can change or
// the pickup be cancelled until a rider has the job (/api/supplier/orders/[id]/pickup). A new order counts down
// the time left to accept it.
// Screen words are in the app language (m_supplier "order.*"). The parcel label itself (ShopLabel, labelLines) stays
// in English: it goes on the parcel for the rider and the shop's customer, and is shared or printed as is.

type LabelWay = "share" | "phone" | "hand";

// Words in m_supplier "order.way.<key>" ("Show it on my phone", "Write it by hand", …) and "order.way.<key>Hint".
const LABEL_WAYS: { key: LabelWay; icon: AppIconName }[] = [
  { key: "phone", icon: "phone" },
  { key: "share", icon: "printer" },
  { key: "hand", icon: "doc" },
];

function labelLines(order: DropshipOrder) {
  return [
    `From: ${order.label.from}`,
    `To: ${order.label.to}`,
    order.label.phone ? `Phone: ${order.label.phone}` : null,
    ...order.label.address,
    `Order ${order.ref}`,
    order.label.collect > 0 ? `Rider collects ${naira(order.label.collect)}` : null,
  ].filter(Boolean) as string[];
}

/** "12pm – 2pm" for a "Pick a time" start hour. */
function hourWindow(hour: number) {
  const word = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;
  return `${word(hour)} – ${word(hour + 2)}`;
}

function itemsTitle(order: SupplierOrder) {
  return order.kind === "dropship" ? order.items.map((item) => `${item.name}${item.variant ? ` (${item.variant})` : ""}${item.quantity > 1 ? ` ×${item.quantity}` : ""}`).join(", ") : `${order.product.name} ×${order.quantity.toLocaleString("en-NG")}`;
}

function Step({ n, children }: { n: number; children: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" }}>
        <T weight="extrabold" style={{ color: "#FFFFFF", fontSize: 14 }}>{String(n)}</T>
      </View>
      <T style={{ flex: 1, fontSize: 15, lineHeight: 22 }}>{children}</T>
    </View>
  );
}

function ShopLabel({ order, big }: { order: DropshipOrder; big?: boolean }) {
  const size = big ? 20 : 16;
  return (
    <View accessibilityLabel={`Label: ${labelLines(order).join(". ")}`} style={{ backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.ink, borderStyle: "dashed", borderRadius: radii.card, padding: 18, gap: 6 }}>
      <T weight="extrabold" style={{ fontSize: big ? 26 : 20 }}>{order.label.from}</T>
      <T style={{ color: colors.inkSoft, fontSize: 15 }}>Order {order.ref}</T>
      <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 6 }} />
      <T style={{ color: colors.inkSoft, fontSize: 15 }}>To:</T>
      <T weight="extrabold" style={{ fontSize: size + 2 }} selectable>{order.label.to}</T>
      {order.label.address.map((line) => <T key={line} style={{ fontSize: size }} selectable>{line}</T>)}
      {order.label.phone ? (
        <T weight="bold" style={{ fontSize: size, color: colors.forest }} onPress={() => void Linking.openURL(`tel:${order.label.phone}`)} accessibilityRole="link">{order.label.phone}</T>
      ) : null}
      {order.label.collect > 0 ? <T weight="extrabold" style={{ fontSize: size, color: colors.accentInk, marginTop: 6 }}>Rider collects {naira(order.label.collect)}</T> : null}
    </View>
  );
}

export default function SupplierOrderScreen() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind?: string }>();
  const t = useT("m_supplier", "m_partner");
  const orderKind = kind === "wholesale" ? "wholesale" : "dropship";
  const order = useLoad(() => fetchSupplierOrder(orderKind, String(id)), `${orderKind}:${id}`);
  const [busy, setBusy] = useState<OrderAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [way, setWay] = useState<LabelWay>("phone");
  const [riderCode, setRiderCode] = useState("");
  // The rider step: the choices and the booking, loaded once the order is packed.
  const [pickup, setPickup] = useState<PickupView | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [customDay, setCustomDay] = useState<string | null>(null);
  const [customHour, setCustomHour] = useState<number>(12);
  const [address, setAddress] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const data = order.data;

  async function run(current: SupplierOrder, action: OrderAction) {
    setBusy(action);
    setError(null);
    try {
      order.setData(await moveSupplierOrder(current.kind, current.id, action, action === "handed_over" ? riderCode : undefined));
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : t("error.retry"));
    } finally {
      setBusy(null);
    }
  }

  async function packed(current: SupplierOrder) {
    setBusy("packed");
    setError(null);
    try {
      setPickup(await markPacked(current.kind, current.id));
      order.setData(await fetchSupplierOrder(current.kind, current.id));
    } catch (packError) {
      setError(packError instanceof Error ? packError.message : t("error.retry"));
    } finally {
      setBusy(null);
    }
  }

  async function book(current: SupplierOrder, view: PickupView) {
    const key = slot ?? view.preselected;
    setBusy("handed_over");
    setError(null);
    try {
      const next = await bookPickup(current.kind, current.id, {
        slot: key,
        ...(key === "custom" ? { day: customDay ?? view.customDays[0]?.day, startHour: customHour } : {}),
        address: (address ?? view.pickup?.address ?? view.address).trim() || undefined,
      });
      setPickup(next);
      setChanging(false);
    } catch (bookError) {
      setError(bookError instanceof Error ? bookError.message : t("error.retry"));
    } finally {
      setBusy(null);
    }
  }

  function cancelRider(current: SupplierOrder) {
    Alert.alert(t("order.cancelRider"), t("order.cancelRiderBody"), [
      { text: t("keepIt"), style: "cancel" },
      {
        text: t("order.cancelPickup"),
        style: "destructive",
        onPress: () =>
          void cancelPickup(current.kind, current.id)
            .then((next) => {
              setPickup(next);
              setChanging(false);
            })
            .catch((cancelError) => setError(cancelError instanceof Error ? cancelError.message : t("error.short"))),
      },
    ]);
  }

  function cant(current: SupplierOrder) {
    Alert.alert(t("cant.title"), t("cant.body"), [
      { text: t("keepIt"), style: "cancel" },
      { text: t("cant.confirm"), style: "destructive", onPress: () => void run(current, "decline") },
    ]);
  }

  async function shareLabel(current: DropshipOrder) {
    await Share.share({ message: labelLines(current).join("\n") }).catch(() => null);
  }

  // Once it's packed, load the pickup choices (and any rider already booked).
  const readyForRider = Boolean(data && !data.next.includes("packed") && data.next.includes("handed_over"));
  useEffect(() => {
    if (!readyForRider || !data) return;
    let live = true;
    fetchPickup(data.kind, data.id)
      .then((view) => {
        if (live) setPickup(view);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [readyForRider, data?.id, data?.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) {
    return (
      <Screen title={t("order.title")} refreshing={order.refreshing} onRefresh={() => void order.refresh()}>
        {order.loading ? <LoadingBlock /> : null}
        {order.error ? <ErrorState message={order.error} onRetry={() => void order.reload()} /> : null}
      </Screen>
    );
  }

  const group = supplierOrderGroup(data);
  const youGet = data.kind === "dropship" ? data.yourTotal : data.total;
  const area = data.kind === "dropship" ? data.label.address[data.label.address.length - 1] ?? data.label.to : data.address || t("theShop");
  // Where this order is in the flow.
  const stage: "new" | "label" | "rider" | "with-rider" | "finished" =
    group === "new" ? "new" : data.next.includes("packed") ? "label" : data.next.includes("handed_over") ? "rider" : data.next.includes("delivered") ? "with-rider" : "finished";
  const booked = pickup?.pickup && !changing ? pickup.pickup : null;
  const choosing = stage === "rider" && pickup && !booked;
  const chosen = slot ?? pickup?.preselected ?? null;

  const title = stage === "new" ? itemsTitle(data) : stage === "label" ? t("order.packWithLabel") : stage === "rider" ? (booked ? t("order.riderBooked") : t("order.whenPickup")) : supplierOrderStage(data.status, t);

  let footer = null;
  if (stage === "new") {
    footer = (
      <View style={{ gap: 4 }}>
        <PillButton title={t("order.accept")} busy={busy === "accept"} disabled={Boolean(busy)} onPress={() => void run(data, "accept")} />
        <LinkButton title={t("cantThisOne")} color={colors.inkSoft} onPress={() => cant(data)} />
      </View>
    );
  } else if (stage === "label") {
    footer = <PillButton title={t("order.packed")} busy={busy === "packed"} disabled={Boolean(busy)} onPress={() => void packed(data)} />;
  } else if (stage === "rider" && choosing && pickup) {
    footer = <PillButton title={changing ? t("order.saveTime") : t("order.book")} busy={busy === "handed_over"} disabled={Boolean(busy)} onPress={() => void book(data, pickup)} />;
  } else if (stage === "with-rider") {
    footer = <PillButton title={t("order.delivered")} busy={busy === "delivered"} disabled={Boolean(busy)} onPress={() => void run(data, "delivered")} />;
  }

  return (
    <Screen title={title} sub={t("order.sub", { kind: orderKindLabel(data.kind, t), shop: data.shop, day: capitalise(dayWord(data.createdAt, undefined, t)) })} refreshing={order.refreshing} onRefresh={() => void order.refresh()} footer={footer}>
      {error ? <Notice>{error}</Notice> : null}
      {data.rejectReason ? <Notice tone="info">{data.rejectReason.startsWith("Cancelled by the seller") ? data.rejectReason : t("order.saidNo", { reason: data.rejectReason })}</Notice> : null}

      {stage === "new" ? (
        <>
          <AcceptCountdown acceptBy={data.acceptBy} big />
          <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Thumb uri={data.kind === "dropship" ? data.items[0]?.image : data.product.image} size={64} />
            <View style={{ flex: 1 }}>
              <T weight="extrabold" style={{ fontSize: 17 }} numberOfLines={3}>{itemsTitle(data)}</T>
              <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t("order.goingTo", { area })}</T>
            </View>
          </Card>
          <Card style={{ gap: 4 }}>
            <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t("order.youGetAfter")}</T>
            <T weight="extrabold" style={{ fontSize: 30, color: colors.success }}>{naira(youGet)}</T>
          </Card>
          <Card style={{ gap: 12 }}>
            <Step n={1}>{t("order.step1")}</Step>
            <Step n={2}>{data.kind === "dropship" ? t("order.step2Dropship", { shop: data.shop }) : t("order.step2Wholesale")}</Step>
            <Step n={3}>{t("order.step3")}</Step>
          </Card>
          <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>{t("escrow")}</T>
        </>
      ) : null}

      {stage === "label" && data.kind === "dropship" ? (
        <>
          <ShopLabel order={data} big={way === "phone"} />
          <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>{t("order.whiteLabel", { shop: data.shop })}</T>
          <T weight="extrabold" style={{ fontSize: 22, marginTop: 6 }}>{t("order.howLabel")}</T>
          {LABEL_WAYS.map((option) => {
            const on = way === option.key;
            return (
              <Pressable
                key={option.key}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  setWay(option.key);
                  if (option.key === "share") void shareLabel(data);
                }}
                style={{ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 64, padding: 14, borderRadius: radii.card, borderWidth: 2, borderColor: on ? colors.ink : colors.line, backgroundColor: colors.surface }}
              >
                <AppIcon name={option.icon} size={22} />
                <View style={{ flex: 1 }}>
                  <T weight="extrabold" style={{ fontSize: 16 }}>{t(`order.way.${option.key}`)}</T>
                  <T style={{ color: colors.inkSoft, fontSize: 14.5 }}>{t(`order.way.${option.key}Hint`)}</T>
                </View>
              </Pressable>
            );
          })}
          <Card style={{ gap: 6 }}>
            <T weight="extrabold" style={{ fontSize: 16 }}>{t("order.slip")}</T>
            {data.items.map((item, index) => (
              <View key={`${item.name}-${index}`} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Thumb uri={item.image} size={40} />
                <T style={{ flex: 1, fontSize: 15 }}>{item.name}{item.variant ? ` (${item.variant})` : ""}</T>
                <T weight="extrabold" style={{ fontSize: 16 }}>×{item.quantity}</T>
              </View>
            ))}
            {data.mixed ? <T style={{ color: colors.inkSoft, fontSize: 14.5 }}>{t("order.mixed")}</T> : null}
            {data.notes ? <T style={{ color: colors.inkSoft, fontSize: 14.5 }}>{t("order.note", { note: data.notes })}</T> : null}
          </Card>
        </>
      ) : null}

      {stage === "label" && data.kind === "wholesale" ? (
        <>
          <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Thumb uri={data.product.image} size={56} />
            <View style={{ flex: 1 }}>
              <T weight="extrabold" style={{ fontSize: 16 }}>{itemsTitle(data)}</T>
              <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t("each", { price: naira(data.unitPrice) })}</T>
            </View>
          </Card>
          <Card style={{ gap: 4 }}>
            <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t("order.sendTo")}</T>
            <T weight="bold" style={{ fontSize: 16, lineHeight: 22 }} selectable>{data.address || t("order.noAddress")}</T>
            {data.notes ? <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t("order.note", { note: data.notes })}</T> : null}
          </Card>
        </>
      ) : null}

      {stage === "rider" && !pickup ? <LoadingBlock /> : null}

      {choosing && pickup ? (
        <>
          <View accessibilityRole="radiogroup" style={{ gap: 10 }}>
            {[...pickup.slots.map((option) => ({ key: option.key, label: option.label })), { key: "custom", label: t("order.pickTime") }].map((option) => {
              const on = chosen === option.key;
              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => setSlot(option.key)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 64, paddingHorizontal: 16, borderRadius: radii.card, borderWidth: 2, borderColor: on ? colors.ink : colors.line, backgroundColor: colors.surface }}
                >
                  <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: on ? colors.ink : colors.lineStrong, alignItems: "center", justifyContent: "center" }}>
                    {on ? <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.ink }} /> : null}
                  </View>
                  <T weight="extrabold" style={{ fontSize: 17, flex: 1 }}>{option.label}</T>
                </Pressable>
              );
            })}
          </View>
          {chosen === "custom" ? (
            <Card style={{ gap: 10 }}>
              <T weight="bold" style={{ fontSize: 15 }}>{t("order.whichDay")}</T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {pickup.customDays.map((option) => (
                  <Chip key={option.day} label={option.label} on={(customDay ?? pickup.customDays[0]?.day) === option.day} onPress={() => setCustomDay(option.day)} />
                ))}
              </View>
              <T weight="bold" style={{ fontSize: 15 }}>{t("order.whatTime")}</T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {pickup.customHours.map((hour) => (
                  <Chip key={hour} label={hourWindow(hour)} on={customHour === hour} onPress={() => setCustomHour(hour)} />
                ))}
              </View>
            </Card>
          ) : null}
          <View style={{ gap: 6 }}>
            <T weight="bold" style={{ fontSize: 15 }}>{t("order.where")}</T>
            <Field value={address ?? pickup.pickup?.address ?? pickup.address} onChangeText={setAddress} placeholder="Shop 12, Balogun Market, Lagos Island" accessibilityLabel={t("order.pickupAddress")} />
            <T style={{ color: colors.inkSoft, fontSize: 14.5 }}>{pickup.address ? t("order.savedAddress") : t("order.saveAddress")}</T>
          </View>
          {changing ? <LinkButton title={t("order.keepTime")} color={colors.inkSoft} onPress={() => setChanging(false)} /> : null}
        </>
      ) : null}

      {stage === "rider" && booked ? (
        <>
          <Card style={{ alignItems: "center", gap: 10, paddingVertical: 24, backgroundColor: booked.status === "finding_rider" ? "#FDF0D9" : colors.successTint }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
              <AppIcon name={booked.status === "finding_rider" ? "clock" : "truck"} size={34} color={booked.status === "finding_rider" ? "#7A4D06" : colors.success} strokeWidth={2.4} />
            </View>
            <T weight="extrabold" style={{ fontSize: 22, textAlign: "center" }}>{booked.title}</T>
            <T style={{ fontSize: 15, lineHeight: 22, textAlign: "center", color: colors.ink }}>{booked.body}</T>
            <T style={{ fontSize: 14.5, textAlign: "center", color: colors.inkSoft }}>{t("order.from", { address: booked.address })}</T>
          </Card>
          {data.kind === "dropship" ? <ShopLabel order={data} /> : null}
          {booked.changeable ? (
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 16 }}>
              <LinkButton
                title={t("order.changeTime")}
                onPress={() => {
                  setSlot(booked.slotKey === "custom" ? "custom" : null);
                  setAddress(booked.address);
                  setChanging(true);
                }}
              />
              <LinkButton title={t("order.cancelPickup")} color={colors.inkSoft} onPress={() => cancelRider(data)} />
            </View>
          ) : (
            <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21, textAlign: "center" }}>{t("order.riderHasIt", { shop: data.shop })}</T>
          )}
          {moreOpen ? (
            <View style={{ gap: 6 }}>
              <T weight="bold" style={{ fontSize: 15 }}>{t("order.riderCode")}</T>
              <Field value={riderCode} onChangeText={setRiderCode} placeholder={t("order.riderCodeHint")} autoCapitalize="characters" accessibilityLabel={t("order.riderCodeLabel")} />
              <PillButton title={t("order.gaveIt")} tone="white" busy={busy === "handed_over"} disabled={Boolean(busy)} onPress={() => void run(data, "handed_over")} />
            </View>
          ) : (
            <LinkButton title={t("order.alreadyGave")} color={colors.inkSoft} onPress={() => setMoreOpen(true)} />
          )}
        </>
      ) : null}

      {stage === "with-rider" || stage === "finished" ? (
        <Card style={{ gap: 6 }}>
          <T weight="extrabold" style={{ fontSize: 17 }}>{itemsTitle(data)}</T>
          <KeyValue first label={t("youGet")} value={naira(youGet)} />
          <KeyValue label={t("order.whereItIs")} value={supplierOrderStage(data.status, t)} />
          {data.trackingCode ? <KeyValue label={t("order.tracking")} value={data.trackingCode} /> : null}
        </Card>
      ) : null}

      {data.sellerUserId ? <LinkButton title={t("messageShop", { shop: data.shop })} onPress={() => router.push({ pathname: "/supplier/chat/[id]", params: { id: data.sellerUserId!, name: data.shop } })} /> : null}
    </Screen>
  );
}
