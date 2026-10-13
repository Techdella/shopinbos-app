import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { naira } from "@shared/onboarding";
import { CHANNEL_LABEL, RECORDED_SALE_CHANNELS, type RecordedSaleChannel } from "@shared/channels";
import { SALE_DELIVERY, SALE_PAYMENTS, saleTotals, type SaleDelivery, type SalePayment } from "@shared/sales";
import { AppIcon } from "@/components/icons";
import { ChipRow } from "@/components/kit";
import { Card, Chip, Field, Label, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { Screen } from "@/components/Screen";
import { fetchProducts, type ProductItem } from "@/lib/dashboard";
import { recordSale } from "@/lib/orders";
import { colors } from "@/theme";
import { VoiceInput } from "@/components/VoiceInput";

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
  // One question per screen (build spec 8A): what they bought, how they paid, who bought it, then "Sale saved".
  const [step, setStep] = useState(0);
  const [more, setMore] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

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

  function problem(upTo: number) {
    if (!lines.length) return { step: 0, text: "Tap a product they bought, or type its name." };
    if (upTo < 1) return null;
    if (delivery === "deliver" && (!street.trim() || !city.trim())) return { step: 1, text: "Type where it's going: the street and the area." };
    if (upTo < 2) return null;
    if (!buyerName.trim()) return { step: 2, text: "Type the customer's name, so you know who bought it." };
    return null;
  }

  function next() {
    const found = problem(step);
    if (found) {
      setStep(found.step);
      return setError(found.text);
    }
    setError(null);
    setStep(step + 1);
  }

  async function save() {
    setError(null);
    const found = problem(2);
    if (found) {
      setStep(found.step);
      return setError(found.text);
    }
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
      setSavedId(order.id);
      setBusy(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The sale didn't save. Check your connection and try again.");
      setBusy(false);
    }
  }

  if (savedId) {
    return (
      <Screen title="Sale saved" footer={<PillButton title="Done" onPress={() => (router.canGoBack() ? router.back() : router.replace("/orders"))} />}>
        <Card style={{ alignItems: "center", gap: 12, paddingVertical: 28 }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.successTint, alignItems: "center", justifyContent: "center" }}>
            <AppIcon name="check" size={38} color={colors.success} strokeWidth={2.6} />
          </View>
          <T weight="extrabold" style={{ fontSize: 22 }}>{naira(totals.total)}</T>
          <T style={{ fontSize: 16, lineHeight: 23, textAlign: "center" }}>We added it to today&apos;s sales and took it off how many you have.</T>
        </Card>
        <LinkButton title="See the order" onPress={() => router.replace({ pathname: "/order/[id]", params: { id: savedId } })} />
      </Screen>
    );
  }

  const questions = ["What did they buy?", "How did they pay?", "Who bought it?"];

  return (
    <Screen
      title={questions[step]}
      sub={`Record a sale · step ${step + 1} of 3`}
      footer={
        <View style={{ gap: 6 }}>
          {error && <Notice>{error}</Notice>}
          {step < 2 ? (
            <PillButton title={lines.length ? `Next · ${naira(totals.total)}` : "Next"} onPress={next} />
          ) : (
            <PillButton title={`Save sale · ${naira(totals.total)}`} busy={busy} onPress={() => void save()} />
          )}
          {step > 0 ? <LinkButton title="Back" color={colors.inkSoft} onPress={() => { setError(null); setStep(step - 1); }} /> : null}
        </View>
      }
    >
      {step === 0 ? (
        <>
          <Field accessibilityLabel="Find a product" placeholder="Find a product, or type something new" value={search} onChangeText={setSearch} />
          {matches.map((product) => (
            <Pressable key={product.id} accessibilityRole="button" accessibilityLabel={`Add ${product.name}`} onPress={() => addProduct(product)} style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 18, padding: 12 }}>
              {product.images[0] ? (
                <Image source={{ uri: product.images[0] }} style={{ width: 48, height: 48, borderRadius: 12 }} contentFit="cover" />
              ) : (
                <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: colors.canvas }} />
              )}
              <View style={{ flex: 1 }}>
                <T weight="bold" style={{ fontSize: 16 }} numberOfLines={1}>{product.name}</T>
                <T style={{ color: colors.inkSoft, fontSize: 15 }}>{naira(product.retailPrice)} · {product.currentStock > 0 ? `${product.currentStock} left` : "Sold out"}</T>
              </View>
              <T weight="extrabold" style={{ color: colors.accentInk, fontSize: 15 }}>+ Add</T>
            </Pressable>
          ))}
          {search.trim() ? (
            <Pressable accessibilityRole="button" onPress={() => { setLines((current) => [...current, { key: `c-${Date.now()}`, productId: null, name: search.trim(), price: 0, quantity: 1, image: null }]); setSearch(""); }}>
              <T weight="bold" style={{ color: colors.accentInk, paddingVertical: 8, fontSize: 15 }}>+ Add “{search.trim()}” (not in your shop)</T>
            </Pressable>
          ) : null}

          {lines.length ? <T weight="extrabold" style={{ fontSize: 17, marginTop: 6 }}>They bought</T> : null}
          {lines.map((line) => (
            <Card key={line.key} style={{ gap: 8 }}>
              <Field accessibilityLabel="What it is" value={line.name} onChangeText={(value) => update(line.key, { name: value })} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Field style={{ flex: 1 }} accessibilityLabel="Price in naira" keyboardType="number-pad" placeholder="Price ₦" value={line.price ? String(line.price) : ""} onChangeText={(value) => update(line.key, { price: amount(value) })} />
                <PillButton title="−" tone="white" size="sm" accessibilityLabel="One fewer" onPress={() => update(line.key, { quantity: Math.max(1, line.quantity - 1) })} />
                <T weight="extrabold" style={{ minWidth: 24, textAlign: "center", fontSize: 17 }}>{line.quantity}</T>
                <PillButton title="+" tone="white" size="sm" accessibilityLabel="One more" onPress={() => update(line.key, { quantity: line.quantity + 1 })} />
              </View>
              <LinkButton title="Remove" color={colors.danger} style={{ alignItems: "flex-start" }} onPress={() => setLines((current) => current.filter((item) => item.key !== line.key))} />
            </Card>
          ))}
        </>
      ) : null}

      {step === 1 ? (
        <>
          <ChipRow>
            {SALE_PAYMENTS.map((option) => <Chip key={option.key} label={option.label} on={payment === option.key} onPress={() => setPayment(option.key)} />)}
          </ChipRow>
          <T weight="extrabold" style={{ fontSize: 22, marginTop: 12 }}>Do they have it already?</T>
          <ChipRow>
            {SALE_DELIVERY.map((option) => <Chip key={option.key} label={option.label} on={delivery === option.key} onPress={() => setDelivery(option.key)} />)}
          </ChipRow>
          {delivery === "deliver" && (
            <>
              <Field accessibilityLabel="Street" placeholder="Street" value={street} onChangeText={setStreet} />
              <Field accessibilityLabel="Area or city" placeholder="Area or city" value={city} onChangeText={setCity} />
              <Field accessibilityLabel="Delivery price in naira" placeholder="Delivery price ₦ (optional)" keyboardType="number-pad" value={deliveryFee} onChangeText={setDeliveryFee} />
            </>
          )}
        </>
      ) : null}

      {step === 2 ? (
        <>
          <Field accessibilityLabel="Customer's name" placeholder="Customer's name" value={buyerName} onChangeText={setBuyerName} />
          <Field accessibilityLabel="Phone or WhatsApp (optional)" placeholder="Phone or WhatsApp (optional)" keyboardType="phone-pad" value={buyerPhone} onChangeText={setBuyerPhone} />
          {more ? (
            <>
              <Label>Where did they buy?</Label>
              <ChipRow>
                {RECORDED_SALE_CHANNELS.map((key) => <Chip key={key} label={CHANNEL_LABEL[key]} on={channel === key} onPress={() => setChannel(key)} />)}
              </ChipRow>
              <Field accessibilityLabel="Note (optional)" placeholder="Note (optional)" value={notes} onChangeText={setNotes} />
              <VoiceInput value={notes} onChange={setNotes} context="a note about a sale" />
            </>
          ) : (
            <LinkButton title="Where they bought it and a note (optional)" color={colors.inkSoft} onPress={() => setMore(true)} />
          )}
        </>
      ) : null}
    </Screen>
  );
}
