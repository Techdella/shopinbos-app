import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { naira } from "@shared/onboarding";
import { AppIcon } from "@/components/icons";
import { ChipRow } from "@/components/kit";
import { LinkShareButtons } from "@/components/LinkShareButtons";
import { ProductPickSheet } from "@/components/ProductPickSheet";
import { Screen } from "@/components/Screen";
import { Card, Chip, Field, Label, LinkButton, Notice, PillButton, T, Toggle } from "@/components/ui";
import { createPaymentLink, fetchPaymentLinks, fetchPublishedProducts, type CreatedLink } from "@/lib/paylinks";
import { addLine, createProblem, createdTitle, EMPTY_DELIVERY, EXPIRY_CHOICES, linesTotal, MAX_LINK_ITEMS, parseFee, parseNaira, setQuantity, type DraftDelivery, type DraftForm, type DraftLine } from "@/lib/paylinks-pure";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors, radii } from "@/theme";

// New payment link (the web's "Make a payment link" dialog): products and how many, one customer or reusable, how
// long it works, and (more options) an agreed price, a note and the customer's name and WhatsApp number. Then the
// link with Copy, Share and Send on WhatsApp. Options (size, colour…) are left for the customer to choose.

const EMPTY_FORM: DraftForm = { amount: "", note: "", buyerName: "", buyerPhone: "", oneTime: true, expiry: "7d", deliveryOn: false, delivery: EMPTY_DELIVERY };

export default function NewPaymentLink() {
  const t = useT("m_paylinks", "m_ui");
  const products = useLoad(fetchPublishedProducts);
  const readiness = useLoad(fetchPaymentLinks);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [form, setForm] = useState<DraftForm>(EMPTY_FORM);
  const [picking, setPicking] = useState(false);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedLink | null>(null);

  const update = (change: Partial<DraftForm>) => {
    setForm((current) => ({ ...current, ...change }));
    setProblem(null);
  };
  const setDelivery = (change: Partial<DraftDelivery>) => update({ delivery: { ...(form.delivery ?? EMPTY_DELIVERY), ...change } });
  const delivery = form.delivery ?? EMPTY_DELIVERY;
  const agreed = parseNaira(form.amount);
  // The saved delivery fee is part of what the customer pays.
  const total = (agreed ?? linesTotal(lines)) + (form.deliveryOn ? parseFee(delivery.fee) ?? 0 : 0);
  const notReady = readiness.data ? !readiness.data.readiness.ready : false;

  async function make() {
    const missing = createProblem(lines, form);
    if (missing) return setProblem(t(`problem.${missing}`));
    setBusy(true);
    setProblem(null);
    try {
      setCreated(await createPaymentLink(lines, form));
    } catch (makeError) {
      setProblem(makeError instanceof Error ? makeError.message : t("create.couldNot"));
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    const title = created.title || createdTitle(created.items, t("detail.title"));
    const message = t("shareMessage", { title, amount: naira(created.total), url: created.url });
    return (
      <Screen
        title={t("done.title")}
        sub={t("done.sub")}
        footer={<PillButton title={t("done.close")} onPress={() => (router.canGoBack() ? router.back() : router.replace("/payment-links"))} />}
      >
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <T weight="extrabold" style={{ flex: 1, fontSize: 17 }} numberOfLines={2}>{title}</T>
            <T weight="extrabold" style={{ fontSize: 17 }}>{naira(created.total)}</T>
          </View>
          <LinkShareButtons url={created.url} message={message} whatsappTo={form.buyerPhone} />
        </Card>
        <LinkButton title={t("done.see")} onPress={() => router.replace({ pathname: "/payment-links/[id]", params: { id: created.id } })} />
        <LinkButton
          title={t("done.another")}
          onPress={() => {
            setCreated(null);
            setLines([]);
            setForm(EMPTY_FORM);
            setMore(false);
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen
      title={t("create.title")}
      sub={t("create.sub")}
      footer={
        <View style={{ gap: 8 }}>
          {problem ? <Notice>{problem}</Notice> : null}
          <PillButton testID="make-link" busy={busy} onPress={() => void make()} accessibilityLabel={t("create.make")} icon="link" title={total > 0 ? `${t("create.make")} · ${naira(total)}` : t("create.make")} />
        </View>
      }
    >
      {notReady ? (
        <View style={{ gap: 4 }}>
          <Notice tone="info">{t("notReady")}</Notice>
          <LinkButton title={t("setUpPayments")} onPress={() => router.push("/payments")} />
        </View>
      ) : null}

      <T weight="extrabold" style={{ fontSize: 17 }} accessibilityRole="header">{t("create.products")}</T>
      {lines.map((line) => (
        <Card key={line.productId} style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            {line.image ? (
              <Image source={{ uri: line.image }} style={{ width: 48, height: 48, borderRadius: 12 }} contentFit="cover" />
            ) : (
              <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
                <AppIcon name="box" size={20} color={colors.inkSoft} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <T weight="bold" style={{ fontSize: 16 }} numberOfLines={2}>{line.name}</T>
              <T style={{ color: colors.inkSoft, fontSize: 14.5 }}>{t("create.each", { price: naira(line.price) })}</T>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={t("create.remove")} hitSlop={6} onPress={() => setLines((current) => setQuantity(current, line.productId, 0))} style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" }}>
              <AppIcon name="x" size={18} color={colors.inkSoft} />
            </Pressable>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <T style={{ flex: 1, color: colors.inkSoft, fontSize: 15 }}>{t("create.quantity")}</T>
            <Stepper
              value={line.quantity}
              lessLabel={t("create.less")}
              moreLabel={t("create.more")}
              onChange={(quantity) => {
                setLines((current) => setQuantity(current, line.productId, quantity));
                setProblem(null);
              }}
            />
          </View>
        </Card>
      ))}
      {lines.length < MAX_LINK_ITEMS ? (
        <PillButton size="md" tone="white" onPress={() => setPicking(true)} accessibilityLabel={lines.length ? t("create.addAnother") : t("create.add")} icon="plus" title={lines.length ? t("create.addAnother") : t("create.add")} />
      ) : null}

      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <T weight="bold" style={{ fontSize: 16 }}>{t("create.oneTime")}</T>
            <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20, marginTop: 2 }}>{t("create.oneTimeHint")}</T>
          </View>
          <Toggle on={form.oneTime} onChange={(oneTime) => update({ oneTime })} label={t("create.oneTime")} />
        </View>
        <View>
          <Label>{t("create.expiry")}</Label>
          <ChipRow>
            {EXPIRY_CHOICES.map((choice) => <Chip key={choice} label={t(`expiry.${choice}`)} on={form.expiry === choice} onPress={() => update({ expiry: choice })} />)}
          </ChipRow>
        </View>
      </Card>

      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <T weight="bold" style={{ fontSize: 16 }}>{t("create.delivery")}</T>
            <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20, marginTop: 2 }}>{t("create.deliveryHint")}</T>
          </View>
          <Toggle on={Boolean(form.deliveryOn)} onChange={(deliveryOn) => update({ deliveryOn })} label={t("create.delivery")} />
        </View>
        {form.deliveryOn ? (
          <>
            <View>
              <Label>{t("create.deliveryStreet")}</Label>
              <Field value={delivery.street} onChangeText={(street) => setDelivery({ street })} maxLength={200} autoComplete="off" />
            </View>
            <View>
              <Label>{t("create.deliveryCity")}</Label>
              <Field value={delivery.city} onChangeText={(city) => setDelivery({ city })} maxLength={120} autoComplete="off" />
            </View>
            <View>
              <Label>{t("create.deliveryState")}</Label>
              <Field value={delivery.state} onChangeText={(state) => setDelivery({ state })} maxLength={80} autoComplete="off" placeholder="Lagos" />
            </View>
            <View>
              <Label>{t("create.deliveryLandmark")}</Label>
              <Field value={delivery.landmark} onChangeText={(landmark) => setDelivery({ landmark })} maxLength={160} autoComplete="off" />
            </View>
            <View>
              <Label>{t("create.deliveryFee")}</Label>
              <Field value={delivery.fee} onChangeText={(fee) => setDelivery({ fee: fee.replace(/[^\d.,]/g, "") })} keyboardType="decimal-pad" placeholder="0" />
              <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20, marginTop: 6 }}>{t("create.deliveryFeeHint")}</T>
            </View>
          </>
        ) : null}
      </Card>

      <LinkButton title={more ? t("create.showLess") : t("create.showMore")} onPress={() => setMore((open) => !open)} />
      {more ? (
        <Card style={{ gap: 14 }}>
          <View>
            <Label>{t("create.amount")}</Label>
            <Field value={form.amount} onChangeText={(amount) => update({ amount: amount.replace(/[^\d.,]/g, "") })} keyboardType="decimal-pad" placeholder={lines.length ? String(Math.round(linesTotal(lines))) : ""} />
            <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20, marginTop: 6 }}>{t("create.amountHint")}</T>
          </View>
          <View>
            <Label>{t("create.note")}</Label>
            <Field value={form.note} onChangeText={(note) => update({ note })} maxLength={500} multiline style={{ height: 88, paddingTop: 14, textAlignVertical: "top", borderRadius: radii.field }} />
          </View>
          <View>
            <Label>{t("create.buyerName")}</Label>
            <Field value={form.buyerName} onChangeText={(buyerName) => update({ buyerName })} maxLength={120} autoComplete="off" />
          </View>
          <View>
            <Label>{t("create.buyerPhone")}</Label>
            <Field value={form.buyerPhone} onChangeText={(buyerPhone) => update({ buyerPhone })} maxLength={40} keyboardType="phone-pad" placeholder="0803 123 4567" />
          </View>
        </Card>
      ) : null}

      <ProductPickSheet
        visible={picking}
        onClose={() => setPicking(false)}
        title={t("create.pickTitle")}
        products={products.data}
        loading={products.loading}
        exclude={lines.map((line) => line.productId)}
        onPick={(product) => {
          setLines((current) => addLine(current, { productId: product.id, name: product.name, price: Number(product.retailPrice) || 0, image: product.images[0] ?? null }));
          setProblem(null);
          setPicking(false);
        }}
      />
    </Screen>
  );
}

/** − 2 + : how many of one product. */
function Stepper({ value, onChange, lessLabel, moreLabel }: { value: number; onChange: (value: number) => void; lessLabel: string; moreLabel: string }) {
  const button = { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.line, alignItems: "center" as const, justifyContent: "center" as const };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={lessLabel} disabled={value <= 1} onPress={() => onChange(value - 1)} style={[button, value <= 1 && { opacity: 0.4 }]}>
        <T weight="extrabold" style={{ fontSize: 20 }}>−</T>
      </Pressable>
      <T weight="extrabold" style={{ fontSize: 18, minWidth: 28, textAlign: "center" }}>{value}</T>
      <Pressable accessibilityRole="button" accessibilityLabel={moreLabel} disabled={value >= 50} onPress={() => onChange(value + 1)} style={[button, value >= 50 && { opacity: 0.4 }]}>
        <T weight="extrabold" style={{ fontSize: 20 }}>+</T>
      </Pressable>
    </View>
  );
}
