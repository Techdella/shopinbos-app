import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Card, Field, PillButton, T } from "@/components/ui";
import { fetchRatableParcels, rateSupplier } from "@/lib/marketplace";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";
import { RATING_TEXT_MAX, type RatingKind } from "@shared/supplier-ratings";

// "Rate the supplier" (web src/app/marketplace/_components/RateSupplier.tsx; shared/supplier-ratings.ts): 1–5 stars
// and a short line once a wholesale order, sample or dropship parcel has arrived (POST /api/app/supplier-ratings).
// On the Wholesale screen per delivered order, and on a store order with RateParcels (its delivered supplier parcels).

const GOLD = "#F2A93B";

export function StarPicker({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const t = useT("marketplace");
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t("rate.starsLabel")} style={{ flexDirection: "row", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable key={star} accessibilityRole="radio" accessibilityState={{ checked: value === star }} accessibilityLabel={t("rate.stars", { count: star })} onPress={() => onChange(star)} hitSlop={4} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
          <T style={{ fontSize: 30, lineHeight: 34, color: star <= value ? GOLD : colors.line }}>★</T>
        </Pressable>
      ))}
    </View>
  );
}

export function RateSupplier({ kind, orderId, supplierName, rated = null }: { kind: RatingKind; orderId: string; supplierName: string; rated?: { rating: number } | null }) {
  const t = useT("marketplace");
  const [done, setDone] = useState(rated);
  const [open, setOpen] = useState(false);
  const [stars, setStars] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDone(rated), [rated]);

  if (done) {
    return (
      <T weight="bold" style={{ fontSize: 13, color: colors.inkSoft }} accessibilityLabel={`${t("rate.youRated")} ${t("rate.stars", { count: done.rating })}`}>
        {`${t("rate.youRated")} `}
        <T style={{ fontSize: 13, color: GOLD }}>{"★".repeat(done.rating)}</T>
      </T>
    );
  }

  async function send() {
    if (!stars) return setError(t("rate.pickStars"));
    setBusy(true);
    setError(null);
    try {
      const result = await rateSupplier({ kind, orderId, rating: stars, ...(text.trim() ? { text: text.trim() } : {}) });
      setDone({ rating: result.rating.rating });
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : t("ws.offline"));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return <PillButton title={`★ ${t("rate.button")}`} tone="white" size="sm" style={{ alignSelf: "flex-start" }} onPress={() => setOpen(true)} />;
  return (
    <View style={{ gap: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 12, backgroundColor: colors.surface }}>
      <T weight="extrabold" style={{ fontSize: 15 }}>{t("rate.title", { name: supplierName })}</T>
      <StarPicker value={stars} onChange={setStars} />
      <Field value={text} onChangeText={setText} maxLength={RATING_TEXT_MAX} placeholder={t("rate.textPh")} accessibilityLabel={t("rate.textLabel")} multiline />
      {error ? <T style={{ color: colors.danger, fontSize: 13.5 }}>{error}</T> : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <PillButton title={t("rate.send")} size="sm" busy={busy} onPress={() => void send()} />
        <PillButton title={t("pd.cancel")} tone="white" size="sm" disabled={busy} onPress={() => setOpen(false)} />
      </View>
    </View>
  );
}

/** On a store order: "Rate the supplier" for each supplier parcel that was delivered. Shows nothing otherwise. */
export function RateParcels({ retailOrderId }: { retailOrderId: string }) {
  const t = useT("marketplace");
  const [parcels, setParcels] = useState<Awaited<ReturnType<typeof fetchRatableParcels>>>([]);
  useEffect(() => {
    let cancelled = false;
    fetchRatableParcels(retailOrderId)
      .then((rows) => !cancelled && setParcels(rows))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [retailOrderId]);
  const shown = parcels.filter((parcel) => parcel.canRate || parcel.rated);
  if (!shown.length) return null;
  return (
    <Card style={{ gap: 10 }}>
      <T weight="extrabold" style={{ fontSize: 17 }}>{t("rate.orderTitle")}</T>
      <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("rate.orderSub")}</T>
      {shown.map((parcel) => (
        <View key={parcel.id} style={{ gap: 6 }}>
          <T weight="bold" style={{ fontSize: 15 }}>{parcel.supplierName}</T>
          <RateSupplier kind="dropship_order" orderId={parcel.id} supplierName={parcel.supplierName} rated={parcel.rated} />
        </View>
      ))}
    </Card>
  );
}
