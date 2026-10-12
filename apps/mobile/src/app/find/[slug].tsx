import { useMemo, useState } from "react";
import { Dimensions, Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { naira } from "@shared/onboarding";
import { AppIcon } from "@/components/icons";
import { Badge, ErrorState, Initials, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Field, Label, Notice, PillButton, Segmented, T } from "@/components/ui";
import { clampSellingPrice, priceStep, saleBreakdown, tierPrice } from "@/lib/find-pure";
import { addToStore, fetchFindContext, fetchFindProduct, requestQuote, type FindContext, type FindProduct } from "@/lib/marketplace";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors, radii } from "@/theme";

// One supplier product (web /marketplace/product/[id]): photos, Dropship (pick your price, see what you keep,
// add it to your store as a draft) or Wholesale (quantity, tier price, request a quote), and Message supplier.

function Stepper({ label, value, onMinus, onPlus, minusOff, plusOff }: { label: string; value: string; onMinus: () => void; onPlus: () => void; minusOff?: boolean; plusOff?: boolean }) {
  const button = (text: string, onPress: () => void, off?: boolean) => (
    <Pressable accessibilityRole="button" accessibilityLabel={`${text === "−" ? "Lower" : "Raise"} ${label.toLowerCase()}`} disabled={off} onPress={onPress} hitSlop={6} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center", opacity: off ? 0.4 : 1 }}>
      <T weight="extrabold" style={{ fontSize: 22 }}>{text}</T>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      {button("−", onMinus, minusOff)}
      <View style={{ flex: 1, alignItems: "center" }} accessibilityLabel={`${label} ${value}`}>
        <T style={{ color: colors.inkSoft, fontSize: 12 }}>{label}</T>
        <T weight="extrabold" style={{ fontSize: 24, letterSpacing: -0.4 }}>{value}</T>
      </View>
      {button("+", onPlus, plusOff)}
    </View>
  );
}

function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
      <T weight={strong ? "extrabold" : "regular"} style={{ color: strong ? colors.ink : colors.inkSoft }}>{label}</T>
      <T weight={strong ? "extrabold" : "bold"} style={{ color: tone ?? colors.ink }}>{value}</T>
    </View>
  );
}

export default function FindProductDetail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const loaded = useLoad(async () => {
    const [product, context] = await Promise.all([fetchFindProduct(String(slug)), fetchFindContext().catch(() => null)]);
    return { product, context };
  }, String(slug));

  if (!loaded.data) {
    return (
      <Screen title="Product" refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
        {loaded.loading ? <LoadingBlock /> : null}
        {loaded.error ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      </Screen>
    );
  }
  // Keyed by product so the price and quantity start from this product's numbers.
  return <ProductView key={loaded.data.product.id} product={loaded.data.product} context={loaded.data.context} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()} />;
}

function ProductView({ product, context, refreshing, onRefresh }: { product: FindProduct; context: FindContext | null; refreshing: boolean; onRefresh: () => void }) {
  const [mode, setMode] = useState<"dropship" | "wholesale">(product.dropship ? "dropship" : "wholesale");
  const [price, setPrice] = useState(() => clampSellingPrice(product.price || product.cost * 1.5, product.cost));
  const [quantity, setQuantity] = useState(product.moq);
  const [destination, setDestination] = useState(context?.destination ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);
  const [photo, setPhoto] = useState(0);
  const width = Dimensions.get("window").width - 36;

  const sale = useMemo(() => saleBreakdown(price, product.cost), [price, product]);
  const already = Boolean(context?.addedIds.includes(product.id)) || Boolean(addedId);

  const step = priceStep(price);
  const unit = tierPrice(product.tiers, quantity, product.cost);
  const qtyStep = quantity >= 100 ? 10 : quantity >= 20 ? 5 : 1;

  async function add() {
    setBusy(true);
    setNote(null);
    try {
      const result = await addToStore(product.id, price);
      setAddedId(result.storeProductId);
      setNote({ tone: "success", text: result.already ? "It's already in your store." : `Added to your store as a draft at ${naira(price)}. Publish it from Products when you're ready.` });
    } catch (addError) {
      setNote({ tone: "error", text: addError instanceof Error ? addError.message : "Couldn't add it. Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function quote() {
    setBusy(true);
    setNote(null);
    try {
      await requestQuote({ supplierId: product.supplier.id, supplierProductId: product.id, quantity, destination: destination.trim() || "Nigeria" });
      setNote({ tone: "success", text: `Quote requested for ${quantity}. ${product.supplier.name} answers in your notifications and messages.` });
    } catch (quoteError) {
      setNote({ tone: "error", text: quoteError instanceof Error ? quoteError.message : "Couldn't send the request. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const footer =
    mode === "dropship" ? (
      already ? (
        <PillButton title="See it in Products" tone="white" onPress={() => router.push("/products")} />
      ) : (
        <PillButton title={`Add to my store at ${naira(price)}`} busy={busy} onPress={() => void add()} />
      )
    ) : (
      <PillButton title={`Request a quote for ${quantity}`} busy={busy} onPress={() => void quote()} />
    );

  return (
    <Screen title={product.name} refreshing={refreshing} onRefresh={onRefresh} footer={footer}>
      {product.images.length ? (
        <View>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={(event) => setPhoto(Math.round(event.nativeEvent.contentOffset.x / width))} style={{ borderRadius: radii.card }}>
            {product.images.map((uri, index) => (
              <Image key={uri + index} source={{ uri }} style={{ width, height: width, borderRadius: radii.card, backgroundColor: colors.lilac }} contentFit="cover" accessibilityLabel={`${product.name} photo ${index + 1}`} />
            ))}
          </ScrollView>
          {product.images.length > 1 ? (
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 8 }}>
              {product.images.map((uri, index) => <View key={uri + index} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: index === photo ? colors.ink : colors.toggleOff }} />)}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <Badge label={product.category} />
        {product.ships ? <Badge label={product.ships} /> : null}
        {product.stock > 0 ? <Badge label={`${product.stock} in stock`} /> : <Badge label="Out of stock" bg={colors.dangerTint} fg={colors.danger} />}
        {already ? <Badge label="In your store" bg={colors.successTint} fg={colors.success} /> : null}
      </View>

      <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Initials name={product.supplier.name} bg={colors.mintTint} fg={colors.forest} />
        <View style={{ flex: 1 }}>
          <T weight="extrabold" style={{ fontSize: 15 }} numberOfLines={1}>{product.supplier.name}</T>
          <T style={{ color: colors.inkSoft, fontSize: 12.5 }} numberOfLines={1}>
            {[product.supplier.city, product.supplier.rating ? `★ ${product.supplier.rating.toFixed(1)}` : null, product.supplier.responds].filter(Boolean).join(" · ")}
          </T>
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/partners/[id]", params: { id: product.supplier.id, name: product.supplier.name } })} style={{ height: 38, borderRadius: radii.pill, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.canvas }}>
          <AppIcon name="chat" size={16} />
          <T weight="bold" style={{ fontSize: 13 }}>Message</T>
        </Pressable>
      </Card>

      {product.dropship && product.wholesale ? (
        <Segmented
          options={[
            { value: "dropship", label: "Dropship" },
            { value: "wholesale", label: "Wholesale" },
          ]}
          value={mode}
          onChange={setMode}
        />
      ) : null}

      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}

      {mode === "dropship" ? (
        <Card style={{ gap: 6 }}>
          <T style={{ color: colors.inkSoft, lineHeight: 20, marginBottom: 6 }}>No stock to buy. When a shopper orders, {product.supplier.name} sends it to them and you keep the difference.</T>
          <Stepper
            label="Your selling price"
            value={naira(price)}
            onMinus={() => setPrice((current) => clampSellingPrice(current - priceStep(current - 1), product.cost))}
            onPlus={() => setPrice((current) => clampSellingPrice(current + step, product.cost))}
            minusOff={price <= clampSellingPrice(0, product.cost)}
            plusOff={price >= clampSellingPrice(Number.MAX_SAFE_INTEGER, product.cost)}
          />
          <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 }}>
            <Line label="Shopper pays" value={naira(sale.shopperPays)} />
            <Line label="Supplier gets" value={`− ${naira(sale.supplierGets)}`} />
            <Line label="Payment fee" value={`− ${naira(sale.fee)}`} />
            <Line label={`You keep (${sale.keepPct}%)`} value={naira(sale.keep)} strong tone={sale.keep > 0 ? colors.success : colors.danger} />
          </View>
          {product.price ? <T style={{ color: colors.inkSoft, fontSize: 12.5 }}>Suggested price {naira(product.price)}. Delivery is added at checkout.</T> : null}
        </Card>
      ) : (
        <Card style={{ gap: 8 }}>
          <T style={{ color: colors.inkSoft, lineHeight: 20, marginBottom: 6 }}>Buy stock to keep and sell yourself. Minimum order {product.moq}.</T>
          <Stepper
            label="Quantity"
            value={String(quantity)}
            onMinus={() => setQuantity((current) => Math.max(product.moq, current - qtyStep))}
            onPlus={() => setQuantity((current) => Math.min(1_000_000, current + qtyStep))}
            minusOff={quantity <= product.moq}
          />
          <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 }}>
            <Line label="Price each" value={naira(unit)} />
            <Line label="Estimated total" value={naira(unit * quantity)} strong />
          </View>
          {product.tiers.length ? (
            <View style={{ gap: 4 }}>
              <T weight="bold" style={{ fontSize: 13 }}>Bulk prices</T>
              {product.tiers.map((tier) => (
                <T key={tier.minQty} style={{ color: colors.inkSoft, fontSize: 13 }}>
                  {tier.maxQty ? `${tier.minQty}–${tier.maxQty}` : `${tier.minQty}+`}: {naira(tier.price)} each
                </T>
              ))}
            </View>
          ) : null}
          <Label>Deliver to</Label>
          <Field value={destination} onChangeText={setDestination} placeholder="City, state" maxLength={200} />
          <T style={{ color: colors.inkSoft, fontSize: 12.5 }}>The supplier confirms the final price and delivery in their quote.</T>
        </Card>
      )}

      {product.description ? (
        <Card style={{ gap: 6 }}>
          <T weight="extrabold" style={{ fontSize: 15 }}>About this product</T>
          <T style={{ color: colors.inkSoft, lineHeight: 21 }}>{product.description}</T>
        </Card>
      ) : null}

      <PillButton title="Open on the web" tone="white" size="md" onPress={() => void openWeb(`/marketplace/product/${encodeURIComponent(product.id)}`)} />
    </Screen>
  );
}
