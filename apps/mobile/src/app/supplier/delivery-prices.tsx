import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { router } from "expo-router";
import { DELIVERY_ZONES, ZONE_LABELS, type RateSource, type ZoneRates } from "@shared/dropship-rules";
import { AppIcon } from "@/components/icons";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { BoardScreen } from "@/components/Screen";
import { useWords } from "@/components/supplier/DropshipKit";
import { Notice, PillButton, T } from "@/components/ui";
import { naira, rateDraftFrom, readRateDraft, zoneDaysWords, zoneExamples, type RateDraft } from "@/lib/dropship-pure";
import { fetchDeliveryRates, saveDeliveryRates, type DeliveryRatesView } from "@/lib/supplier";
import { useLoad } from "@/lib/useLoad";
import { colors, fonts, radii } from "@/theme";

// Delivery prices (P-Delivery; the web's /supplier/delivery rate card): "You never pay for delivery", then either
// Shopinbos partner rates (prices from verified partners on each route, nothing to type; the example card shows what
// they're about) or "Set my own rates" (one price per zone and parcel size, delivered by the supplier's own courier
// or park waybill). Size tabs (Small, Medium, Large) switch the four zone rows: same city, same state, nearby
// states, rest of Nigeria, each with where it reaches and how long it takes. GET/PUT /api/supplier/delivery-rates;
// own rates are checked like the server (farther never cheaper; 400 invalid_rates otherwise, shown as said).

const SIZES = [
  { band: "small", english: "Small" },
  { band: "medium", english: "Medium" },
  { band: "bulky", english: "Large" },
] as const;

function RatesForm({ view }: { view: DeliveryRatesView }) {
  const words = useWords();
  const [source, setSource] = useState<RateSource>(view.rateSource);
  const [size, setSize] = useState<(typeof SIZES)[number]["band"]>("small");
  const [draft, setDraft] = useState<RateDraft>(() => rateDraftFrom(view.zoneRates, view.defaults));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const own = source === "own";
  const examples = zoneExamples(view.originState, view.originArea);
  const from = view.originArea || view.originState;

  async function save() {
    setError(null);
    let body: { rateSource: RateSource; zoneRates?: ZoneRates } = { rateSource: source };
    if (own) {
      const read = readRateDraft(draft);
      if (!read.ok) return setError(read.message);
      body = { rateSource: "own", zoneRates: read.value };
    }
    setBusy(true);
    try {
      await saveDeliveryRates(body);
      router.back();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : words("rates.saveFailed", "Couldn't save your delivery prices. Try again."));
    } finally {
      setBusy(false);
    }
  }

  const option = (value: RateSource, title: string, sub: string) => {
    const on = source === value;
    return (
      <Pressable
        key={value}
        accessibilityRole="radio"
        accessibilityState={{ checked: on }}
        accessibilityLabel={`${title}. ${sub}`}
        onPress={() => setSource(value)}
        style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 18, borderWidth: 2, borderColor: on ? colors.accent : colors.line, backgroundColor: on ? colors.peach : colors.surface }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <T weight="extrabold" style={{ fontSize: 15 }}>{title}</T>
          <T style={{ fontSize: 12, lineHeight: 16, color: "#5E5A6C" }}>{sub}</T>
        </View>
        <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? colors.accent : "#D9D6E2", alignItems: "center", justifyContent: "center" }}>
          {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent }} /> : null}
        </View>
      </Pressable>
    );
  };

  return (
    <BoardScreen
      title={words("rates.title", "Delivery prices")}
      sub={from ? words("rates.shipsFrom", "Ships from {place}", { place: from }) : undefined}
      footer={<PillButton title={words("rates.save", "Save delivery prices")} tone="accent" busy={busy} onPress={() => void save()} />}
      gap={12}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.successTint, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 }}>
        <AppIcon name="check" size={18} color={colors.success} strokeWidth={2.6} />
        <T style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>{`${words("rates.never", "You never pay for delivery.")} ${words("rates.neverSub", "The customer or the seller pays it at checkout.")}`}</T>
      </View>
      {!from ? (
        <Notice tone="info">{words("rates.noOrigin", "Add where you send parcels from (Account › Where parcels leave from) so we can work out each zone.")}</Notice>
      ) : null}
      <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
        {option("partners", words("rates.partners", "Use Shopinbos partner rates"), words("rates.partnersSub", "Prices from verified riders on each route. Nothing to type."))}
        {option("own", words("rates.own", "Set my own rates"), words("rates.ownSub", "If you already use a courier or park waybill"))}
      </View>

      <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, paddingHorizontal: 14, paddingVertical: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <T style={{ fontFamily: fonts.display, fontSize: 16, flex: 1 }}>{own ? words("rates.yours", "Your rates") : words("rates.partnerCard", "Partner rates")}</T>
          <View accessibilityRole="tablist" style={{ flexDirection: "row", backgroundColor: colors.canvas, borderRadius: 999, padding: 3 }}>
            {SIZES.map((entry) => {
              const on = size === entry.band;
              return (
                <Pressable key={entry.band} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setSize(entry.band)} style={{ paddingHorizontal: 10, height: 30, borderRadius: 999, justifyContent: "center", backgroundColor: on ? colors.ink : "transparent" }}>
                  <T weight="extrabold" style={{ fontSize: 12, color: on ? "#FFFFFF" : colors.grayInk }}>{words(`ds.size.${entry.band}`, entry.english)}</T>
                </Pressable>
              );
            })}
          </View>
        </View>
        {DELIVERY_ZONES.map((zone, index) => {
          const reach = examples[zone];
          const sub = [reach, words(`rates.days.${zone}`, zoneDaysWords(zone))].filter(Boolean).join(" · ");
          const label = words(`zone.${zone}`, ZONE_LABELS[zone]);
          const sizeWord = words(`ds.size.${size}`, SIZES.find((entry) => entry.band === size)!.english);
          return (
            <View key={zone} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: own ? 6 : 11, minHeight: 56, borderTopWidth: index ? 1 : 0, borderTopColor: colors.grayTint }}>
              <View style={{ flex: 1, gap: 1 }}>
                <T weight="extrabold" style={{ fontSize: 14 }}>{label}</T>
                <T style={{ fontSize: 12, color: colors.inkSoft }} numberOfLines={1}>{sub}</T>
              </View>
              {own ? (
                <TextInput
                  value={draft[zone][size]}
                  onChangeText={(text) => setDraft((current) => ({ ...current, [zone]: { ...current[zone], [size]: text.replace(/[^\d,]/g, "") } }))}
                  keyboardType="number-pad"
                  accessibilityLabel={words("rates.priceFor", "{zone}, {size}: price", { zone: label, size: sizeWord })}
                  placeholder="₦"
                  placeholderTextColor={colors.inkFaint}
                  style={{ width: 104, height: 44, borderRadius: 14, borderWidth: 2, borderColor: colors.line, paddingHorizontal: 12, textAlign: "right", fontSize: 18, fontFamily: fonts.display, color: colors.ink }}
                />
              ) : (
                <T style={{ fontFamily: fonts.display, fontSize: 18 }}>{view.defaults[zone][size] ? naira(view.defaults[zone][size]!) : "–"}</T>
              )}
            </View>
          );
        })}
        <T style={{ fontSize: 12, lineHeight: 17, color: colors.inkSoft, marginTop: 4 }}>
          {own ? words("rates.ownHint", "Leave a box empty if you don't send that size there. Farther should cost the same or more.") : words("rates.partnerHint", "About what partners charge; the real price comes from the partner on each route.")}
        </T>
      </View>
      {error ? <Notice>{error}</Notice> : null}
    </BoardScreen>
  );
}

export default function DeliveryPricesScreen() {
  const words = useWords();
  const rates = useLoad(fetchDeliveryRates);
  // The form starts from what was saved (its state is set once, so a quiet reload doesn't undo typing).
  if (rates.data) return <RatesForm view={rates.data} />;
  return (
    <BoardScreen title={words("rates.title", "Delivery prices")}>
      {rates.loading ? <LoadingBlock /> : null}
      {rates.error ? <ErrorState message={rates.error} onRetry={() => void rates.reload()} /> : null}
    </BoardScreen>
  );
}
