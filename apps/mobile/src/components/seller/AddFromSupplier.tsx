import { useMemo } from "react";
import { TextInput, View } from "react-native";
import { DELIVERY_PAYERS } from "@shared/dropship-rules";
import type { DropshipTerms } from "@shared/dropship-checkout";
import { ChipRow } from "@/components/kit";
import { PriceInput } from "@/components/supplier/DropshipKit";
import { Card, Chip, Field, T } from "@/components/ui";
import { amountOf, brandingLabel, deliveryLine, listingView, naira, payerLabel, supplierBadgeLine, wordsOf } from "@/lib/dropship-pure";
import { useT } from "@/lib/i18n";
import type { FindProduct } from "@/lib/marketplace";
import { colors, fonts, radii } from "@/theme";

// "Add to your store" for a supplier's dropship product (A-Seller-AddSupplier; shared/dropship-checkout.ts): who
// it's from and where it ships from, the options ("Ships 1 piece · Packs in 1 day · 86 in stock") and the trusted-
// supplier line; YOU PAY (the supplier's dropship price), YOUR PRICE (typed) and YOU EARN, live from listingEarn on
// the dearest delivery the seller could cover; the lowest price allowed; delivery to the seller's customers with who
// pays it (the customer, the seller as free delivery, or a flat fee they type); the branding the supplier offers with
// its fee; and "Your SKU or barcode". listingProblem gives the same refusal as the server (409 PRICE_PROBLEM).

export type Payer = (typeof DELIVERY_PAYERS)[number];

export interface ListingDraft {
  price: string;
  payer: Payer;
  flatFee: string;
  branding: string;
  sku: string;
}

export const listingDraftFrom = (terms: DropshipTerms): ListingDraft => ({ price: String(Math.round(terms.suggestedPrice)), payer: "customer", flatFee: "", branding: terms.branding[0]?.choice ?? "blind", sku: "" });

/** The choices as the server and the margin check read them. */
export const listingChoiceOf = (draft: ListingDraft) => ({ retailPrice: amountOf(draft.price) ?? 0, payer: draft.payer, flatFee: draft.payer === "flat" ? amountOf(draft.flatFee) ?? (draft.flatFee.trim() === "0" ? 0 : null) : null, brandingChoice: draft.branding });

function Money({ label, value, tone, children }: { label: string; value?: string; tone?: "edit" | "earn" | "loss"; children?: React.ReactNode }) {
  const bg = tone === "earn" ? colors.successTint : tone === "loss" ? colors.dangerTint : colors.surface;
  const fg = tone === "earn" ? colors.success : tone === "loss" ? colors.danger : colors.ink;
  return (
    <View style={{ flex: 1, backgroundColor: bg, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 10, gap: 4, borderWidth: tone === "edit" ? 2 : 0, borderColor: colors.ink }}>
      <T weight="extrabold" style={{ fontSize: 10.5, letterSpacing: 0.8, color: tone === "earn" || tone === "loss" ? fg : colors.inkSoft }}>{label}</T>
      {children ?? <T style={{ fontFamily: fonts.display, fontSize: 19, color: fg }} numberOfLines={1} adjustsFontSizeToFit>{value}</T>}
    </View>
  );
}

export function AddFromSupplier({ product, terms, draft, onChange, place }: { product: FindProduct; terms: DropshipTerms; draft: ListingDraft; onChange: (next: ListingDraft) => void; place: string | null }) {
  const t = useT("m_find", "common");
  const words = useMemo(() => wordsOf(t), [t]);
  const set = (patch: Partial<ListingDraft>) => onChange({ ...draft, ...patch });
  const choice = listingChoiceOf(draft);
  const view = listingView(terms, choice, words);
  const badge = supplierBadgeLine(product.supplier, words);
  const stockWord = terms.stockState === "out" ? words("add.outOfStock", "Out of stock") : words("add.inStock", "{count} in stock", { count: terms.stock });
  const options = [...terms.options.map((option) => words(`option.${option}`, option)), stockWord].join(" · ");
  const picked = terms.branding.find((entry) => entry.choice === draft.branding) ?? terms.branding[0];
  const brandNote = picked?.choice === "stickers" ? words("add.stickerNote", "Send {name} a sticker pack", { name: product.supplier.name }) : picked?.choice === "packing_slip" ? words("add.slipNote", "{name} prints your slip", { name: product.supplier.name }) : words("add.brandFree", "Free");
  const shipsFrom = terms.shipsFrom ?? product.supplier.city;

  return (
    <Card style={{ gap: 14 }}>
      <View style={{ gap: 3 }}>
        <T style={{ fontSize: 13, color: colors.inkSoft }}>{shipsFrom ? words("add.from", "From {name} · ships from {city}", { name: product.supplier.name, city: shipsFrom }) : words("add.fromOnly", "From {name}", { name: product.supplier.name })}</T>
        <T weight="semibold" style={{ fontSize: 13.5, color: terms.stockState === "ok" ? colors.ink : colors.warnInk }}>{options}</T>
        {badge ? (
          <View style={{ alignSelf: "flex-start", backgroundColor: colors.successTint, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginTop: 4 }}>
            <T weight="bold" style={{ fontSize: 12, color: colors.success }}>{badge}</T>
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <Money label={words("add.youPay", "YOU PAY")} value={naira(view.pay)} />
        <Money label={words("add.yourPrice", "YOUR PRICE")} tone="edit">
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <T style={{ fontFamily: fonts.display, fontSize: 19 }}>₦</T>
            <TextInput
              value={draft.price}
              onChangeText={(text) => set({ price: text.replace(/[^\d.,]/g, "") })}
              keyboardType="decimal-pad"
              accessibilityLabel={words("add.yourPriceLabel", "Your price")}
              style={{ flex: 1, minWidth: 0, fontFamily: fonts.display, fontSize: 19, color: colors.ink, paddingVertical: 0 }}
            />
          </View>
        </Money>
        <Money label={words("add.youEarn", "YOU EARN")} value={`${view.earn < 0 ? "−" : ""}${naira(Math.abs(view.earn))}`} tone={view.earn < 0 ? "loss" : "earn"} />
      </View>
      {view.floorLine ? <T style={{ fontSize: 13, color: colors.inkSoft, marginTop: -6 }}>{view.floorLine}</T> : null}
      {view.problem ? <T weight="bold" accessibilityRole="alert" style={{ fontSize: 13.5, lineHeight: 19, color: colors.danger }}>{view.problem}</T> : null}

      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <T weight="extrabold" style={{ fontSize: 15, flexShrink: 1 }}>{words("add.delivery", "Delivery to your customers")}</T>
          <T weight="semibold" style={{ fontSize: 12.5, color: colors.inkSoft, marginLeft: "auto" }}>{deliveryLine(terms, place, words)}</T>
        </View>
        <ChipRow>
          {DELIVERY_PAYERS.map((payer) => <Chip key={payer} label={payerLabel(payer, payer === "flat" ? amountOf(draft.flatFee) : null, words)} on={draft.payer === payer} onPress={() => set({ payer })} />)}
        </ChipRow>
        {draft.payer === "flat" ? (
          <PriceInput value={draft.flatFee} onChange={(flatFee) => set({ flatFee })} label={words("add.flatLabel", "Flat delivery fee your customers pay")} suffix={words("add.flatSuffix", "customer pays")} placeholder="2,000" />
        ) : null}
        {draft.payer !== "customer" ? <T style={{ fontSize: 12.5, lineHeight: 18, color: colors.inkSoft }}>{words("add.payerNote", "You cover the rest of delivery from your margin. You earn is worked out on the dearest delivery.")}</T> : null}
      </View>

      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <T weight="extrabold" style={{ fontSize: 15, flexShrink: 1 }}>{words("add.branding", "Your branding")}</T>
          <T weight="semibold" style={{ fontSize: 12.5, color: colors.inkSoft, marginLeft: "auto" }}>{brandNote}</T>
        </View>
        <ChipRow>
          {terms.branding.map((entry) => <Chip key={entry.choice} label={brandingLabel({ label: words(`brandChoice.${entry.choice}`, entry.label), fee: entry.fee })} on={draft.branding === entry.choice} onPress={() => set({ branding: entry.choice })} />)}
        </ChipRow>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.canvas, borderRadius: radii.field, paddingLeft: 14 }}>
          <T weight="bold" style={{ fontSize: 13, color: colors.inkSoft }}>{words("add.sku", "Your SKU or barcode")}</T>
          <Field value={draft.sku} onChangeText={(sku) => set({ sku: sku.slice(0, 64) })} placeholder="AK-ANK-04" autoCapitalize="characters" accessibilityLabel={words("add.sku", "Your SKU or barcode")} style={{ flex: 1, height: 46, borderWidth: 0, backgroundColor: "transparent", textAlign: "right", fontFamily: fonts.mono, fontSize: 15 }} />
        </View>
      </View>
    </Card>
  );
}
