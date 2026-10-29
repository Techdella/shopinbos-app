import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { naira } from "@shared/onboarding";
import { AppIcon } from "@/components/icons";
import { Badge, EmptyState, ErrorState, LoadingBlock, SectionTitle } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Field, Label, LinkButton, Notice, PillButton, T, Toggle } from "@/components/ui";
import { TONE_COLORS } from "@/lib/dashboard";
import { friendlyDay } from "@/lib/friendly";
import { createZone, deleteZone, fetchBookings, fetchZones, updateZone, type DeliveryBooking } from "@/lib/seller-settings";
import { addAreas, areasLine, feeEditable, feeText, parseFee, zoneBody, zoneProblem, type Zone, type ZoneDraft } from "@/lib/settings-pure";
import { useLoad } from "@/lib/useLoad";
import { payDeliveryFee } from "@/lib/wallet";
import { router } from "expo-router";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";
import { KeyboardShift } from "@/components/KeyboardShift";

// My own delivery prices (web /home/shipping and /home/logistics), opened from the Delivery hub: the shop's delivery
// areas and fees (ShippingZone: add, edit, turn on or off, delete; checkout uses them when the hub's "At checkout,
// use" is "My own prices") and its latest courier bookings. Booking a courier finds a delivery partner in the app (/delivery/find).

const BOOKING_TONE: Record<string, keyof typeof TONE_COLORS> = { pending: "warning", confirmed: "accent", picked_up: "accent", in_transit: "accent", delivered: "success", failed: "danger", cancelled: "muted", declined: "muted", out_for_delivery: "accent", at_pickup_point: "accent", returning: "warning", returned: "muted" };

function feeWords(rate: Zone["rates"][number] | undefined, t: ReturnType<typeof useT<["m_settings"]>>) {
  if (!rate) return t("del.noFee");
  if (rate.freeOver != null) return t("del.freeOver", { amount: naira(Number(rate.freeOver)) });
  if (rate.price === undefined || rate.price === null || rate.price === "") return t("del.noFee");
  return Number(rate.price) === 0 ? t("del.free") : naira(Number(rate.price));
}

export default function Delivery() {
  const t = useT("m_settings", "m_delivery", "shipping", "common");
  const loaded = useLoad(async () => {
    const [zones, bookings] = await Promise.all([fetchZones(), fetchBookings().catch(() => null)]);
    return { zones, bookings };
  });
  const [editing, setEditing] = useState<Zone | "new" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const data = loaded.data;

  async function setActive(zone: Zone, active: boolean) {
    if (!data) return;
    const swap = (on: boolean) => loaded.setData({ ...data, zones: data.zones.map((row) => (row.id === zone.id ? { ...row, active: on } : row)) });
    swap(active);
    setNote(null);
    try {
      await updateZone(zone.id, { active });
    } catch (saveError) {
      swap(!active);
      setNote(saveError instanceof Error ? saveError.message : t("del.saveFailed"));
    }
  }

  return (
    <Screen title={t("zones.title")} sub={t("del.sub")} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
      {loaded.loading && !data ? <LoadingBlock /> : null}
      {loaded.error && !data ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      {note ? <Notice>{note}</Notice> : null}

      {data ? (
        <>
          <SectionTitle tip={{ text: t("del.orderNote") }}>{t("del.areas")}</SectionTitle>
          {data.zones.length ? (
            data.zones.map((zone) => (
              <Card key={zone.id} style={{ gap: 8, opacity: zone.active ? 1 : 0.75 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <Pressable accessibilityRole="button" accessibilityLabel={t("del.editX", { name: zone.name })} onPress={() => setEditing(zone)} style={({ pressed }) => ({ flex: 1, gap: 3, opacity: pressed ? 0.7 : 1, minHeight: 44 })}>
                    <T weight="extrabold" style={{ fontSize: 16.5 }}>{zone.name}</T>
                    <T style={{ color: colors.inkSoft, fontSize: 14.5, lineHeight: 20 }} numberOfLines={2}>{areasLine(zone.regions) || t("del.everywhere")}</T>
                    <T weight="bold" style={{ fontSize: 15.5, marginTop: 2 }}>
                      {zone.rates.length > 1 ? zone.rates.map((rate) => feeWords(rate, t)).join(" · ") : feeWords(zone.rates[0], t)}
                    </T>
                  </Pressable>
                  <Toggle on={zone.active} label={t("del.useX", { name: zone.name })} onChange={(on) => void setActive(zone, on)} />
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Badge label={zone.active ? t("del.on") : t("del.off")} bg={TONE_COLORS[zone.active ? "success" : "muted"].bg} fg={TONE_COLORS[zone.active ? "success" : "muted"].fg} />
                  <LinkButton title={t("edit")} onPress={() => setEditing(zone)} />
                </View>
              </Card>
            ))
          ) : (
            <EmptyState icon="pin" title={t("del.empty")}>{t("del.emptySub")}</EmptyState>
          )}
          <PillButton title={t("del.add")} tone={data.zones.length ? "white" : "ink"} size="md" onPress={() => setEditing("new")} />

          <SectionTitle>{t("del.deliveries")}</SectionTitle>
          {data.bookings === null ? (
            <Notice tone="info">{t("del.bookingsFailed")}</Notice>
          ) : data.bookings.length ? (
            <Card style={{ paddingVertical: 2 }}>
              {data.bookings.map((booking, index) => (
                <BookingRow key={booking.id} booking={booking} first={index === 0} onPaid={() => void loaded.reload()} />
              ))}
            </Card>
          ) : (
            <Card>
              <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>{t("del.noBookings")}</T>
            </Card>
          )}
          <PillButton title={t("del.book")} size="md" onPress={() => router.push("/delivery/find" as never)}>
            <AppIcon name="truck" size={20} color="#FFFFFF" />
            <T weight="bold" style={{ color: "#FFFFFF", fontSize: 16 }}>{t("del.book")}</T>
          </PillButton>
          <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20, textAlign: "center" }}>{t("del.bookHint")}</T>
        </>
      ) : null}

      <ZoneEditor
        zone={editing}
        onClose={() => setEditing(null)}
        onDone={() => {
          setEditing(null);
          void loaded.reload();
        }}
      />
    </Screen>
  );
}

function BookingRow({ booking, first, onPaid }: { booking: DeliveryBooking; first: boolean; onPaid: () => void }) {
  const t = useT("m_settings", "shipping", "m_money");
  const tone = BOOKING_TONE[booking.status] ?? "muted";
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [payNote, setPayNote] = useState<string | null>(null);

  // Card payment of the fee, split by Paystack straight to the delivery partner's bank.
  async function pay() {
    setPaying(true);
    setPayError(null);
    try {
      setPayNote(null);
      const result = await payDeliveryFee(booking.id);
      // Paid (the row shows "Fee paid" once reloaded), a transfer still on its way, or closed before paying.
      if (result.outcome === "pending") setPayNote(t("pay.pending"));
      else if (result.outcome === "cancelled") setPayError(t("pay.cancelled"));
      onPaid();
    } catch (failure) {
      setPayError(failure instanceof Error ? failure.message : t("del.feeNotSeen"));
    } finally {
      setPaying(false);
    }
  }
  return (
    <View style={{ paddingVertical: 12, gap: 4, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <T weight="bold" style={{ flex: 1, fontSize: 15.5 }} numberOfLines={2}>{booking.pickupLocation} → {booking.destination}</T>
        <T weight="extrabold" style={{ fontSize: 15.5 }}>{naira(booking.deliveryFee)}</T>
      </View>
      <T style={{ color: colors.inkSoft, fontSize: 14 }} numberOfLines={1}>
        {[booking.logisticsPartner.displayName, booking.trackingCode, friendlyDay(booking.createdAt)].filter(Boolean).join(" · ")}
      </T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <Badge label={t.dynamic(`booking.${booking.status}`, booking.status.replace(/_/g, " "))} bg={TONE_COLORS[tone].bg} fg={TONE_COLORS[tone].fg} />
        {booking.feePaidAt ? <Badge label={t("del.feePaid")} bg={colors.successTint} fg={colors.success} /> : null}
      </View>
      {!booking.feePaidAt && booking.feePayable ? (
        <PillButton title={t("del.payFee", { amount: naira(booking.deliveryFee) })} size="sm" tone="white" busy={paying} style={{ alignSelf: "flex-start", marginTop: 4 }} onPress={() => void pay()} />
      ) : null}
      {payError ? <Notice>{payError}</Notice> : null}
      {payNote ? <Notice tone="info">{payNote}</Notice> : null}
    </View>
  );
}

function draftFrom(zone: Zone | null): ZoneDraft {
  return { name: zone?.name ?? "", areas: zone?.regions ?? [], pendingArea: "", fee: feeText(zone), active: zone?.active ?? true };
}

/** Add or edit one delivery area: its name, the places it covers, the fee and whether checkout uses it. */
function ZoneEditor({ zone, onClose, onDone }: { zone: Zone | "new" | null; onClose: () => void; onDone: () => void }) {
  const t = useT("m_settings", "common");
  const existing = zone && zone !== "new" ? zone : null;
  const [draft, setDraft] = useState<ZoneDraft>(draftFrom(existing));
  const [shownFor, setShownFor] = useState<Zone | "new" | null>(zone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A different zone was opened: start from its saved values.
  if (shownFor !== zone) {
    setShownFor(zone);
    setDraft(draftFrom(existing));
    setError(null);
  }

  const set = (patch: Partial<ZoneDraft>) => setDraft((current) => ({ ...current, ...patch }));

  async function save() {
    const problem = zoneProblem(draft, existing);
    if (problem) return setError(t(problem === "needName" ? "del.needName" : "del.needFee"));
    setBusy(true);
    setError(null);
    try {
      const body = zoneBody(draft, existing);
      if (existing) await updateZone(existing.id, body);
      else await createZone(body);
      onDone();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("del.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    if (!existing) return;
    Alert.alert(t("del.deleteTitle", { name: existing.name }), t("del.deleteBody"), [
      { text: t("del.keep"), style: "cancel" },
      {
        text: t("del.yesDelete"),
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          setError(null);
          try {
            await deleteZone(existing.id);
            onDone();
          } catch (deleteError) {
            setError(deleteError instanceof Error ? deleteError.message : t("del.deleteFailed"));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  const editableFee = feeEditable(existing);
  const fee = parseFee(draft.fee);

  return (
    <Modal visible={zone !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => !busy && onClose()}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
        <KeyboardShift>
          <View style={{ paddingHorizontal: 18, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <T weight="extrabold" style={{ flex: 1, fontSize: 22, lineHeight: 28 }} accessibilityRole="header">{existing ? t("del.editTitle") : t("del.newTitle")}</T>
            <Pressable accessibilityRole="button" onPress={() => !busy && onClose()} hitSlop={8} style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 6 }}>
              <AppIcon name="x" size={16} />
              <T weight="bold" numberOfLines={1} style={{ flexShrink: 1, fontSize: 15 }}>{t("close")}</T>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 28, gap: 14 }}>
            <View>
              <Label>{t("del.name")}</Label>
              <Field placeholder={t("del.namePlaceholder")} maxLength={120} value={draft.name} onChangeText={(name) => set({ name })} accessibilityLabel={t("del.name")} />
            </View>

            <View>
              <Label tip={{ text: t("del.placesHint") }}>{t("del.places")}</Label>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Field
                  style={{ flex: 1 }}
                  placeholder={t("del.placePlaceholder")}
                  value={draft.pendingArea}
                  onChangeText={(pendingArea) => set({ pendingArea })}
                  onSubmitEditing={() => set({ areas: addAreas(draft.areas, draft.pendingArea), pendingArea: "" })}
                  returnKeyType="done"
                  accessibilityLabel={t("del.places")}
                />
                <PillButton title={t("add")} tone="white" size="md" disabled={!draft.pendingArea.trim()} onPress={() => set({ areas: addAreas(draft.areas, draft.pendingArea), pendingArea: "" })} />
              </View>
              {draft.areas.length ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  {draft.areas.map((area) => (
                    <Pressable
                      key={area}
                      accessibilityRole="button"
                      accessibilityLabel={t("del.removeX", { name: area })}
                      onPress={() => set({ areas: draft.areas.filter((item) => item !== area) })}
                      style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 14, paddingRight: 10, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}
                    >
                      <T weight="bold" style={{ fontSize: 15 }}>{area}</T>
                      <AppIcon name="x" size={14} color={colors.inkSoft} />
                    </Pressable>
                  ))}
                </View>
              ) : (
                <T style={{ color: colors.inkSoft, fontSize: 14, marginTop: 8 }}>{t("del.noPlaces")}</T>
              )}
            </View>

            {editableFee ? (
              <View>
                <Label>{t("del.fee")}</Label>
                <Field keyboardType="number-pad" placeholder={t("del.feePlaceholder")} value={draft.fee} onChangeText={(text) => set({ fee: text.replace(/[^\d.,]/g, "") })} accessibilityLabel={t("del.fee")} />
                <T style={{ color: colors.inkSoft, fontSize: 14, marginTop: 6 }}>{fee === 0 ? t("del.freeHint") : fee ? t("del.feeHint", { amount: naira(fee) }) : t("del.zeroHint")}</T>
              </View>
            ) : existing ? (
              <Card style={{ gap: 8 }}>
                <T weight="bold" style={{ fontSize: 15.5 }}>{t("del.prices")}</T>
                {existing.rates.map((rate, index) => (
                  <View key={index} style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                    <T style={{ flex: 1, fontSize: 15 }}>{rate.name ?? rate.label ?? t("del.priceN", { n: index + 1 })}</T>
                    <T weight="bold" style={{ fontSize: 15 }}>{feeWords(rate, t)}</T>
                  </View>
                ))}
              </Card>
            ) : null}

            <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <T weight="bold" style={{ fontSize: 15.5 }}>{t("del.useAtCheckout")}</T>
                <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 19 }}>{draft.active ? t("del.onNote") : t("del.offNote")}</T>
              </View>
              <Toggle on={draft.active} label={t("del.useAtCheckout")} onChange={(active) => set({ active })} />
            </Card>

            {error ? <Notice>{error}</Notice> : null}
            <PillButton title={existing ? t("save") : t("del.create")} busy={busy} onPress={() => void save()} />
            {existing ? <PillButton title={t("del.delete")} tone="white" size="md" disabled={busy} onPress={confirmDelete} /> : null}
          </ScrollView>
        </KeyboardShift>
      </SafeAreaView>
    </Modal>
  );
}
