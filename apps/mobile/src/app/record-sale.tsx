import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { naira } from "@shared/onboarding";
import { CHANNEL_LABEL, RECORDED_SALE_CHANNELS, type RecordedSaleChannel } from "@shared/channels";
import { SALE_DELIVERY, SALE_PAYMENTS, saleTotals, type SaleDelivery, type SalePayment } from "@shared/sales";
import { Card, Chip, Field, Label, Notice, PillButton, T } from "@/components/ui";
import { Screen } from "@/components/Screen";
import { fetchProducts, type ProductItem } from "@/lib/dashboard";
import { recordSale } from "@/lib/orders";
import { colors } from "@/theme";

interface Line {
  key: string;
  productId: string | null;
  name: string;
  price: number;
  quantity: number;
  image: string | null;
}

const amount = (value: string) => Number(value.replace(/[^\d.]/g, "")) || 0;

// "Record sale" quick action: a sale made on WhatsApp, Instagram or in person. Same API and rules as the web form.
export default function RecordSale() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [channel, setChannel] = useState<RecordedSaleChannel>("whatsapp");
  const [payment, setPayment] = useState<SalePayment>("transfer");
  const [delivery, setDelivery] = useState<SaleDelivery>("collected");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProducts().then(setProducts).catch(() => setProducts([]));
  }, []);

  const matches = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products.slice(0, 4);
    return products.filter((product) => product.name.toLowerCase().includes(query)).slice(0, 6);
  }, [products, search]);

  const totals = saleTotals(lines, delivery === "deliver" ? amount(deliveryFee) : 0);

  function addProduct(product: ProductItem) {
    setLines((current) => {
      const existing = current.find((line) => line.productId === product.id);
      if (existing) return current.map((line) => (line === existing ? { ...line, quantity: line.quantity + 1 } : line));
      return [...current, { key: product.id, productId: product.id, name: product.name, price: product.retailPrice, quantity: 1, image: product.images[0] ?? null }];
    });
    setSearch("");
  }

  function update(key: string, patch: Partial<Line>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  async function save() {
    setError(null);
    if (!lines.length) return setError("Add at least one item.");
    if (!buyerName.trim()) return setError("Add the customer's name.");
    if (delivery === "deliver" && (!street.trim() || !city.trim())) return setError("Add the delivery address.");
    setBusy(true);
    try {
      const order = await recordSale({
        buyerName,
        buyerPhone: buyerPhone || null,
        items: lines.map(({ productId, name, price, quantity }) => ({ productId, name, price, quantity })),
        payment,
        delivery,
        deliveryFee: amount(deliveryFee),
        address: delivery === "deliver" ? { street, city } : null,
        channel,
        notes: notes || null,
      });
      router.replace({ pathname: "/order/[id]", params: { id: order.id } });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Couldn't save this sale.");
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Record a sale"
      sub="Sold on WhatsApp, Instagram or in person? Add it so your sales and stock stay right."
      footer={
        <>
          {error && <View style={{ marginBottom: 10 }}><Notice>{error}</Notice></View>}
          <PillButton title={lines.length ? `Save sale · ${naira(totals.total)}` : "Save sale"} busy={busy} onPress={() => void save()} />
        </>
      }
    >
      <Card style={{ gap: 10 }}>
        <T weight="extrabold" style={{ fontSize: 16 }}>What did they buy?</T>
        <Field accessibilityLabel="Search your products" placeholder="Search, or type something new" value={search} onChangeText={setSearch} />
        {matches.map((product) => (
          <Pressable key={product.id} accessibilityRole="button" accessibilityLabel={`Add ${product.name}`} onPress={() => addProduct(product)} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {product.images[0] ? (
              <Image source={{ uri: product.images[0] }} style={{ width: 40, height: 40, borderRadius: 10 }} contentFit="cover" />
            ) : (
              <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.canvas }} />
            )}
            <View style={{ flex: 1 }}>
              <T weight="bold" numberOfLines={1}>{product.name}</T>
              <T style={{ color: colors.inkSoft, fontSize: 13 }}>{naira(product.retailPrice)} · {product.currentStock > 0 ? `${product.currentStock} in stock` : "Sold out"}</T>
            </View>
            <T weight="extrabold" style={{ color: colors.accentInk }}>Add</T>
          </Pressable>
        ))}
        {search.trim() ? (
          <Pressable accessibilityRole="button" onPress={() => { setLines((current) => [...current, { key: `c-${Date.now()}`, productId: null, name: search.trim(), price: 0, quantity: 1, image: null }]); setSearch(""); }}>
            <T weight="bold" style={{ color: colors.accentInk, paddingVertical: 6 }}>+ Add “{search.trim()}” (not in your shop)</T>
          </Pressable>
        ) : null}

        {lines.map((line) => (
          <View key={line.key} style={{ backgroundColor: colors.canvas, borderRadius: 16, padding: 12, gap: 8 }}>
            <Field accessibilityLabel="Item name" value={line.name} onChangeText={(value) => update(line.key, { name: value })} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Field style={{ flex: 1 }} accessibilityLabel="Price in naira" keyboardType="number-pad" placeholder="Price (₦)" value={line.price ? String(line.price) : ""} onChangeText={(value) => update(line.key, { price: amount(value) })} />
              <PillButton title="−" tone="white" size="sm" accessibilityLabel="One fewer" onPress={() => update(line.key, { quantity: Math.max(1, line.quantity - 1) })} />
              <T weight="extrabold" style={{ minWidth: 22, textAlign: "center" }}>{line.quantity}</T>
              <PillButton title="+" tone="white" size="sm" accessibilityLabel="One more" onPress={() => update(line.key, { quantity: line.quantity + 1 })} />
            </View>
            <Pressable onPress={() => setLines((current) => current.filter((item) => item.key !== line.key))} hitSlop={8}>
              <T weight="bold" style={{ color: colors.danger }}>Remove</T>
            </Pressable>
          </View>
        ))}
      </Card>

      <Card style={{ gap: 10 }}>
        <T weight="extrabold" style={{ fontSize: 16 }}>Who bought it?</T>
        <Field accessibilityLabel="Customer name" placeholder="Customer name" value={buyerName} onChangeText={setBuyerName} />
        <Field accessibilityLabel="Phone or WhatsApp" placeholder="Phone or WhatsApp (optional)" keyboardType="phone-pad" value={buyerPhone} onChangeText={setBuyerPhone} />
        <Label>Where did they buy?</Label>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {RECORDED_SALE_CHANNELS.map((key) => <Chip key={key} label={CHANNEL_LABEL[key]} on={channel === key} onPress={() => setChannel(key)} />)}
        </View>
      </Card>

      <Card style={{ gap: 10 }}>
        <T weight="extrabold" style={{ fontSize: 16 }}>Payment</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {SALE_PAYMENTS.map((option) => <Chip key={option.key} label={option.label} on={payment === option.key} onPress={() => setPayment(option.key)} />)}
        </View>
        <T weight="extrabold" style={{ fontSize: 16, marginTop: 6 }}>Delivery</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {SALE_DELIVERY.map((option) => <Chip key={option.key} label={option.label} on={delivery === option.key} onPress={() => setDelivery(option.key)} />)}
        </View>
        {delivery === "deliver" && (
          <>
            <Field accessibilityLabel="Delivery address" placeholder="Street address" value={street} onChangeText={setStreet} />
            <Field accessibilityLabel="Area or city" placeholder="Area or city" value={city} onChangeText={setCity} />
            <Field accessibilityLabel="Delivery fee in naira" placeholder="Delivery fee (₦)" keyboardType="number-pad" value={deliveryFee} onChangeText={setDeliveryFee} />
          </>
        )}
        <Field accessibilityLabel="Note" placeholder="Note (optional)" value={notes} onChangeText={setNotes} />
      </Card>
    </Screen>
  );
}
