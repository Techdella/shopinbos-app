import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Share, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { naira } from "@shared/onboarding";
import { CHANNEL_LABEL, type OrderChannel } from "@shared/channels";
import { PAYMENT_METHOD_LABEL } from "@shared/sales";
import { Banner, List, Pill, Row, Small, Tile, Timeline, type PillTone, type TimelineStep } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { Card, LinkButton, Notice, PillButton, Segmented, T } from "@/components/ui";
import { capitalise, friendlyTime } from "@/lib/friendly";
import { Screen } from "@/components/Screen";
import { ChoiceRow, Sheet } from "@/components/Sheet";
import { Thumb } from "@/components/seller/bits";
import { CodeBadge } from "@/components/seller/ProductCode";
import { PreorderPill } from "@/components/Preorder";
import { RateParcels } from "@/components/RateSupplier";
import { TONE_COLORS, type Tone } from "@/lib/dashboard";
import { fetchOrderDelivery, fetchReassignOptions, jobAction, openPartnerChat, type OrderDelivery, type Parcel, type ReassignOption } from "@/lib/delivery";
import { daysWords, ownTimeline, timelineStates, timelineWordKey, whatsappNumber } from "@/lib/delivery-pure";
import { cancelAndRefund, fetchOrder, undoSupplierSwitch, updateOrder, type OrderDetail, type OrderPart, type OrderParts } from "@/lib/orders";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// One order ("Seller app" prototype `on.order`): the item, customer, total and when; Paid / Pay on delivery and
// where it is; what needs the seller (a partner declined → send it to another partner; ready → the partner is
// coming, hand it over for the code); how it's delivered, the customer and Call or WhatsApp; the timeline; and one
// main button for the next step. Delivery comes from GET /api/mobile/delivery/orders/[id] (the logistics
// marketplace); orders without a partner keep the older steps (mark paid, get a rider, sent it myself, delivered).
// Supplier parcels, switching or refunding when a supplier didn't accept, the label, items and cancelling stay.
// A preordered order shows a "Preorder · 12 Dec" pill (the earliest ship date), and so does each preorder line.

type PaidWith = "transfer" | "cash" | "pos";

const PILL_TONE: Record<Tone, PillTone> = { accent: "org", success: "ok", warning: "warn", muted: "gray", danger: "org" };

function Badge({ label, tone }: { label: string; tone: keyof typeof TONE_COLORS }) {
  return (
    <View style={{ backgroundColor: TONE_COLORS[tone].bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
      <T weight="bold" style={{ fontSize: 14, color: TONE_COLORS[tone].fg }}>{label}</T>
    </View>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 }}>
      <T style={{ color: strong ? colors.ink : colors.inkSoft }} weight={strong ? "extrabold" : "regular"}>{label}</T>
      <T weight={strong ? "extrabold" : "semibold"}>{value}</T>
    </View>
  );
}

const PART_TONE: Record<OrderPart["state"], keyof typeof TONE_COLORS> = { waiting: "muted", preparing: "warning", sent: "accent", delivered: "success", problem: "danger" };

/** "2 of 3 parcels sent" and where each supplier parcel is. */
function Parcels({ parts }: { parts: OrderParts }) {
  const t = useT("m_orders");
  return (
    <Card style={{ gap: 8, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 20 }}>
      <T weight="extrabold" style={{ fontSize: 20 }}>{parts.line ?? t("order.sentBySupplier")}</T>
      {parts.parts.map((part) => (
        <View key={part.key} style={{ gap: 4, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.line }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
            <T weight="bold">{part.kind === "own" ? t("order.yourPart") : part.name}</T>
            <Badge label={part.label} tone={PART_TONE[part.state] ?? "muted"} />
          </View>
          <T style={{ color: colors.inkSoft, fontSize: 15 }}>{part.items}</T>
          {part.trackingCode ? <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t("order.riderCode", { code: part.trackingCode })}</T> : null}
        </View>
      ))}
    </Card>
  );
}

const CLOSED = ["delivered", "cancelled", "refunded", "returned", "partially_refunded"];

export default function OrderScreen() {
  const t = useT("m_orders", "delivery", "m_ui", "common");
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [delivery, setDelivery] = useState<OrderDelivery | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [paidWith, setPaidWith] = useState<PaidWith>("transfer");
  const [refreshing, setRefreshing] = useState(false);
  const [confirmRefund, setConfirmRefund] = useState(false);
  const [contact, setContact] = useState(false);
  const [reassign, setReassign] = useState<Parcel | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [problem, setProblem] = useState(false);

  const load = useCallback(async () => {
    try {
      const [next, plan] = await Promise.all([fetchOrder(id), fetchOrderDelivery(id).catch(() => null)]);
      setOrder(next);
      setDelivery(plan);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("order.loadFailed"));
    }
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function change(status: string, extra: { paymentMethod?: string; logisticsType?: "personal" } = {}) {
    setBusy(status);
    setError(null);
    try {
      setOrder(await updateOrder(id, { status, ...extra }));
      void fetchOrderDelivery(id).then(setDelivery).catch(() => null);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : t("saveFailed"));
    } finally {
      setBusy(null);
    }
  }

  /** A delivery job: it's packed (the partner can collect it), or the shop got the pay-on-delivery cash. */
  async function onJob(jobId: string, action: "ready" | "cash_received") {
    setBusy(action);
    setError(null);
    try {
      await jobAction(jobId, { action });
      setSaved(action === "ready" ? t("flash.markedReady") : t("flash.cashConfirmed"));
      await load();
    } catch (jobError) {
      setError(jobError instanceof Error ? jobError.message : t("saveFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function undo(supplierOrderId: string) {
    setBusy("undo");
    setError(null);
    try {
      setOrder(await undoSupplierSwitch(id, supplierOrderId));
      setSaved(t("order.undone"));
    } catch (undoError) {
      setError(undoError instanceof Error ? undoError.message : t("saveFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function refund() {
    setBusy("refund");
    setError(null);
    try {
      const result = await cancelAndRefund(id);
      setOrder(result);
      setSaved(result.message);
      setConfirmRefund(false);
    } catch (refundError) {
      setError(refundError instanceof Error ? refundError.message : t("saveFailed"));
      setConfirmRefund(false);
    } finally {
      setBusy(null);
    }
  }

  function confirmCancel() {
    Alert.alert(t("order.cancelTitle"), t("order.cancelBody"), [
      { text: t("order.keepIt"), style: "cancel" },
      { text: t("order.cancelOrder"), style: "destructive", onPress: () => void change("cancelled") },
    ]);
  }

  if (!order) {
    return (
      <Screen title={t("order.title")}>
        {error ? <Notice>{error}</Notice> : <T style={{ color: colors.inkSoft }}>{t("loading")}</T>}
      </Screen>
    );
  }

  const unpaid = order.status === "pending" || order.status === "awaiting_payment";
  // Orders a supplier sends: the seller only sends their own part (if any). Parcels are tracked one by one.
  const parts = order.parts ?? null;
  const ownPart = parts?.parts.find((part) => part.kind === "own") ?? null;
  const sellerSends = !parts || ownPart?.state === "waiting";
  // The logistics marketplace: parcels a connected partner carries, or the customer picks up from the shop.
  const plan = delivery?.plan ?? null;
  const parcels = (delivery?.parcels ?? []).filter((parcel) => parcel.partner);
  const partnerPlan = parcels.length > 0;
  const selfPickup = plan?.kind === "self_pickup";
  const toSend = ["paid", "processing", "packed"].includes(order.status) && sellerSends && !partnerPlan && !selfPickup;
  const deciding = parts?.problems.find((problem) => problem.needsChoice && problem.status === "expired") ?? null;
  const switches = parts?.problems.filter((problem) => problem.switched) ?? [];
  const address = order.deliveryAddress && order.deliveryAddress.street ? [order.deliveryAddress.street, order.deliveryAddress.city, order.deliveryAddress.state].filter(Boolean).join(", ") : null;
  const phone = order.buyerPhone;
  const firstName = order.buyerName.split(" ")[0];
  const reminder = t("order.reminder", { name: firstName, number: order.orderNumber, total: naira(order.total) });
  const first = order.items[0];
  const item = first ? (order.items.length > 1 ? t("order2.itemMore", { name: first.name, count: order.items.length - 1 }) : first.name) : order.row.summary;

  const needsPartner = parcels.find((parcel) => parcel.canReassign && parcel.job) ?? null;
  const toReady = parcels.find((parcel) => parcel.job?.status === "confirmed" && !parcel.job.readyAt) ?? null;
  const cashToConfirm = plan?.pod ? parcels.find((parcel) => parcel.job?.codRemittedAt && !parcel.job.codConfirmedAt) ?? null : null;
  const live = !CLOSED.includes(order.status);

  // Where it is: a partner problem first, then the partner's status, else the order's own stage.
  const lead = parcels[0];
  const statusWords = needsPartner
    ? t("order2.needsPartner")
    : lead?.job
      ? t.dynamic(`status.${lead.job.status}`, lead.job.status.replace(/_/g, " "))
      : order.row.stage.label;

  // Where it goes: the customer's town, or the shop when they pick it up.
  const trackTo = selfPickup ? t("track.pickup") : [order.deliveryAddress?.city, order.deliveryAddress?.state].filter(Boolean).join(", ") || order.buyerName;

  // The timeline: each partner parcel's steps, the plan's own steps (pick up / the shop's delivery), else the order's.
  const timelines: Array<{ key: string; title: string | null; steps: TimelineStep[] }> = partnerPlan
    ? parcels.map((parcel) => ({
        key: parcel.shipmentKey,
        title: parcels.length > 1 ? parcel.partner?.name ?? null : null,
        steps: timelineStates(parcel.timeline).map((step) => ({ label: t.dynamic(timelineWordKey(step.key, plan?.kind ?? null, parcel.service), step.label), at: step.at ? capitalise(friendlyTime(step.at, new Date(), t)) : null, state: step.state })),
      }))
    : delivery?.timeline?.length
      ? [{ key: "plan", title: null, steps: timelineStates(delivery.timeline).map((step) => ({ label: t.dynamic(timelineWordKey(step.key, plan?.kind ?? null, null), step.label), at: step.at ? capitalise(friendlyTime(step.at, new Date(), t)) : null, state: step.state })) }]
      : [{ key: "own", title: null, steps: timelineStates(ownTimeline(order)).map((step) => ({ label: t(`tl.${step.key as "placed" | "paid" | "sent" | "delivered"}`), at: step.at ? capitalise(friendlyTime(step.at, new Date(), t)) : null, state: step.state })) }];

  // One main button at the bottom: the next thing to do with this order. Everything else is a link.
  const footer = deciding ? null : unpaid ? (
    <PillButton title={t("order.markPaid")} busy={busy === "paid"} onPress={() => void change("paid", { paymentMethod: paidWith })} />
  ) : needsPartner ? (
    <PillButton tone="accent" accessibilityLabel={t("order2.sendAnother")} onPress={() => setReassign(needsPartner)} icon="truck" title={t("order2.sendAnother")} />
  ) : toReady?.job ? (
    <PillButton tone="accent" busy={busy === "ready"} accessibilityLabel={t("order2.packed")} onPress={() => void onJob(toReady.job!.id, "ready")} icon="box" title={t("order2.packed")} />
  ) : selfPickup && live ? (
    order.status === "packed" ? (
      <PillButton busy={busy === "delivered"} accessibilityLabel={t("order2.collected")} onPress={() => void change("delivered")} icon="check" title={t("order2.collected")} />
    ) : (
      <PillButton tone="accent" busy={busy === "packed"} accessibilityLabel={t("order2.readyTell")} onPress={() => void change("packed")} icon="check" title={t("order2.readyTell")} />
    )
  ) : toSend ? (
    <PillButton title={t("order.getRider")} onPress={() => router.push("/delivery/find" as never)} />
  ) : order.status === "shipped" && !partnerPlan && (!ownPart || ownPart.state !== "delivered") ? (
    <PillButton title={t("order.delivered")} busy={busy === "delivered"} onPress={() => void change("delivered")} />
  ) : null;

  return (
    <Screen title={order.orderNumber} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} footer={footer}>
      {/* The item, who and how much */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Thumb uri={first?.image} size={72} radius={18} fallback={order.buyerName} />
        <View style={{ flex: 1, gap: 3 }}>
          <T weight="bold" style={{ fontSize: 20, lineHeight: 25 }} numberOfLines={2} accessibilityRole="header">{item}</T>
          <T style={{ fontSize: 14, lineHeight: 19, color: colors.inkSoft }}>{`${order.buyerName} · ${naira(order.total)} · ${capitalise(friendlyTime(order.createdAt, new Date(), t))}`}</T>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Pill label={plan?.pod ? t("order2.pod") : order.row.payment.label} tone={plan?.pod ? "warn" : PILL_TONE[order.row.payment.tone]} />
        <Pill label={statusWords} tone="gray" />
        <PreorderPill preorder={order.preorder ?? (order.items.some((line) => line.preorder) ? { shipsOn: order.items.find((line) => line.preorder)?.shipsOn ?? null } : null)} />
      </View>
      {error && <Notice>{error}</Notice>}
      {saved && !error && <Notice tone="success">{saved}</Notice>}

      {/* Partner deliveries that need the shop: declined, not taken in time, or a failed attempt / return. */}
      {parcels.map((parcel) => {
        const name = parcel.partner?.name ?? "";
        if (parcel.exception === "declined") {
          return (
            <Banner key={`x-${parcel.shipmentKey}`} tone="warn" title={t("order2.declinedTitle", { name })}>
              {t("order2.declinedBody", { reason: parcel.job?.declineReason || t("decline.none") })}
            </Banner>
          );
        }
        if (parcel.exception) {
          return (
            <Banner key={`x-${parcel.shipmentKey}`} tone="warn" title={t.dynamic(`exception.${parcel.exception}`, parcel.exception)}>
              {parcel.canReassign ? t("order2.reassignBody") : parcel.job?.failedReason || t.dynamic(`exception.${parcel.exception}`, parcel.exception)}
            </Banner>
          );
        }
        if (parcel.job?.status === "confirmed" && parcel.job.readyAt) {
          const code = parcel.job.pickupCode;
          return (
            <Banner key={`r-${parcel.shipmentKey}`} tone="mint" title={t("order2.comingTitle", { name })}>
              {code ? (
                <T style={{ fontSize: 15, lineHeight: 21, color: colors.forest }}>
                  {t("order2.handover")} <T weight="extrabold" style={{ fontSize: 17, color: colors.forest, letterSpacing: 1 }}>{code}</T>
                </T>
              ) : (
                <T style={{ fontSize: 15, lineHeight: 21, color: colors.forest }}>{t("order2.handoverNoCode")}</T>
              )}
            </Banner>
          );
        }
        return null;
      })}

      {/* A supplier didn't accept in time: we sent it to someone else (Undo until they accept)… */}
      {switches.map((problem) => (
        <Card key={problem.supplierOrderId} style={{ gap: 6, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 20 }}>
          <T weight="extrabold" style={{ fontSize: 20 }}>{t("order.notAccepted", { name: problem.supplierName })}</T>
          <T style={{ fontSize: 15, lineHeight: 22 }}>{t("order.sentTo", { name: problem.switched!.toName })} {problem.switched!.costWords}</T>
          <T style={{ color: colors.inkSoft, fontSize: 15 }}>{problem.items}</T>
          {problem.switched!.canUndo ? (
            <LinkButton title={busy === "undo" ? t("order.undoing") : t("order.undo")} color={colors.danger} onPress={() => void undo(problem.switched!.toSupplierOrderId)} />
          ) : problem.switched!.accepted ? (
            <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t("order.accepted", { name: problem.switched!.toName })}</T>
          ) : null}
        </Card>
      ))}

      {/* …or the seller chooses: find another supplier, or cancel and refund the customer. */}
      {deciding && (
        <Card style={{ gap: 10, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 20 }}>
          <T weight="extrabold" style={{ fontSize: 20 }}>{t("order.notAccepted", { name: deciding.supplierName })}</T>
          <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 22 }}>{t("order.decide", { items: deciding.items })}</T>
          <ChoiceRow icon="search" title={t("order.findAnother")} sub={t("order.findAnotherSub")} tint={colors.successTint} onPress={() => router.push({ pathname: "/find", params: { q: deciding.searchQuery } })} />
          {parts?.canCancelAndRefund && <ChoiceRow icon="wallet" title={t("order.refund")} sub={t("order.refundSub")} onPress={() => setConfirmRefund(true)} />}
        </Card>
      )}

      {/* How it's delivered, the customer, and how to reach them */}
      <List>
        {partnerPlan ? (
          parcels.map((parcel) => (
            <Row
              key={parcel.shipmentKey}
              lead={<Tile icon="truck" tone="mint" />}
              title={`${t.dynamic(`service.${parcel.service}`, parcel.service)} · ${parcel.fee ? naira(parcel.fee) : t("order.free")}`}
              sub={[parcel.partner?.name, parcel.job?.rider ? t("order2.rider", { name: parcel.job.rider }) : null].filter(Boolean).join(" · ")}
            />
          ))
        ) : (
          <Row
            lead={<Tile icon="truck" tone="mint" />}
            title={`${selfPickup ? t("order2.howPickup") : t("order.delivery")} · ${order.shippingFee ? naira(order.shippingFee) : t("order.free")}`}
            sub={selfPickup ? t("order2.pickupSub") : order.trackingCode ? t("order.riderCode", { code: order.trackingCode }) : undefined}
          />
        )}
        <Row lead={<Tile icon="pin" tone="gray" />} title={order.buyerName} sub={[selfPickup ? null : address ?? t("order2.noAddress"), order.buyerEmail || null, order.notes ? t("order.note", { note: order.notes }) : null].filter(Boolean).join("\n") || undefined} />
        {phone ? <Row lead={<Tile icon="phone" tone="gray" />} title={t("order2.callOrWhatsApp")} sub={phone} onPress={() => setContact(true)} /> : null}
      </List>

      {plan?.pod ? <Small>{t("order2.podNote")}</Small> : null}
      {cashToConfirm?.job ? (
        <PillButton tone="white" busy={busy === "cash_received"} title={t("order2.gotCash", { name: cashToConfirm.partner?.name ?? "" })} onPress={() => void onJob(cashToConfirm.job!.id, "cash_received")} />
      ) : null}

      {/* What to do now (orders without a delivery partner) */}
      {unpaid && (
        <Card style={{ gap: 10, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 20 }}>
          <T weight="extrabold" style={{ fontSize: 20 }}>{t("order.howPaid")}</T>
          <Segmented<PaidWith> options={[{ value: "transfer", label: t("order.paidTransfer") }, { value: "cash", label: t("order.paidCash") }, { value: "pos", label: t("order.paidPos") }]} value={paidWith} onChange={setPaidWith} />
          {phone && <LinkButton title={t("order.remind")} color={colors.forest} onPress={() => void Linking.openURL(`https://wa.me/${whatsappNumber(phone)}?text=${encodeURIComponent(reminder)}`)} />}
        </Card>
      )}
      {toSend && (
        <Card style={{ gap: 6, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 20 }}>
          <T weight="extrabold" style={{ fontSize: 20 }}>{t("order.send")}</T>
          <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 22 }}>{t("order.sendBody", { name: firstName })}</T>
          <LinkButton title={busy === "shipped" ? t("saving") : t("order.sentMyself")} onPress={() => void change("shipped", { logisticsType: "personal" })} />
          <LinkButton title={t("order.printLabel")} color={colors.inkSoft} onPress={() => router.push({ pathname: "/order/label", params: { id: order.id } })} />
        </Card>
      )}
      {order.status === "shipped" && !partnerPlan && (
        <Card style={{ gap: 6, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 20 }}>
          <T weight="extrabold" style={{ fontSize: 20 }}>{t("order.onTheWay")}</T>
          {order.trackingCode ? <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t("order.riderCode", { code: order.trackingCode })}</T> : null}
          <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t("order.tapWhen", { name: firstName })}</T>
        </Card>
      )}

      {parts && parts.parts.length > 0 && <Parcels parts={parts} />}

      {/* Track ("Familiar app" prototype `track`): where it is, from → to, the partner and their estimate, the
          timeline, Call the partner, Report a problem and Share tracking (the customer's own order page). No map, and
          never the rider's location. */}
      <View testID="order-track" style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 20, gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <T weight="extrabold" style={{ flex: 1, fontSize: 20 }} accessibilityRole="header">{t("track.title")}</T>
          <Pill label={statusWords} tone={order.status === "delivered" ? "ok" : needsPartner ? "warn" : "teal"} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }} accessible accessibilityLabel={t("track.fromTo", { from: t("track.yourShop"), to: trackTo })}>
          <View style={{ flex: 1 }}>
            <Small>{t("track.from")}</Small>
            <T weight="bold" numberOfLines={1}>{t("track.yourShop")}</T>
          </View>
          <AppIcon name="route" size={20} color={colors.inkSoft} />
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <Small>{t("track.to")}</Small>
            <T weight="bold" numberOfLines={1}>{trackTo}</T>
          </View>
        </View>
        {lead?.partner ? <T style={{ fontSize: 15, color: colors.inkSoft }}>{`${lead.partner.name} · ${t("track.eta", { days: daysWords(lead.minDays, lead.maxDays, t) })}`}</T> : null}
        {timelines.map((timeline) => (
          <View key={timeline.key} style={{ gap: 8 }}>
            {timeline.title ? <T weight="bold" style={{ fontSize: 16 }}>{timeline.title}</T> : null}
            <Timeline steps={timeline.steps} />
          </View>
        ))}
        {/* Call, Share tracking and Report a problem: one stack of full-width buttons, all the same size. */}
        <View style={{ gap: 10 }}>
          {lead?.partner?.phone ? (
            <PillButton testID="track-call" tone="white" size="md" accessibilityLabel={t("track.call", { name: lead.partner.name })} onPress={() => void Linking.openURL(`tel:${lead.partner!.phone!.replace(/[^\d+]/g, "")}`)} icon="phone" title={t("track.call", { name: lead.partner.name })} />
          ) : null}
          {order.trackingUrl ? (
            <PillButton testID="track-share" tone="white" size="md" accessibilityLabel={t("track.share", { name: firstName })} onPress={() => void Share.share({ message: t("track.shareMessage", { name: firstName, url: order.trackingUrl! }) }).catch(() => null)} icon="share" title={t("track.share", { name: firstName })} />
          ) : null}
          <PillButton testID="track-problem" tone="white" size="md" icon="help" title={t("track.problem")} onPress={() => setProblem(true)} />
        </View>
      </View>

      <Sheet visible={problem} onClose={() => setProblem(false)} title={t("track.problem")}>
        {lead?.partner ? (
          <ChoiceRow
            icon="chat"
            title={t("track.messagePartner", { name: lead.partner.name })}
            sub={t("track.messagePartnerSub")}
            tint={colors.mintTint}
            iconColor={colors.forest}
            onPress={() => {
              setProblem(false);
              openPartnerChat("seller", lead.partner!);
            }}
          />
        ) : null}
        <ChoiceRow
          icon="help"
          title={t("track.getHelp")}
          sub={t("track.getHelpSub")}
          onPress={() => {
            setProblem(false);
            router.push("/help");
          }}
        />
      </Sheet>

      {/* Items and totals */}
      <Card style={{ gap: 4, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 20 }}>
        {order.items.map((line, index) => (
          <View key={`${line.name}-${index}`} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 }}>
            <Thumb uri={line.image} size={48} radius={12} />
            <View style={{ flex: 1 }}>
              <T weight="bold" numberOfLines={2}>{line.name}</T>
              <T style={{ color: colors.inkSoft, fontSize: 14 }}>{line.quantity} × {naira(line.price)}</T>
              {line.shortCode ? <CodeBadge code={line.shortCode} /> : null}
              {line.preorder ? <View style={{ marginTop: 4 }}><PreorderPill preorder={{ shipsOn: line.shipsOn ?? null }} /></View> : null}
            </View>
            <T weight="extrabold">{naira(line.price * line.quantity)}</T>
          </View>
        ))}
        <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 8 }} />
        <Line label={t("order.items")} value={naira(order.subtotal)} />
        {order.discountAmount ? <Line label={t("order.discount")} value={`−${naira(order.discountAmount)}`} /> : null}
        <Line label={t("order.delivery")} value={order.shippingFee ? naira(order.shippingFee) : t("order.free")} />
        <Line label={t("order.total")} value={naira(order.total)} strong />
        {(order.paymentMethod || order.channel) && (
          <T style={{ color: colors.inkSoft, fontSize: 14, marginTop: 6 }}>
            {[order.paymentMethod && t("order.payment", { method: t.dynamic(`order.method.${order.paymentMethod}`, PAYMENT_METHOD_LABEL[order.paymentMethod] ?? order.paymentMethod) }), order.channel && t("order.from", { channel: t.dynamic(`order.channel.${order.channel}`, CHANNEL_LABEL[order.channel as OrderChannel] ?? order.channel) })].filter(Boolean).join(" · ")}
          </T>
        )}
        {!toSend && live && !unpaid ? <LinkButton title={t("order.printLabel")} color={colors.inkSoft} onPress={() => router.push({ pathname: "/order/label", params: { id: order.id } })} /> : null}
      </Card>

      {(unpaid || toSend || (selfPickup && live)) && !deciding && <LinkButton title={busy === "cancelled" ? t("order.cancelling") : t("order.cancelThis")} color={colors.danger} onPress={confirmCancel} />}

      <Sheet visible={confirmRefund} onClose={() => setConfirmRefund(false)} title={t("order.refundTitle")}>
        <T style={{ fontSize: 15, lineHeight: 22, color: colors.inkSoft }}>{t("order.refundBody", { name: firstName, total: naira(order.total) })}</T>
        <PillButton title={t("order.refundYes")} busy={busy === "refund"} onPress={() => void refund()} />
        <LinkButton title={t("order.keepOrder")} onPress={() => setConfirmRefund(false)} />
      </Sheet>

      {phone ? (
        <Sheet visible={contact} onClose={() => setContact(false)} title={t("order2.callOrWhatsApp")}>
          <ChoiceRow icon="chat" title={t("order.whatsapp")} sub={phone} tint={colors.successTint} iconColor={colors.success} onPress={() => { setContact(false); void Linking.openURL(`https://wa.me/${whatsappNumber(phone)}`); }} />
          <ChoiceRow icon="phone" title={t("order.call")} sub={phone} onPress={() => { setContact(false); void Linking.openURL(`tel:${phone.replace(/[^\d+]/g, "")}`); }} />
        </Sheet>
      ) : null}

      {/* Supplier parcels delivered: rate the supplier (shared/supplier-ratings.ts). */}
      {parts ? <RateParcels retailOrderId={order.id} /> : null}

      <ReassignSheet
        parcel={reassign}
        city={order.deliveryAddress?.city || order.deliveryAddress?.state || ""}
        onClose={() => setReassign(null)}
        onDone={async () => {
          setReassign(null);
          setSaved(t("flash.reassigned"));
          await load();
        }}
      />
    </Screen>
  );
}

/** "Send to another partner": connected partners who cover this address, cheapest first. */
function ReassignSheet({ parcel, city, onClose, onDone }: { parcel: Parcel | null; city: string; onClose: () => void; onDone: () => Promise<void> }) {
  const t = useT("m_orders", "delivery", "m_ui", "common");
  const [options, setOptions] = useState<ReassignOption[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const jobId = parcel?.job?.id ?? null;

  useEffect(() => {
    if (!jobId) return;
    let alive = true;
    setOptions(null);
    setError(null);
    fetchReassignOptions(jobId)
      .then((answer) => alive && setOptions(answer.options))
      .catch((loadError) => alive && setError(loadError instanceof Error ? loadError.message : t("saveFailed")));
    return () => {
      alive = false;
    };
  }, [jobId, t]);

  async function pick(option: ReassignOption) {
    if (!jobId) return;
    setBusy(option.connectionId);
    setError(null);
    try {
      await jobAction(jobId, { action: "reassign", connectionId: option.connectionId });
      await onDone();
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : t("saveFailed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet visible={!!parcel} onClose={onClose} title={t("order2.sendAnother")}>
      <T style={{ fontSize: 15, lineHeight: 22, color: colors.inkSoft }}>{city ? t("order2.reassignSub", { city }) : t("order2.reassignSubAny")} {t("order2.reassignPay")}</T>
      {error ? <Notice>{error}</Notice> : null}
      {options === null && !error ? <T style={{ color: colors.inkSoft }}>{t("loading")}</T> : null}
      {options && options.length ? (
        <List>
          {options.map((option) => (
            <Row
              key={option.connectionId}
              lead={<Tile icon="truck" tone="mint" />}
              title={option.name}
              sub={busy === option.connectionId ? t("order2.sending") : daysWords(option.minDays, option.maxDays, t)}
              right={<T weight="extrabold" style={{ fontSize: 17 }}>{naira(option.price)}</T>}
              onPress={busy ? undefined : () => void pick(option)}
            />
          ))}
        </List>
      ) : null}
      {options && !options.length ? (
        <>
          <T style={{ fontSize: 15, lineHeight: 22 }}>{t("order2.reassignNone")}</T>
          <PillButton
            title={t("order2.findPartner")}
            tone="white"
            onPress={() => {
              onClose();
              router.push("/delivery/find");
            }}
          />
        </>
      ) : null}
    </Sheet>
  );
}
