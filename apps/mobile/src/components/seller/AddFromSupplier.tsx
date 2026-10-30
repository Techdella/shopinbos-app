import { useMemo } from "react";
import { TextInput, View } from "react-native";
import { DELIVERY_PAYERS } from "@shared/dropship-rules";
import type { DropshipTerms } from "@shared/dropship-checkout";
import { Image } from "expo-image";
import { AppIcon } from "@/components/icons";
import { BoardChip, BoardChips, PriceInput } from "@/components/supplier/DropshipKit";
import { T } from "@/components/ui";
import { amountOf, groupDigits, deliveryLine, listingView, naira, payerLabel, supplierBadgeLine, wordsOf } from "@/lib/dropship-pure";
import { useT } from "@/lib/i18n";
import type { FindProduct } from "@/lib/marketplace";
import { colors, fonts, radii } from "@/theme";

// "Add to your store" for a supplier's dropship product (A-Seller-AddSupplier; shared/dropship-checkout.ts): who
// it's from and where it ships from, the options ("Ships 1 piece · Packs in 1 day · 86 in stock") and the trusted-
// supplier line; YOU PAY (the supplier's dropship price), YOUR PRICE (typed) and YOU EARN, live and exactly as the web's
// Find products panel works it out (lib/dropship-pure.ts listingMoney: on the dearest delivery the seller could cover,
// less the card payment fee), with the web's lines under them ("On each order"); the lowest price allowed; delivery to
// the seller's customers with who pays it (the customer, the seller as free delivery, or a flat fee they type); and
// "Your SKU or barcode". Suppliers don't offer seller branding: every parcel is packed plain, and the seller's name is
// on tracking and the invoice. listingProblem gives the same refusal as the server (409 PRICE_PROBLEM).

export type Payer = (typeof DELIVERY_PAYERS)[number];

export interface ListingDraft {
  price: string;
  payer: Payer;
  flatFee: string;
  sku: string;
}

export const listingDraftFrom = (terms: DropshipTerms): ListingDraft => ({ price: String(Math.round(terms.suggestedPrice)), payer: "customer", flatFee: "", sku: "" });

/** The choices as the server and the margin check read them. */
export const listingChoiceOf = (draft: ListingDraft) => ({ retailPrice: amountOf(draft.price) ?? 0, payer: draft.payer, flatFee: draft.payer === "flat" ? amountOf(draft.flatFee) ?? (draft.flatFee.trim() === "0" ? 0 : null) : null });

/** One of the three tiles (`.m`): YOU PAY, YOUR PRICE (ringed, typed) and YOU EARN (green, red at a loss). */
function Money({ label, value, tone, children }: { label: string; value?: string; tone?: "edit" | "earn" | "loss"; children?: React.ReactNode }) {
  const bg = tone === "earn" ? colors.successTint : tone === "loss" ? colors.dangerTint : colors.surface;
  const fg = tone === "earn" ? colors.success : tone === "loss" ? colors.danger : colors.ink;
  return (
    <View style={{ flex: 1, minWidth: 0, backgroundColor: bg, borderRadius: 16, paddingHorizontal: 10, paddingVertical: tone === "edit" ? 7 : 9, gap: 2, borderWidth: tone === "edit" ? 2 : 0, borderColor: colors.ink }}>
      <T weight="extrabold" numberOfLines={1} style={{ fontSize: 11, letterSpacing: 0.44, color: colors.inkSoft }}>{label}</T>
      {children ?? <T style={{ fontFamily: fonts.display, fontSize: 18, color: fg }} numberOfLines={1} adjustsFontSizeToFit>{value}</T>}
    </View>
  );
}

/** A white section (`.sec`) with its heading line and a grey note on the right. */
function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 11, gap: 8 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 2 }}>
        <T weight="extrabold" style={{ fontSize: 14, flexShrink: 1 }}>{title}</T>
        {note ? <T weight="bold" style={{ fontSize: 12, color: colors.grayInk, marginLeft: "auto", textAlign: "right" }}>{note}</T> : null}
      </View>
      {children}
    </View>
  );
}

/** A line of "On each order": the label, and the amount taken off (or "Customer pays"). */
function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10 }}>
      <T weight={strong ? "extrabold" : "regular"} numberOfLines={1} style={{ flex: 1, fontSize: strong ? 14 : 13, color: strong ? colors.ink : colors.inkSoft }}>{label}</T>
      <T weight="extrabold" style={strong ? { fontFamily: fonts.display, fontSize: 17, color: tone } : { fontSize: 13 }}>{value}</T>
    </View>
  );
}

const signed = (amount: number) => `${amount < 0 ? "−" : ""}${naira(Math.abs(amount))}`;

export function AddFromSupplier({ product, terms, draft, onChange, place }: { product: FindProduct; terms: DropshipTerms; draft: ListingDraft; onChange: (next: ListingDraft) => void; place: string | null }) {
  const t = useT("m_find", "common");
  const words = useMemo(() => wordsOf(t), [t]);
  const set = (patch: Partial<ListingDraft>) => onChange({ ...draft, ...patch });
  const choice = listingChoiceOf(draft);
  const view = listingView(terms, choice, words);
  const money = view.money;
  const badge = supplierBadgeLine(product.supplier, words);
  const stockWord = terms.stockState === "out" ? words("add.outOfStock", "Out of stock") : words("add.inStock", "{count} in stock", { count: terms.stock });
  const options = [...terms.options.map((option) => words(`option.${option}`, option)), stockWord].join(" · ");
  const shipsFrom = terms.shipsFrom ?? product.supplier.city;

  return (
    <View style={{ gap: 8 }}>
      {/* `.pb`: the product, how it ships and the supplier's standing. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: radii.card, padding: 10 }}>
        {product.images[0] ? <Image source={{ uri: product.images[0] }} style={{ width: 60, height: 60, borderRadius: 14, backgroundColor: colors.peach }} contentFit="cover" accessibilityIgnoresInvertColors /> : <View style={{ width: 60, height: 60, borderRadius: 14, backgroundColor: colors.peach }} />}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <T style={{ fontSize: 12, color: colors.inkSoft }} numberOfLines={1}>{shipsFrom ? words("add.from", "From {name} · ships from {city}", { name: product.supplier.name, city: shipsFrom }) : words("add.fromOnly", "From {name}", { name: product.supplier.name })}</T>
          <T weight="semibold" style={{ fontSize: 13, color: terms.stockState === "ok" ? colors.ink : colors.warnInk }} numberOfLines={2}>{options}</T>
          {badge ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
              <AppIcon name="shield" size={13} color={colors.forest} />
              <T weight="extrabold" style={{ fontSize: 11, color: colors.forest, flexShrink: 1 }} numberOfLines={1}>{badge}</T>
            </View>
          ) : null}
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 6 }}>
        <Money label={words("add.youPay", "YOU PAY")} value={naira(view.pay)} />
        <Money label={words("add.yourPrice", "YOUR PRICE")} tone="edit">
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <T style={{ fontFamily: fonts.display, fontSize: 18 }}>₦</T>
            <TextInput
              value={groupDigits(draft.price)}
              onChangeText={(text) => set({ price: text.replace(/[^\d.]/g, "") })}
              keyboardType="decimal-pad"
              accessibilityLabel={words("add.yourPriceLabel", "Your price")}
              style={{ flex: 1, minWidth: 0, fontFamily: fonts.display, fontSize: 18, color: colors.ink, paddingVertical: 0 }}
            />
          </View>
        </Money>
        <Money label={words("add.youEarn", "YOU EARN")} value={signed(view.earn)} tone={view.earn < 0 ? "loss" : "earn"} />
      </View>
      {view.floorLine ? <T style={{ fontSize: 12, color: colors.inkSoft, marginHorizontal: 2 }}>{view.floorLine}</T> : null}

      {/* "On each order", line for line as the web shows it (DropshipTermsPanel): the card fee is taken off too. */}
      <Section title={words("add.eachOrder", "On each order")}>
        <Line label={words("add.lineYourPrice", "Your price")} value={naira(money.price)} />
        <Line label={words("add.linePay", "You pay {name}", { name: product.supplier.name })} value={`−${naira(money.cost)}`} />
        <Line label={money.customerPays ? words("add.lineDelivery", "Delivery") : words("add.lineDeliveryYou", "Delivery you cover (up to)")} value={money.customerPays ? words("add.lineCustomerPays", "Customer pays") : `−${naira(money.deliveryShare)}`} />
        <Line label={words("add.lineCardFee", "Card payment fee")} value={`−${naira(money.cardFee)}`} />
        <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 }}>
          <Line strong label={words("add.lineEarn", "You earn")} value={signed(money.earn)} tone={money.earn > 0 ? colors.success : colors.danger} />
        </View>
      </Section>
      {view.problem ? <T weight="bold" accessibilityRole="alert" style={{ fontSize: 13.5, lineHeight: 19, color: colors.danger, backgroundColor: colors.dangerTint, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>{view.problem}</T> : null}

      <Section title={words("add.delivery", "Delivery to your customers")} note={deliveryLine(terms, place, words)}>
        <BoardChips gap={6}>
          {DELIVERY_PAYERS.map((payer) => <BoardChip small key={payer} label={payerLabel(payer, payer === "flat" ? amountOf(draft.flatFee) : null, words)} on={draft.payer === payer} onPress={() => set({ payer })} />)}
        </BoardChips>
        {draft.payer === "flat" ? (
          <PriceInput value={draft.flatFee} onChange={(flatFee) => set({ flatFee })} label={words("add.flatLabel", "Flat delivery fee your customers pay")} suffix={words("add.flatSuffix", "customer pays")} placeholder="2,000" />
        ) : null}
        {draft.payer !== "customer" ? <T style={{ fontSize: 12, lineHeight: 17, color: colors.inkSoft }}>{words("add.payerNote", "You cover the rest of delivery from your margin. You earn is worked out on the dearest delivery.")}</T> : null}
      </Section>

      <Section title={words("add.packing", "Packing")}>
        <T style={{ fontSize: 12, lineHeight: 17, color: colors.inkSoft }}>{words("add.packedPlain", "Packed plain: your shop's name is on tracking and the invoice.")}</T>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <T weight="bold" style={{ fontSize: 13, color: colors.grayInk }}>{words("add.sku", "Your SKU or barcode")}</T>
          <TextInput
            value={draft.sku}
            onChangeText={(sku) => set({ sku: sku.slice(0, 64) })}
            placeholder="AK-ANK-04"
            placeholderTextColor={colors.inkFaint}
            autoCapitalize="characters"
            accessibilityLabel={words("add.sku", "Your SKU or barcode")}
            style={{ flex: 1, minWidth: 0, height: 36, borderRadius: 10, borderWidth: 2, borderColor: colors.line, paddingHorizontal: 10, fontFamily: fonts.bold, fontSize: 13, color: colors.ink }}
          />
        </View>
      </Section>
    </View>
  );
}
