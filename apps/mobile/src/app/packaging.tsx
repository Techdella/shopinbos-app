import { useEffect, useState } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { naira } from "@shared/onboarding";
import { PACK_STYLE_INFO, type PackDesign, type PackFormat, type PackStyle } from "@shared/packaging";
import { Choice, Eyebrow, Heading, List, Row, Small, Tile } from "@/components/design";
import { CreditsLine } from "@/components/familiar/Credits";
import { ChipRow, ErrorState, LoadingBlock, Picture } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Chip, Field, Label, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { fetchProducts, type ProductItem } from "@/lib/dashboard";
import { fetchCredits, optional } from "@/lib/familiar";
import { useT } from "@/lib/i18n";
import { askTeam, DELIVERY_ZONES, fetchDesign, fetchDesigns, formatsFor, minQuantity, orderPrints, productTypeOf, quantityChoices, quotePrint, saveDesign, shopProductType, startDesign, templatesFor, withWords, writeWords, type DeliveryZone } from "@/lib/packaging";
import { fetchSetup } from "@/lib/setup";
import { useLoad } from "@/lib/useLoad";
import { colors, fonts, surfaceCard } from "@/theme";

// Packaging and labels (web /home/labels/packaging, "Familiar app" prototype My shop › Packaging): pick a template
// (each shown live with the shop's name and logo, on one of the shop's products or a sample), preview it big, let
// Peggy write the words (AI credits, never sold here), save it, then order prints (priced on the server, paid on
// Paystack's checkout page) or ask the branding team to make it. Shipping labels for orders stay in app/order/label.tsx.
// Print-ready PDF downloads are drawn in the web browser, so the phone orders prints instead of downloading files.

const INLINE_PRODUCTS = 6;

/** The front of a pack, drawn natively: the template's colours, the shop's logo and name, the product's name, its
 * photo and the first badge. A sketch of the web's PackRender, enough to choose and check a template. */
export function PackFront({ design, width }: { design: PackDesign; width: number }) {
  const ratio = Math.min(1.5, Math.max(0.7, design.size.h / design.size.w));
  const height = Math.round(width * ratio);
  const c = design.colours;
  const info = PACK_STYLE_INFO[design.style];
  const pad = Math.round(width * 0.08);
  const photo = design.image?.url ?? null;
  const photoSize = Math.round(width * 0.42);
  const name = design.content.name || design.content.brand;
  const badge = design.content.claims[0] ?? "";
  return (
    <View
      accessible
      accessibilityLabel={`${info.name}: ${design.content.brand} ${name}`}
      style={{ width, height, backgroundColor: c.ground, borderRadius: Math.round(width * 0.07), overflow: "hidden", padding: pad, justifyContent: "space-between", borderWidth: 1, borderColor: colors.line }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: Math.round(width * 0.04) }}>
        {design.showLogo ? <Picture uri={design.logoUrl} name={design.content.brand || "?"} size={Math.round(width * 0.15)} shape="square" /> : null}
        <T weight="extrabold" numberOfLines={2} style={{ flex: 1, color: c.ink, fontSize: Math.max(9, Math.round(width * 0.065)), letterSpacing: 1, textTransform: "uppercase" }}>{design.content.brand}</T>
      </View>
      <View style={{ gap: Math.round(width * 0.02), paddingRight: photo ? photoSize * 0.45 : 0 }}>
        <T numberOfLines={3} style={{ fontFamily: info.display === "serif" ? fonts.displayBold : fonts.display, color: c.ink, fontSize: Math.max(12, Math.round(width * 0.12)), lineHeight: Math.max(14, Math.round(width * 0.13)) }}>{name}</T>
        {design.content.tagline ? <T weight="bold" numberOfLines={2} style={{ color: c.accent === c.ground ? c.ink : c.accent, fontSize: Math.max(9, Math.round(width * 0.06)) }}>{design.content.tagline}</T> : null}
      </View>
      {photo ? (
        <Image
          source={{ uri: photo }}
          contentFit="cover"
          style={{ position: "absolute", right: -photoSize * 0.12, bottom: height * 0.14, width: photoSize, height: photoSize, borderRadius: info.photo === "arch" ? photoSize * 0.2 : photoSize / 2, borderWidth: 3, borderColor: c.accent2 }}
        />
      ) : null}
      <View style={{ marginHorizontal: -pad, marginBottom: -pad, paddingHorizontal: pad, paddingVertical: Math.round(width * 0.035), backgroundColor: c.accent, flexDirection: "row", justifyContent: "space-between", gap: 6 }}>
        <T weight="extrabold" numberOfLines={2} style={{ flex: 1, minWidth: 0, color: c.ground, fontSize: Math.max(8, Math.round(width * 0.055)) }}>{badge}</T>
        {design.content.netContent ? <T weight="bold" numberOfLines={2} style={{ flexShrink: 0, maxWidth: "45%", textAlign: "right", color: c.ground, fontSize: Math.max(8, Math.round(width * 0.055)) }}>{design.content.netContent}</T> : null}
      </View>
    </View>
  );
}

type Mode = "design" | "order" | "ask";

export default function Packaging() {
  const t = useT("m_packaging", "common");
  const params = useLocalSearchParams<{ design?: string }>();
  const { width: screen } = useWindowDimensions();
  const setup = useLoad(fetchSetup);
  const products = useLoad(() => fetchProducts().catch(() => [] as ProductItem[]));
  const designs = useLoad(() => optional(fetchDesigns()));
  const [productId, setProductId] = useState<string | null>(null);
  const [format, setFormat] = useState<PackFormat | null>(null);
  const [design, setDesign] = useState<PackDesign | null>(null);
  const [designId, setDesignId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState<Mode>("design");
  const [busy, setBusy] = useState<null | "save" | "words" | "pay" | "ask" | "open">(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null | undefined>(undefined);

  // Order and "make it for me" details.
  const [quantity, setQuantity] = useState<number | null>(null);
  const [zone, setZone] = useState<DeliveryZone>("lagos");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [details, setDetails] = useState("");

  const store = setup.data?.store ?? null;
  const items = (products.data ?? []).slice(0, INLINE_PRODUCTS);
  const product = items.find((item) => item.id === productId) ?? null;
  // The sample's words and pack types follow what the shop sells; a picked product uses its own type (as the web).
  const shopType = shopProductType(products.data ?? []);
  const type = design?.productType ?? (product ? productTypeOf(product) : shopType);
  const formats = formatsFor(type);
  const chosenFormat = format && formats.includes(format) ? format : formats[0];
  const saved = (designs.data ?? []).filter((item) => item.kind === "packaging");

  // Grid of two equal columns (20px gutters, 10px between): rows of two with flex 1, never a percentage width.
  const tileWidth = Math.floor((screen - 40 - 10) / 2) - 24;
  const bigWidth = Math.min(300, screen - 40 - 32);

  const base = (style: PackStyle) => startDesign({ shopName: store?.name ?? "", logoUrl: store?.logoUrl ?? null, website: store?.url ?? "", style, format: chosenFormat, product, type });

  async function open(id: string) {
    setBusy("open");
    setProblem(null);
    try {
      const row = await fetchDesign(id);
      setDesign(row.design);
      setDesignId(row.id);
      setTitle(row.title);
      setDirty(false);
      setMode("design");
    } catch (error) {
      setProblem(error instanceof Error ? error.message : t("err.open"));
    } finally {
      setBusy(null);
    }
  }

  // ?design=<id> opens a saved design.
  const wanted = typeof params.design === "string" ? params.design : null;
  useEffect(() => {
    if (wanted) void open(wanted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);

  function pickTemplate(style: PackStyle) {
    const next = base(style);
    setDesign(next);
    setDesignId(null);
    setTitle(product ? t("titleFor", { name: product.name }) : t("titleNew"));
    setDirty(true);
    setMode("design");
    setNote(null);
    setProblem(null);
  }

  async function save() {
    if (!design) return;
    setBusy("save");
    setProblem(null);
    try {
      const row = await saveDesign({ id: designId, title: title || t("titleNew"), design });
      setDesignId(row.id);
      setDirty(false);
      setNote(t("saved"));
      void designs.reload();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : t("err.save"));
    } finally {
      setBusy(null);
    }
  }

  async function words() {
    if (!design) return;
    const name = product?.name ?? design.content.name;
    if (!name.trim()) return setProblem(t("err.needName"));
    setBusy("words");
    setProblem(null);
    setNote(null);
    try {
      const result = await writeWords(design, name);
      setDesign(withWords(design, result.content));
      setDirty(true);
      setNote(result.ai ? t("words.done") : t("words.offline"));
    } catch (error) {
      if (error instanceof ApiError && error.code === "AI_CREDITS_NEEDED") {
        setCredits((await fetchCredits().catch(() => null))?.balance ?? null);
      }
      setProblem(error instanceof Error ? error.message : t("err.words"));
    } finally {
      setBusy(null);
    }
  }

  async function pay() {
    if (!design || !designId) return;
    if (contactName.trim().length < 2 || contactPhone.trim().length < 7) return setProblem(t("err.contact"));
    if (zone !== "pickup" && (!address.trim() || !city.trim())) return setProblem(t("err.address"));
    setBusy("pay");
    setProblem(null);
    try {
      const result = await orderPrints({
        designId,
        quantity: quantity ?? quantityChoices(design.format)[0] ?? minQuantity(design.format),
        zone,
        contactName: contactName.trim(),
        contactPhone: contactPhone.trim(),
        address: zone === "pickup" ? null : address.trim(),
        city: zone === "pickup" ? null : city.trim(),
        state: zone === "pickup" ? null : region.trim() || null,
      });
      // Paystack's own checkout page (card, transfer or USSD) in an in-app browser that comes back by itself.
      if (result.outcome === "cancelled") return setProblem(t("order.unpaid"));
      setNote(result.outcome === "paid" ? t("order.paid") : t("order.afterPay"));
      setMode("design");
    } catch (error) {
      setProblem(error instanceof Error ? error.message : t("err.pay"));
    } finally {
      setBusy(null);
    }
  }

  async function sendRequest() {
    if (!design) return;
    if (details.trim().length < 10) return setProblem(t("err.details"));
    if (contactName.trim().length < 2 || contactPhone.trim().length < 7) return setProblem(t("err.contact"));
    setBusy("ask");
    setProblem(null);
    try {
      await askTeam({
        designId,
        productName: (product?.name ?? design.content.name) || title || t("titleNew"),
        productType: design.productType,
        packType: design.format,
        quantity: quantity ?? quantityChoices(design.format)[0] ?? minQuantity(design.format),
        details: details.trim(),
        contactName: contactName.trim(),
        contactPhone: contactPhone.trim(),
      });
      setNote(t("ask.sent"));
      setMode("design");
      setDetails("");
    } catch (error) {
      setProblem(error instanceof Error ? error.message : t("err.ask"));
    } finally {
      setBusy(null);
    }
  }

  const loadingFirst = setup.loading && !setup.data;
  const quote = design ? quotePrint({ format: design.format, size: design.size, quantity: quantity ?? quantityChoices(design.format)[0] ?? minQuantity(design.format), zone }) : null;
  const templates = templatesFor(type);
  const rows: PackStyle[][] = [];
  for (let index = 0; index < templates.length; index += 2) rows.push(templates.slice(index, index + 2));

  const contactFields = (
    <>
      <View>
        <Label>{t("field.name")}</Label>
        <Field value={contactName} onChangeText={setContactName} autoComplete="name" accessibilityLabel={t("field.name")} />
      </View>
      <View>
        <Label>{t("field.phone")}</Label>
        <Field value={contactPhone} onChangeText={setContactPhone} keyboardType="phone-pad" autoComplete="tel" accessibilityLabel={t("field.phone")} />
      </View>
    </>
  );

  const quantityPicker = design ? (
    <View style={{ gap: 8 }}>
      <Eyebrow>{t("order.howMany")}</Eyebrow>
      <ChipRow>
        {quantityChoices(design.format).map((count) => (
          <Chip key={count} label={count.toLocaleString("en-NG")} on={(quantity ?? quantityChoices(design.format)[0]) === count} onPress={() => setQuantity(count)} />
        ))}
      </ChipRow>
    </View>
  ) : null;

  const footer = !design ? null : mode === "order" ? (
    <PillButton title={quote ? t("order.pay", { total: naira(quote.total) }) : t("order.title")} tone="accent" busy={busy === "pay"} onPress={() => void pay()} />
  ) : mode === "ask" ? (
    <PillButton title={t("ask.send")} busy={busy === "ask"} onPress={() => void sendRequest()} />
  ) : dirty || !designId ? (
    <PillButton title={t("save")} busy={busy === "save"} onPress={() => void save()} />
  ) : (
    <>
      <PillButton title={t("order.title")} tone="accent" onPress={() => { setMode("order"); setProblem(null); setNote(null); }} />
      <PillButton title={t("ask.title")} tone="white" size="md" onPress={() => { setMode("ask"); setProblem(null); setNote(null); }} />
    </>
  );

  return (
    <Screen
      title={t("title")}
      footer={footer}
      onBack={design ? () => { if (mode !== "design") setMode("design"); else { setDesign(null); setDesignId(null); setNote(null); setProblem(null); } } : undefined}
    >
      {loadingFirst || busy === "open" ? <LoadingBlock /> : null}
      {setup.error && !setup.data ? <ErrorState message={setup.error} onRetry={() => void setup.reload()} /> : null}

      {!design && store ? (
        <>
          {saved.length ? (
            <View style={{ gap: 8 }}>
              <Eyebrow>{t("saved.title")}</Eyebrow>
              <List>
                {saved.slice(0, 5).map((item) => (
                  <Row
                    key={item.id}
                    lead={item.previewUrl ? <Image source={{ uri: item.previewUrl }} style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.grayTint }} contentFit="cover" /> : <Tile icon="box" tone="butter" />}
                    title={item.title}
                    sub={t.dynamic(`format.${item.format}`, item.format)}
                    onPress={() => void open(item.id)}
                  />
                ))}
              </List>
            </View>
          ) : null}

          {items.length ? (
            <View style={{ gap: 8 }}>
              <Eyebrow>{t("showOn")}</Eyebrow>
              <ChipRow>
                <Chip label={t("sample")} on={!productId} onPress={() => setProductId(null)} />
                {items.map((item) => (
                  <Chip key={item.id} label={item.name} on={productId === item.id} onPress={() => setProductId(item.id)} />
                ))}
              </ChipRow>
            </View>
          ) : null}

          <View style={{ gap: 8 }}>
            <Eyebrow>{t("pack")}</Eyebrow>
            <ChipRow>
              {formats.map((value) => (
                <Chip key={value} label={t.dynamic(`format.${value}`, value)} on={chosenFormat === value} onPress={() => setFormat(value)} />
              ))}
            </ChipRow>
          </View>

          <View style={{ gap: 10 }}>
            <Eyebrow>{t("templates")}</Eyebrow>
            {rows.map((row) => (
              <View key={row.join("-")} style={{ flexDirection: "row", gap: 10 }}>
                {row.map((style) => (
                  <Pressable
                    key={style}
                    testID={`pack-template-${style}`}
                    accessibilityRole="button"
                    accessibilityLabel={t.dynamic(`style.${style}`, PACK_STYLE_INFO[style].name)}
                    onPress={() => pickTemplate(style)}
                    style={({ pressed }) => ({ flex: 1, ...surfaceCard(), padding: 12, gap: 8, alignItems: "center", opacity: pressed ? 0.85 : 1 })}
                  >
                    <PackFront design={base(style)} width={tileWidth} />
                    <T weight="bold" numberOfLines={2} style={{ fontSize: 14, alignSelf: "stretch", textAlign: "center" }}>{t.dynamic(`style.${style}`, PACK_STYLE_INFO[style].name)}</T>
                  </Pressable>
                ))}
                {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
              </View>
            ))}
          </View>
        </>
      ) : null}

      {design ? (
        <>
          <Card style={{ alignItems: "center", gap: 12, borderWidth: 1, borderColor: colors.line }}>
            <PackFront design={design} width={bigWidth} />
            <T weight="bold" style={{ fontSize: 15 }}>
              {t.dynamic(`style.${design.style}`, PACK_STYLE_INFO[design.style].name)} · {t.dynamic(`format.${design.format}`, design.format)}
            </T>
          </Card>

          {mode === "design" ? (
            <>
              <View>
                <Label>{t("field.title")}</Label>
                <Field value={title} onChangeText={(value) => { setTitle(value); setDirty(true); }} maxLength={80} accessibilityLabel={t("field.title")} />
              </View>
              <List>
                <Row lead={<Tile icon="sparkle" tone="peach" />} title={t("words.title")} sub={t("words.sub")} onPress={() => void words()} right={busy === "words" ? <T style={{ color: colors.inkSoft }}>…</T> : undefined} />
                <Row lead={<Tile icon="image" tone="lilac" />} title={t("change")} onPress={() => { setDesign(null); setDesignId(null); setNote(null); setProblem(null); }} />
              </List>
              {credits !== undefined ? <CreditsLine balance={credits} who="peggy" /> : null}
            </>
          ) : null}

          {mode === "order" && quote ? (
            <>
              <Heading>{t("order.title")}</Heading>
              {quantityPicker}
              <Small>{t("order.min", { count: minQuantity(design.format) })}</Small>
              <View style={{ gap: 8 }}>
                <Eyebrow>{t("order.delivery")}</Eyebrow>
                {DELIVERY_ZONES.map((item) => (
                  <Choice key={item.id} title={t.dynamic(`zone.${item.id}`, item.name)} sub={item.fee ? naira(item.fee) : t("order.free")} on={zone === item.id} onPress={() => setZone(item.id)} />
                ))}
              </View>
              {contactFields}
              {zone !== "pickup" ? (
                <>
                  <View>
                    <Label>{t("order.address")}</Label>
                    <Field value={address} onChangeText={setAddress} autoComplete="street-address" accessibilityLabel={t("order.address")} />
                  </View>
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Label>{t("order.city")}</Label>
                      <Field value={city} onChangeText={setCity} accessibilityLabel={t("order.city")} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Label>{t("order.state")}</Label>
                      <Field value={region} onChangeText={setRegion} accessibilityLabel={t("order.state")} />
                    </View>
                  </View>
                </>
              ) : (
                <Small>{t("order.pickupNote")}</Small>
              )}
              <Card style={{ gap: 8, borderWidth: 1, borderColor: colors.line }}>
                <SumLine label={t("order.printLine", { count: quote.quantity.toLocaleString("en-NG"), price: naira(quote.unitPrice) })} value={naira(quote.printCost)} />
                <SumLine label={t("order.setup")} value={naira(quote.setupFee)} />
                <SumLine label={zone === "pickup" ? t("order.pickup") : t("order.delivery")} value={quote.deliveryFee ? naira(quote.deliveryFee) : t("order.free")} />
                <View style={{ height: 1, backgroundColor: colors.line }} />
                <SumLine label={t("order.total")} value={naira(quote.total)} bold />
                <Small>{t("order.days", { days: quote.days })}</Small>
              </Card>
              <Small>{t("order.proof")}</Small>
            </>
          ) : null}

          {mode === "ask" ? (
            <>
              <Heading>{t("ask.title")}</Heading>
              <Small>{t("ask.sub")}</Small>
              {quantityPicker}
              <View>
                <Label>{t("ask.details")}</Label>
                <Field value={details} onChangeText={setDetails} multiline placeholder={t("ask.detailsPlaceholder")} style={{ height: 110, paddingTop: 14, textAlignVertical: "top" }} accessibilityLabel={t("ask.details")} />
              </View>
              {contactFields}
            </>
          ) : null}
        </>
      ) : null}

      {problem ? <Notice>{problem}</Notice> : null}
      {note ? <Notice tone="success">{note}</Notice> : null}
      {mode !== "design" && design ? <LinkButton title={t("back")} color={colors.inkSoft} onPress={() => setMode("design")} /> : null}
    </Screen>
  );
}

function SumLine({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
      <T weight={bold ? "extrabold" : "regular"} style={{ flex: 1, fontSize: bold ? 16 : 15 }}>{label}</T>
      <T weight={bold ? "extrabold" : "bold"} style={{ fontSize: bold ? 16 : 15 }}>{value}</T>
    </View>
  );
}
