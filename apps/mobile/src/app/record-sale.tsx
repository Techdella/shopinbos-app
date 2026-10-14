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
import { useT } from "@/lib/i18n";

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
  const t = useT("m_orders", "common");
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
    if (!lines.length) return { step: 0, text: t("sale.needProduct") };
    if (upTo < 1) return null;
    if (delivery === "deliver" && (!street.trim() || !city.trim())) return { step: 1, text: t("sale.needAddress") };
    if (upTo < 2) return null;
    if (!buyerName.trim()) return { step: 2, text: t("sale.needName") };
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
      setError(saveError instanceof Error ? saveError.message : t("sale.saveFailed"));
      setBusy(false);
    }
  }

  if (savedId) {
    return (
      <Screen title={t("sale.saved")} footer={<PillButton title={t("done")} onPress={() => (router.canGoBack() ? router.back() : router.replace("/orders"))} />}>
        <Card style={{ alignItems: "center", gap: 12, paddingVertical: 28 }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.successTint, alignItems: "center", justifyContent: "center" }}>
            <AppIcon name="check" size={38} color={colors.success} strokeWidth={2.6} />
          </View>
          <T weight="extrabold" style={{ fontSize: 22 }}>{naira(totals.total)}</T>
          <T style={{ fontSize: 16, lineHeight: 23, textAlign: "center" }}>{t("sale.savedBody")}</T>
        </Card>
        <LinkButton title={t("sale.seeOrder")} onPress={() => router.replace({ pathname: "/order/[id]", params: { id: savedId } })} />
      </Screen>
    );
  }

  const questions = [t("sale.q1"), t("sale.q2"), t("sale.q3")];

  return (
    <Screen
      title={questions[step]}
      sub={t("sale.step", { step: step + 1, total: 3 })}
      footer={
        <View style={{ gap: 6 }}>
          {error && <Notice>{error}</Notice>}
          {step < 2 ? (
            <PillButton title={lines.length ? t("sale.nextTotal", { total: naira(totals.total) }) : t("next")} onPress={next} />
          ) : (
            <PillButton title={t("sale.save", { total: naira(totals.total) })} busy={busy} onPress={() => void save()} />
          )}
          {step > 0 ? <LinkButton title={t("back")} color={colors.inkSoft} onPress={() => { setError(null); setStep(step - 1); }} /> : null}
        </View>
      }
    >
      {step === 0 ? (
        <>
          <Field accessibilityLabel={t("sale.find")} placeholder={t("sale.findPlaceholder")} value={search} onChangeText={setSearch} />
          {matches.map((product) => (
            <Pressable key={product.id} accessibilityRole="button" accessibilityLabel={t("sale.addName", { name: product.name })} onPress={() => addProduct(product)} style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 18, padding: 12 }}>
              {product.images[0] ? (
                <Image source={{ uri: product.images[0] }} style={{ width: 48, height: 48, borderRadius: 12 }} contentFit="cover" />
              ) : (
                <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: colors.canvas }} />
              )}
              <View style={{ flex: 1 }}>
                <T weight="bold" style={{ fontSize: 16 }} numberOfLines={1}>{product.name}</T>
                <T style={{ color: colors.inkSoft, fontSize: 15 }}>{naira(product.retailPrice)} · {product.currentStock > 0 ? t("sale.left", { count: product.currentStock }) : t("sale.soldOut")}</T>
              </View>
              <T weight="extrabold" style={{ color: colors.accentInk, fontSize: 15 }}>{t("sale.add")}</T>
            </Pressable>
          ))}
          {search.trim() ? (
            <Pressable accessibilityRole="button" onPress={() => { setLines((current) => [...current, { key: `c-${Date.now()}`, productId: null, name: search.trim(), price: 0, quantity: 1, image: null }]); setSearch(""); }}>
              <T weight="bold" style={{ color: colors.accentInk, paddingVertical: 8, fontSize: 15 }}>{t("sale.addNew", { name: search.trim() })}</T>
            </Pressable>
          ) : null}

          {lines.length ? <T weight="extrabold" style={{ fontSize: 17, marginTop: 6 }}>{t("sale.theyBought")}</T> : null}
          {lines.map((line) => (
            <Card key={line.key} style={{ gap: 8 }}>
              <Field accessibilityLabel={t("sale.whatItIs")} value={line.name} onChangeText={(value) => update(line.key, { name: value })} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Field style={{ flex: 1 }} accessibilityLabel={t("sale.priceLabel")} keyboardType="number-pad" placeholder={t("sale.pricePlaceholder")} value={line.price ? String(line.price) : ""} onChangeText={(value) => update(line.key, { price: amount(value) })} />
                <PillButton title="−" tone="white" size="sm" accessibilityLabel={t("sale.fewer")} onPress={() => update(line.key, { quantity: Math.max(1, line.quantity - 1) })} />
                <T weight="extrabold" style={{ minWidth: 24, textAlign: "center", fontSize: 17 }}>{line.quantity}</T>
                <PillButton title="+" tone="white" size="sm" accessibilityLabel={t("sale.more")} onPress={() => update(line.key, { quantity: line.quantity + 1 })} />
              </View>
              <LinkButton title={t("remove")} color={colors.danger} style={{ alignItems: "flex-start" }} onPress={() => setLines((current) => current.filter((item) => item.key !== line.key))} />
            </Card>
          ))}
        </>
      ) : null}

      {step === 1 ? (
        <>
          <ChipRow>
            {SALE_PAYMENTS.map((option) => <Chip key={option.key} label={t.dynamic(`sale.payment.${option.key}`, option.label)} on={payment === option.key} onPress={() => setPayment(option.key)} />)}
          </ChipRow>
          <T weight="extrabold" style={{ fontSize: 22, marginTop: 12 }}>{t("sale.haveIt")}</T>
          <ChipRow>
            {SALE_DELIVERY.map((option) => <Chip key={option.key} label={t.dynamic(`sale.delivery.${option.key}`, option.label)} on={delivery === option.key} onPress={() => setDelivery(option.key)} />)}
          </ChipRow>
          {delivery === "deliver" && (
            <>
              <Field accessibilityLabel={t("sale.street")} placeholder={t("sale.street")} value={street} onChangeText={setStreet} />
              <Field accessibilityLabel={t("sale.city")} placeholder={t("sale.city")} value={city} onChangeText={setCity} />
              <Field accessibilityLabel={t("sale.deliveryLabel")} placeholder={t("sale.deliveryPlaceholder")} keyboardType="number-pad" value={deliveryFee} onChangeText={setDeliveryFee} />
            </>
          )}
        </>
      ) : null}

      {step === 2 ? (
        <>
          <Field accessibilityLabel={t("sale.customerName")} placeholder={t("sale.customerName")} value={buyerName} onChangeText={setBuyerName} />
          <Field accessibilityLabel={t("sale.customerPhone")} placeholder={t("sale.customerPhone")} keyboardType="phone-pad" value={buyerPhone} onChangeText={setBuyerPhone} />
          {more ? (
            <>
              <Label>{t("sale.where")}</Label>
              <ChipRow>
                {RECORDED_SALE_CHANNELS.map((key) => <Chip key={key} label={key === "in_person" ? t("sale.inPerson") : CHANNEL_LABEL[key]} on={channel === key} onPress={() => setChannel(key)} />)}
              </ChipRow>
              <Field accessibilityLabel={t("sale.note")} placeholder={t("sale.note")} value={notes} onChangeText={setNotes} />
              <VoiceInput value={notes} onChange={setNotes} context="a note about a sale" />
            </>
          ) : (
            <LinkButton title={t("sale.moreLink")} color={colors.inkSoft} onPress={() => setMore(true)} />
          )}
        </>
      ) : null}
    </Screen>
  );
}
