import { useEffect, useState } from "react";
import { Alert, Linking, Pressable, Share, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { naira } from "@shared/onboarding";
import { Eyebrow, Heading, List, Pill, Row, Small, Tile, Timeline, type TimelineStep } from "@/components/design";
import { AcceptCountdown } from "@/components/AcceptCountdown";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Sheet } from "@/components/Sheet";
import { NoteCard, Pic } from "@/components/SupplierKit";
import { orderAmount, orderImage, orderItems } from "@/components/SupplierOrderRow";
import { PreorderPill } from "@/components/Preorder";
import { useWords } from "@/components/supplier/DropshipKit";
import { Chip, Field, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { fetchSupplierTrack } from "@/lib/familiar";
import { useT } from "@/lib/i18n";
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
import { colors, fonts, radii } from "@/theme";

// One supplier order ("Simple app, end to end" supplier prototype): the picture, "{shop} · {amount}", a Dropship
// (orange) or Wholesale (teal) pill with what that means for the parcel, the three steps (Accept the order, Pack
// it, Hand it over), where it goes and who collects it, then a card for where it is now. The buttons follow the
// order: Accept or "I don't have it"; "It's packed, ready for pickup" (and the shop's label for dropship); then
// "When can a rider pick it up?" and "Book the rider" (/api/supplier/orders/[id]/pickup), until the rider comes
// with the pickup code. A new order counts down the time left to accept it.
// A dropship order is packed the seller's way first (Supplier & Dropship Rules): "Pack it {shop}'s way" opens the
// checklist with the sealed-parcel photo (supplier/order/pack, P-Order), which marks it packed when every step is done.
// Screen words are in the app language (m_supplier "order.*"). The parcel label itself stays in English: it goes on
// the parcel for the rider and the shop's customer, and is shared or printed as is.

const DONE_BADLY = ["rejected", "cancelled", "expired", "refunded", "returned"];

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

/** The shop's delivery label (`.label`): which shop's order it is, who it's to, the order number. */
function ShopLabel({ order }: { order: DropshipOrder }) {
  return (
    <View accessibilityLabel={`Label: ${labelLines(order).join(". ")}`} style={{ backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.ink, borderStyle: "dashed", borderRadius: radii.card, padding: 18, gap: 4 }}>
      <Eyebrow>From</Eyebrow>
      <T style={{ fontFamily: fonts.display, fontSize: 24, lineHeight: 28 }}>{order.label.from}</T>
      <Eyebrow style={{ marginTop: 6 }}>To</Eyebrow>
      <T weight="bold" style={{ fontSize: 16 }} selectable>{order.label.to}</T>
      {order.label.address.map((line) => <T key={line} style={{ fontSize: 15 }} selectable>{line}</T>)}
      {order.label.phone ? (
        <T weight="bold" style={{ fontSize: 15, color: colors.forest }} onPress={() => void Linking.openURL(`tel:${order.label.phone}`)} accessibilityRole="link">{order.label.phone}</T>
      ) : null}
      <Small>Order {order.ref}</Small>
      {order.label.collect > 0 ? <T weight="extrabold" style={{ fontSize: 15, color: colors.accentInk, marginTop: 4 }}>Rider collects {naira(order.label.collect)}</T> : null}
    </View>
  );
}

export default function SupplierOrderScreen() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind?: string }>();
  const t = useT("m_supplier", "m_partner", "common");
  const words = useWords();
  const orderKind = kind === "wholesale" ? "wholesale" : "dropship";
  const order = useLoad(() => fetchSupplierOrder(orderKind, String(id)), `${orderKind}:${id}`);
  const [busy, setBusy] = useState<OrderAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [riderCode, setRiderCode] = useState("");
  const [labelOpen, setLabelOpen] = useState(false);
  // The rider step: the choices and the booking, loaded once the order is packed.
  const [pickup, setPickup] = useState<PickupView | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [customDay, setCustomDay] = useState<string | null>(null);
  const [customHour, setCustomHour] = useState<number>(12);
  const [address, setAddress] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // "Track" shows once the tracking route answers for this order (an older server answers 404: no Track).
  const [trackable, setTrackable] = useState(false);
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
  const readyForRider = Boolean(data && !(data.kind === "dropship" && data.selfDelivery) && !data.next.includes("packed") && data.next.includes("handed_over"));

  /** "It's packed, I'm taking it" on an order the supplier delivers: packed (if not yet), then on the way. */
  async function takingIt(current: DropshipOrder) {
    setBusy("handed_over");
    setError(null);
    try {
      if (current.next.includes("packed")) await markPacked(current.kind, current.id).catch(() => null);
      order.setData(await moveSupplierOrder(current.kind, current.id, "handed_over"));
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : t("error.retry"));
    } finally {
      setBusy(null);
    }
  }
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

  // A dropship order with a delivery partner on it (not one the supplier delivers): can it be tracked?
  const withPartner = Boolean(data && data.kind === "dropship" && !data.selfDelivery && (data.pickup || pickup?.pickup));
  useEffect(() => {
    if (!withPartner || !data) return;
    let live = true;
    fetchSupplierTrack(data.id, "dropship")
      .then((view) => {
        if (live) setTrackable(Boolean(view));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [withPartner, data?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) {
    return (
      <Screen title={t("order.title")} refreshing={order.refreshing} onRefresh={() => void order.refresh()}>
        {order.loading ? <LoadingBlock /> : null}
        {order.error ? <ErrorState message={order.error} onRetry={() => void order.reload()} /> : null}
      </Screen>
    );
  }

  const group = supplierOrderGroup(data);
  const dropship = data.kind === "dropship";
  // Where this order is in the flow.
  const stage: "new" | "label" | "rider" | "with-rider" | "finished" =
    group === "new" ? "new" : data.next.includes("packed") ? "label" : data.next.includes("handed_over") ? "rider" : data.next.includes("delivered") ? "with-rider" : "finished";
  const booked = pickup?.pickup && !changing ? pickup.pickup : null;
  const choosing = stage === "rider" && pickup && !booked;
  const chosen = slot ?? pickup?.preselected ?? null;
  const badEnd = stage === "finished" && DONE_BADLY.includes(data.status);
  const partner = pickup?.pickup?.partner ?? null;
  // The supplier delivers this one themselves: no rider to book; the customer's code confirms delivery.
  const self = data.kind === "dropship" && data.selfDelivery === true ? data : null;
  const fee = self?.deliveryFee ? `+${naira(self.deliveryFee)}` : null;

  const state = (index: number): TimelineStep["state"] => {
    const now = stage === "new" ? 0 : stage === "label" ? 1 : stage === "rider" ? 2 : 3;
    return index < now ? "done" : index === now ? "now" : "todo";
  };
  const steps: TimelineStep[] = [
    { label: t("order.tlAccept"), at: t("order.tlAcceptSub"), state: state(0) },
    { label: t("order.tlPack"), at: state(1) === "done" ? t("order.packed") : dropship ? t("order.tlPackDropship") : t("order.tlPackWholesale"), state: state(1) },
    { label: t("order.tlHand"), at: self ? t("order.ownDelivery") : pickup?.pickup?.partner ?? t("order.tlHandSub"), state: state(2) },
  ];
  const goesTo = dropship ? [data.label.to, data.label.address[data.label.address.length - 1]].filter(Boolean).join(", ") : data.address || t("order.noAddress");

  let footer = null;
  if (stage === "new") {
    footer = (
      <>
        <PillButton title={t("order.accept")} tone="accent" busy={busy === "accept"} disabled={Boolean(busy)} onPress={() => void run(data, "accept")} />
        <PillButton title={t("order.dontHave")} tone="white" disabled={Boolean(busy)} onPress={() => cant(data)} />
      </>
    );
  } else if (dropship && stage === "label") {
    // Pack it the seller's way: the checklist and the sealed-parcel photo, then it's packed.
    footer = (
      <>
        <PillButton title={words("pack.cta", "Pack it {shop}'s way", { shop: data.shop })} tone="accent" icon="box" onPress={() => router.push({ pathname: "/supplier/order/pack", params: { id: data.id } })} />
        <PillButton title={t("order.seeLabel")} tone="white" onPress={() => setLabelOpen(true)} />
      </>
    );
  } else if (self && (stage === "label" || stage === "rider")) {
    footer = (
      <>
        <PillButton title={t("order.takingIt")} tone="accent" busy={busy === "handed_over"} disabled={Boolean(busy)} onPress={() => void takingIt(self)} />
        <PillButton title={t("order.seeLabel")} tone="white" onPress={() => setLabelOpen(true)} />
      </>
    );
  } else if (self && stage === "with-rider") {
    footer = <PillButton title={t("order.enterCode")} tone="accent" onPress={() => router.push({ pathname: "/supplier/order/code", params: { id: self.id } })} />;
  } else if (stage === "label") {
    footer = (
      <>
        <PillButton title={t("order.packedReady")} tone="accent" busy={busy === "packed"} disabled={Boolean(busy)} onPress={() => void packed(data)} />
        {dropship ? <PillButton title={t("order.seeLabel")} tone="white" onPress={() => setLabelOpen(true)} /> : null}
      </>
    );
  } else if (stage === "rider" && choosing && pickup) {
    footer = <PillButton title={changing ? t("order.saveTime") : t("order.book")} tone="accent" busy={busy === "handed_over"} disabled={Boolean(busy)} onPress={() => void book(data, pickup)} />;
  } else if (stage === "rider" && dropship) {
    footer = <PillButton title={t("order.seeLabel")} tone="white" onPress={() => setLabelOpen(true)} />;
  } else if (stage === "with-rider") {
    footer = <PillButton title={t("order.delivered")} tone="white" busy={busy === "delivered"} disabled={Boolean(busy)} onPress={() => void run(data, "delivered")} />;
  }

  return (
    <Screen title={data.ref} refreshing={order.refreshing} onRefresh={() => void order.refresh()} footer={footer}>
      {error ? <Notice>{error}</Notice> : null}
      {data.rejectReason ? <Notice tone="info">{data.rejectReason.startsWith("Cancelled by the seller") ? data.rejectReason : t("order.saidNo", { reason: data.rejectReason })}</Notice> : null}

      <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
        <Pic uri={orderImage(data)} size={72} radius={18} />
        <View style={{ flex: 1, gap: 3 }}>
          <T weight="extrabold" style={{ fontSize: 20, lineHeight: 25 }} numberOfLines={3}>{orderItems(data)}</T>
          <T style={{ fontSize: 14, color: colors.inkSoft }}>{data.shop} · {naira(orderAmount(data))}</T>
        </View>
      </View>

      {/* The pills on one line (wrapping when they must), and the note under them at full width. */}
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <Pill label={data.kind === "wholesale" && data.sample ? t("kind.sample") : orderKindLabel(data.kind, t)} tone={dropship ? "org" : "teal"} />
          {data.kind === "wholesale" && data.paidAt ? <Pill label={t("order.paidInApp")} tone="ok" icon="check" /> : null}
          <PreorderPill preorder={data.preorder} />
        </View>
        <Small>{dropship ? t("order.kindNoteDropship") : t("order.kindNoteWholesale")}</Small>
      </View>

      {stage === "new" ? <AcceptCountdown acceptBy={data.acceptBy} big /> : null}

      {badEnd ? null : (
        <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 18 }}>
          <Timeline steps={steps} />
        </View>
      )}

      <List>
        <Row lead={<Tile icon="pin" tone="gray" />} title={t("order.goesTo")} sub={goesTo} />
        {self ? (
          <Row lead={<Tile icon="truck" tone="peach" />} title={t("order.ownDelivery")} sub={fee ? t("order.youDeliverFee", { fee }) : t("order.youDeliver")} />
        ) : (
          <Row lead={<Tile icon="truck" tone="mint" />} title={partner ?? t("order.deliveryPartner")} sub={pickup?.pickup?.text ?? data.pickup?.text ?? t("order.bookedOnce")} />
        )}
        {trackable ? (
          <Row
            lead={<Tile icon="route" tone="sky" />}
            title={t("track.button")}
            sub={t("track.buttonSub")}
            onPress={() => router.push({ pathname: "/supplier/order/track", params: { id: data.id, kind: data.kind, shop: data.shop, ref: data.ref } })}
          />
        ) : null}
      </List>

      {stage === "label" && dropship ? (
        <View style={{ gap: 10 }}>
          <Eyebrow>{t("order.slip")}</Eyebrow>
          <List>
            {data.items.map((item, index) => (
              <Row key={`${item.name}-${index}`} lead={<Pic uri={item.image} size={44} radius={12} />} title={`${item.name}${item.variant ? ` (${item.variant})` : ""}`} right={<T weight="extrabold" style={{ fontSize: 16 }}>×{item.quantity}</T>} />
            ))}
          </List>
          {data.mixed ? <Small>{t("order.mixed")}</Small> : null}
          {data.notes ? <Small>{t("order.note", { note: data.notes })}</Small> : null}
        </View>
      ) : null}
      {stage === "label" && !dropship && data.notes ? <Small>{t("order.note", { note: data.notes })}</Small> : null}

      {self && (stage === "rider" || stage === "with-rider") ? (
        <NoteCard tone="peach" title={t("order.selfTitle")}>{t("order.selfBody")}</NoteCard>
      ) : null}

      {stage === "rider" && !pickup && !self ? <LoadingBlock /> : null}

      {choosing && pickup ? (
        <>
          <Heading>{t("order.whenPickup")}</Heading>
          <View accessibilityRole="radiogroup" style={{ gap: 10 }}>
            {[...pickup.slots.map((option) => ({ key: option.key, label: option.label })), { key: "custom", label: t("order.pickTime") }].map((option) => {
              const on = chosen === option.key;
              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => setSlot(option.key)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 64, paddingHorizontal: 16, borderRadius: 20, borderWidth: on ? 2.5 : 1.5, borderColor: on ? colors.ink : colors.line, backgroundColor: colors.surface }}
                >
                  <T weight="bold" style={{ fontSize: 16, flex: 1 }}>{option.label}</T>
                  <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: on ? colors.ink : colors.lineStrong, backgroundColor: on ? colors.ink : "transparent", alignItems: "center", justifyContent: "center" }}>
                    {on ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#FFFFFF" }} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
          {chosen === "custom" ? (
            <View style={{ gap: 10 }}>
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
            </View>
          ) : null}
          <View style={{ gap: 6 }}>
            <T weight="bold" style={{ fontSize: 15 }}>{t("order.where")}</T>
            <Field value={address ?? pickup.pickup?.address ?? pickup.address} onChangeText={setAddress} placeholder="Shop 12, Balogun Market, Lagos Island" accessibilityLabel={t("order.pickupAddress")} />
            <Small>{pickup.address ? t("order.savedAddress") : t("order.saveAddress")}</Small>
          </View>
          {changing ? <LinkButton title={t("order.keepTime")} color={colors.inkSoft} onPress={() => setChanging(false)} /> : null}
        </>
      ) : null}

      {stage === "rider" && booked ? (
        <>
          {booked.status === "finding_rider" ? (
            <NoteCard tone="warn" title={booked.title}>{booked.body}</NoteCard>
          ) : (
            <NoteCard tone="mint" title={booked.rider ? t("order.riderComing", { rider: booked.partner ? t("order.riderFrom", { rider: booked.rider, partner: booked.partner }) : booked.rider }) : booked.title}>
              {booked.pickupCode ? (
                <T style={{ fontSize: 16, lineHeight: 24, color: colors.forest }}>
                  {t("order.codeLine")} <T weight="extrabold" style={{ fontSize: 16, color: colors.forest }}>{booked.pickupCode}</T>
                </T>
              ) : (
                <T style={{ fontSize: 16, lineHeight: 24, color: colors.forest }}>{booked.body}</T>
              )}
            </NoteCard>
          )}
          <Small>{t("order.from", { address: booked.address })}</Small>
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
            <Small style={{ textAlign: "center" }}>{t("order.riderHasIt", { shop: data.shop })}</Small>
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

      {stage === "with-rider" && !self ? (
        <NoteCard tone="ok" title={t("order.onItsWay")}>
          <T style={{ fontSize: 16, lineHeight: 24, color: colors.inkSoft }}>{t("order.paidOnce")}</T>
          {data.trackingCode ? <Small>{t("order.tracking")}: {data.trackingCode}</Small> : null}
        </NoteCard>
      ) : null}
      {stage === "finished" ? <NoteCard tone={badEnd ? "gray" : "ok"} title={supplierOrderStage(data.status, t)}>{badEnd ? undefined : t("order.paidOnce")}</NoteCard> : null}

      {data.sellerUserId ? <LinkButton title={t("messageShop", { shop: data.shop })} onPress={() => router.push({ pathname: "/supplier/chat/[id]", params: { id: data.sellerUserId!, name: data.shop } })} /> : null}

      {dropship ? (
        <Sheet visible={labelOpen} onClose={() => setLabelOpen(false)} title={t("label.title")}>
          <T style={{ fontSize: 16, lineHeight: 24, color: colors.inkSoft, marginTop: -6 }}>{t("label.sub")}</T>
          <ShopLabel order={data} />
          <View style={{ gap: 10, marginTop: 6 }}>
            <PillButton title={t("label.print")} onPress={() => void shareLabel(data)} />
            <PillButton title={t("done")} tone="white" onPress={() => setLabelOpen(false)} />
          </View>
        </Sheet>
      ) : null}
    </Screen>
  );
}
