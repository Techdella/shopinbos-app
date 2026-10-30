import { useMemo, useState } from "react";
import { Dimensions, Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { naira } from "@shared/onboarding";
import { Title } from "@/components/design";
import { Badge, ErrorState, Initials, LoadingBlock } from "@/components/kit";
import { OneLine, PreorderBox } from "@/components/Preorder";
import { Screen } from "@/components/Screen";
import { Card, Field, Label, Notice, PillButton, Segmented, T, WithTip } from "@/components/ui";
import { clampSellingPrice, priceStep, saleBreakdown, tierPrice } from "@/lib/find-pure";
import { addToStore, fetchDropshipTerms, fetchFindContext, fetchFindProduct, orderSample, placeWholesaleOrder, requestQuote, type FindContext, type FindProduct, type Listing } from "@/lib/marketplace";
import { AddFromSupplier, listingChoiceOf, listingDraftFrom, type ListingDraft } from "@/components/seller/AddFromSupplier";
import { listingProblem, type DropshipTerms } from "@shared/dropship-checkout";
import { depositLineText, preorderButton, preorderPillText } from "@/lib/preorder-pure";
import { payWholesaleOrder } from "@/lib/wallet";
import { BeforeYouList, SupplierRiskCard, SupplierTrustBadges } from "@/components/SupplierTrust";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors, radii } from "@/theme";
import { RatingSummaryCard, Stars } from "@/components/visual";
import { ratingSummary } from "@/lib/visual-pure";

// One supplier product (web /marketplace/product/[id]): photos, Dropship (pick your price, see what you keep,
// add it to your store as a draft) or Wholesale (quantity, tier price, request a quote), and Message supplier.
// The supplier's verification, risk score and distance show first; dropshipping needs the call, the stock check and
// the Dropship agreement both sides accept (components/SupplierTrust.tsx).
// A listing that takes preorders opens on Wholesale with a Preorder box (ship date, places left, the supplier's
// promise, and that Shopinbos holds no preorder money) and "Preorder N for ₦…" (off when full), which places the bulk
// order (POST /api/app/wholesale/request); the supplier confirms it and the seller pays them on Wholesale.
// Dropship (Supplier & Dropship Rules, A-Seller-AddSupplier): with the product's dropship terms (GET
// /api/mobile/marketplace?productId=), "Add to your store" shows You pay / Your price / You earn live, the lowest
// price allowed, delivery to the seller's customers and who pays it (+ a flat fee) and "Your SKU or barcode" (every
// parcel is packed plain: suppliers don't offer seller branding); those go with the POST, and a price the server
// refuses (409 PRICE_PROBLEM) shows its words. Older servers without terms keep the price stepper.
// Also (spec gap C4c/C6): "12 shops selling", the shops' rating of the supplier with their latest words, and "Order 1
// sample · ₦X" (one per product at the dropship price, shared/samples.ts; paid on Wholesale once the supplier accepts).

function Stepper({ label, value, onMinus, onPlus, minusOff, plusOff }: { label: string; value: string; onMinus: () => void; onPlus: () => void; minusOff?: boolean; plusOff?: boolean }) {
  const t = useT("m_find");
  const button = (text: string, onPress: () => void, off?: boolean) => (
    <Pressable accessibilityRole="button" accessibilityLabel={text === "−" ? t("product.lower", { label }) : t("product.raise", { label })} disabled={off} onPress={onPress} hitSlop={6} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center", opacity: off ? 0.4 : 1 }}>
      <T weight="extrabold" style={{ fontSize: 22 }}>{text}</T>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      {button("−", onMinus, minusOff)}
      <View style={{ flex: 1, alignItems: "center" }} accessibilityLabel={`${label} ${value}`}>
        <T style={{ color: colors.inkSoft, fontSize: 13.5 }}>{label}</T>
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
  const t = useT("m_find");
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const loaded = useLoad(async () => {
    const [found, context] = await Promise.all([fetchFindProduct(String(slug)), fetchFindContext().catch(() => null)]);
    // The dropship terms (You pay / Your price / You earn); null on an older server or when it isn't dropshipped.
    const terms = found.product.dropship ? await fetchDropshipTerms(found.product.id).catch(() => null) : null;
    return { product: found.product, listing: found.listing, context, terms };
  }, String(slug));

  if (!loaded.data) {
    return (
      <Screen title={t("product.title")} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
        {loaded.loading ? <LoadingBlock /> : null}
        {loaded.error ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      </Screen>
    );
  }
  // Keyed by product so the price and quantity start from this product's numbers.
  return <ProductView key={loaded.data.product.id} product={loaded.data.product} listing={loaded.data.listing} context={loaded.data.context} terms={loaded.data.terms} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()} />;
}

function ProductView({ product, listing, context, terms, refreshing, onRefresh }: { product: FindProduct; listing: Listing; context: FindContext | null; terms: DropshipTerms | null; refreshing: boolean; onRefresh: () => void }) {
  const t = useT("m_find");
  const tp = useT("m_ui");
  const tm = useT("marketplace");
  const preorder = product.preorder?.on ? product.preorder : null;
  const [sample, setSample] = useState(product.sampleOffer);
  // A listing that takes preorders opens on Wholesale (stock ordered before it arrives), like the web.
  const [mode, setMode] = useState<"dropship" | "wholesale">(product.dropship && !(preorder && product.wholesale) ? "dropship" : "wholesale");
  const [price, setPrice] = useState(() => clampSellingPrice(product.price || product.cost * 1.5, product.cost));
  const [quantity, setQuantity] = useState(product.moq);
  const [destination, setDestination] = useState(context?.destination ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);
  // A preorder placed here: the button becomes "Preorder placed", so a second tap can't order twice.
  const [preordered, setPreordered] = useState(false);
  const [photo, setPhoto] = useState(0);
  // Add to your store with the supplier's dropship terms: the price, who pays delivery and the SKU.
  const [draft, setDraft] = useState<ListingDraft | null>(() => (terms ? listingDraftFrom(terms) : null));
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
      const choice = draft ? listingChoiceOf(draft) : null;
      const retailPrice = choice ? choice.retailPrice : price;
      const result = await addToStore({
        supplierProductId: product.id,
        retailPrice,
        ...(choice && draft
          ? {
              deliveryPayer: draft.payer,
              ...(draft.payer === "flat" && choice.flatFee !== null ? { deliveryFlatFee: choice.flatFee } : {}),
              ...(draft.sku.trim() ? { sku: draft.sku.trim() } : {}),
            }
          : {}),
      });
      setAddedId(result.storeProductId);
      setNote({ tone: "success", text: result.already ? t("product.already") : t("product.added", { price: naira(retailPrice) }) });
    } catch (addError) {
      // PRICE_PROBLEM (below the supplier's lowest price, or a loss) and the other refusals come with the server's words.
      setNote({ tone: "error", text: addError instanceof Error ? addError.message : t("product.addFailed") });
    } finally {
      setBusy(false);
    }
  }

  async function sendSample() {
    if (!sample) return;
    setBusy(true);
    setNote(null);
    try {
      const order = await orderSample({ supplierId: product.supplier.id, supplierProductId: product.id, deliveryAddress: destination.trim() || context?.destination || "" });
      setSample({ ...sample, ordered: { id: order.id, status: order.status } });
    } catch (sampleError) {
      setNote({ tone: "error", text: sampleError instanceof Error ? sampleError.message : t("product.quoteFailed") });
    } finally {
      setBusy(false);
    }
  }

  async function quote() {
    setBusy(true);
    setNote(null);
    try {
      await requestQuote({ supplierId: product.supplier.id, supplierProductId: product.id, quantity, destination: destination.trim() || "Nigeria" });
      setNote({ tone: "success", text: t("product.quoted", { name: product.supplier.name, quantity }) });
    } catch (quoteError) {
      setNote({ tone: "error", text: quoteError instanceof Error ? quoteError.message : t("product.quoteFailed") });
    } finally {
      setBusy(false);
    }
  }

  async function placePreorder() {
    setBusy(true);
    setNote(null);
    try {
      const order = await placeWholesaleOrder({ supplierId: product.supplier.id, supplierProductId: product.id, quantity, deliveryAddress: destination.trim() });
      setPreordered(true);
      if ((order.depositKobo ?? 0) > 0) {
        // The deposit is paid now, by card, straight to the supplier's bank; the rest once the stock is ready.
        const paid = await payWholesaleOrder(order.id).catch(() => null);
        setNote(paid?.outcome === "paid" ? { tone: "success", text: tp("preorders.depositPaidNote", { name: product.supplier.name }) } : { tone: "success", text: tp("preorders.depositLater", { name: product.supplier.name }) });
      } else {
        setNote({ tone: "success", text: tp("preorder.placed", { name: product.supplier.name }) });
      }
    } catch (orderError) {
      setNote({ tone: "error", text: orderError instanceof Error ? orderError.message : tp("preorder.failed") });
    } finally {
      setBusy(false);
    }
  }

  const preorderCta = preorder && product.wholesale ? preorderButton(preorder, quantity, naira(unit * quantity), tp) : null;

  // Dropship from a supplier the seller hasn't agreed with yet: the steps below come first, no add button.
  const mustAgree = mode === "dropship" && !already && listing.step !== "ready";
  const listed = terms && draft ? listingChoiceOf(draft) : null;
  const priceProblem = terms && listed ? listingProblem(terms, listed) : null;
  const footer =
    mode === "dropship" ? (
      already ? (
        <PillButton title={t("product.seeInProducts")} onPress={() => router.push("/products")} />
      ) : mustAgree ? undefined : (
        <PillButton title={t("product.put", { price: naira(listed ? listed.retailPrice : price) })} tone={terms ? "accent" : "ink"} busy={busy} disabled={Boolean(priceProblem)} onPress={() => void add()} />
      )
    ) : preorderCta && preordered ? (
      <PillButton disabled accessibilityLabel={tp("preorders.placed")}>
        <OneLine text={tp("preorders.placed")} color="#FFFFFF" />
      </PillButton>
    ) : preorderCta ? (
      <PillButton busy={busy} disabled={preorderCta.disabled} accessibilityLabel={preorderCta.label} onPress={() => void placePreorder()}>
        <OneLine text={preorderCta.label} color="#FFFFFF" />
      </PillButton>
    ) : (
      <PillButton title={t("product.requestQuote", { quantity })} busy={busy} onPress={() => void quote()} />
    );

  return (
    <Screen title={t("product.title")} refreshing={refreshing} onRefresh={onRefresh} footer={footer}>
      {product.images.length ? (
        <View>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={(event) => setPhoto(Math.round(event.nativeEvent.contentOffset.x / width))} style={{ borderRadius: radii.card }}>
            {product.images.map((uri, index) => (
              <Image key={uri + index} source={{ uri }} style={{ width, height: width, borderRadius: radii.card, backgroundColor: colors.lilac }} contentFit="cover" accessibilityLabel={t("product.photo", { name: product.name, n: index + 1 })} />
            ))}
          </ScrollView>
          {product.images.length > 1 ? (
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 8 }}>
              {product.images.map((uri, index) => <View key={uri + index} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: index === photo ? colors.inkFill : colors.toggleOff }} />)}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* The whole name here (the header bar is one short line). */}
      <Title size={24}>{product.name}</Title>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <Badge label={t.dynamic(`category.${product.category}`, product.category)} />
        {product.ships ? <Badge label={product.ships.startsWith("Ships in ") ? t("ships", { time: product.ships.slice(9) }) : product.ships} /> : null}
        {preorder ? <Badge label={preorderPillText(preorder, new Date(), tp) ?? tp("preorder.pill")} bg={colors.warnTint} fg={colors.warnInk} /> : null}
        {product.stock > 0 ? <Badge label={t("product.inStock", { count: product.stock })} /> : preorder ? null : <Badge label={t("product.outOfStock")} bg={colors.dangerTint} fg={colors.danger} />}
        {already ? <Badge label={t("product.inShop")} bg={colors.successTint} fg={colors.success} /> : null}
        {product.shopsSelling > 0 ? <Badge label={tm("shops.selling", { count: product.shopsSelling })} bg="#E2F6F1" fg="#0C4A44" /> : null}
      </View>

      {/* Who sells it, with Message beside the name; Verified, the risk score and the distance sit under them at full
          width (shown once: the risk card below keeps only the reasons). */}
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Initials name={product.supplier.name} bg={colors.mintTint} fg={colors.forest} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T weight="extrabold" style={{ fontSize: 15 }} numberOfLines={2}>{product.supplier.name}</T>
            <T style={{ color: colors.inkSoft, fontSize: 14 }} numberOfLines={1}>
              {[product.supplier.city, product.supplier.rating ? `★ ${product.supplier.rating.toFixed(1)}${product.supplier.ratingCount ? ` (${product.supplier.ratingCount})` : ""}` : null, product.supplier.responds].filter(Boolean).join(" · ")}
            </T>
          </View>
          <PillButton
            tone="white"
            size="sm"
            icon="chat"
            title={t("product.message")}
            style={{ flexShrink: 0 }}
            onPress={() => router.push({ pathname: "/partners/[id]", params: { id: product.supplier.id, name: product.supplier.name } })}
          />
        </View>
        <SupplierTrustBadges supplier={product.supplier} />
        {product.supplier.slug ? (
          <PillButton tone="white" size="sm" icon="store" title={tm("sup.allTheirProducts")} onPress={() => router.push({ pathname: "/suppliers/[slug]", params: { slug: product.supplier.slug } })} />
        ) : null}
      </Card>

      {product.dropship && product.wholesale ? (
        <Segmented
          options={[
            { value: "dropship", label: t("card.dropship") },
            { value: "wholesale", label: t("card.wholesale") },
          ]}
          value={mode}
          onChange={setMode}
        />
      ) : null}

      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      {/* After "Request a quote": the price requests and wholesale orders (with Pay) are on Wholesale. */}
      {note?.tone === "success" && mode !== "dropship" ? (
        preordered ? (
          <PillButton tone="white" size="sm" accessibilityLabel={tp("preorders.seeMine")} style={{ alignSelf: "flex-start" }} onPress={() => router.push({ pathname: "/preorders", params: { view: "suppliers" } })}>
            <OneLine text={tp("preorders.seeMine")} size={15} />
          </PillButton>
        ) : (
          <PillButton title={t("wholesale.see")} tone="white" size="sm" style={{ alignSelf: "flex-start" }} onPress={() => router.push("/wholesale")} />
        )
      ) : null}

      <SupplierRiskCard supplier={product.supplier} badges={false} />
      {mustAgree ? <BeforeYouList product={product} listing={listing} onSent={onRefresh} /> : null}

      {mode === "dropship" && terms && draft ? (
        <AddFromSupplier product={product} terms={terms} draft={draft} onChange={setDraft} place={context?.destination.split(",")[0]?.trim() || null} />
      ) : mode === "dropship" ? (
        <Card style={{ gap: 6 }}>
          <WithTip title={t("product.dropshipTitle")} tip={{ text: t("product.dropshipIntro", { name: product.supplier.name }) }} style={{ marginBottom: 6 }}>
            <T style={{ color: colors.inkSoft, lineHeight: 20 }}>{t("product.dropshipShort", { name: product.supplier.name })}</T>
          </WithTip>
          <Stepper
            label={t("product.sellingPrice")}
            value={naira(price)}
            onMinus={() => setPrice((current) => clampSellingPrice(current - priceStep(current - 1), product.cost))}
            onPlus={() => setPrice((current) => clampSellingPrice(current + step, product.cost))}
            minusOff={price <= clampSellingPrice(0, product.cost)}
            plusOff={price >= clampSellingPrice(Number.MAX_SAFE_INTEGER, product.cost)}
          />
          <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 }}>
            <Line label={t("product.customerPays")} value={naira(sale.shopperPays)} />
            <Line label={t("product.supplierGets")} value={`− ${naira(sale.supplierGets)}`} />
            <Line label={t("product.fee")} value={`− ${naira(sale.fee)}`} />
            <Line label={t("product.keep", { percent: sale.keepPct })} value={naira(sale.keep)} strong tone={sale.keep > 0 ? colors.success : colors.danger} />
          </View>
          {product.price ? <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("product.suggested", { price: naira(product.price) })}</T> : null}
        </Card>
      ) : (
        <Card style={{ gap: 8 }}>
          <T style={{ color: colors.inkSoft, lineHeight: 20, marginBottom: 6 }}>{t("product.wholesaleIntro", { moq: product.moq })}</T>
          {preorder ? <PreorderBox state={preorder} deposit={depositLineText(preorder.depositPct, unit * quantity, naira, tp)} /> : null}
          <Stepper
            label={t("product.quantity")}
            value={String(quantity)}
            onMinus={() => setQuantity((current) => Math.max(product.moq, current - qtyStep))}
            onPlus={() => setQuantity((current) => Math.min(preorder?.left ?? 1_000_000, 1_000_000, current + qtyStep))}
            minusOff={quantity <= product.moq}
            plusOff={preorder?.left != null && quantity >= preorder.left}
          />
          <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 }}>
            <Line label={t("product.priceEach")} value={naira(unit)} />
            <Line label={t("product.estimated")} value={naira(unit * quantity)} strong />
          </View>
          {product.tiers.length ? (
            <View style={{ gap: 4 }}>
              <T weight="bold" style={{ fontSize: 15 }}>{t("product.tiers")}</T>
              {product.tiers.map((tier) => (
                <T key={tier.minQty} style={{ color: colors.inkSoft, fontSize: 14 }}>
                  {t("product.tier", { range: tier.maxQty ? `${tier.minQty}–${tier.maxQty}` : `${tier.minQty}+`, price: naira(tier.price) })}
                </T>
              ))}
            </View>
          ) : null}
          <Label>{t("product.deliverTo")}</Label>
          <Field value={destination} onChangeText={setDestination} placeholder={t("product.cityState")} maxLength={200} />
          <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("product.confirms")}</T>
        </Card>
      )}

      {/* One sample at the dropship price, to try it before selling it (shared/samples.ts). */}
      {mode === "dropship" && sample ? (
        <Card style={{ gap: 8 }}>
          <WithTip title={tm("trySample.title")} tip={{ text: tm("trySample.body", { price: naira(sample.price) }) }}>
            <T weight="extrabold" style={{ fontSize: 16 }}>{tm("trySample.title")}</T>
          </WithTip>
          {sample.ordered ? (
            <View style={{ gap: 8 }}>
              <Badge label={`✓ ${tm("trySample.ordered")}`} bg={colors.successTint} fg={colors.success} />
              <PillButton title={tm("trySample.see")} tone="white" size="sm" style={{ alignSelf: "flex-start" }} onPress={() => router.push("/wholesale")} />
            </View>
          ) : (
            <>
              <PillButton tone="white" size="md" busy={busy} accessibilityLabel={tm("trySample.order", { price: naira(sample.price) })} onPress={() => void sendSample()}>
                <OneLine text={tm("trySample.order", { price: naira(sample.price) })} size={15} />
              </PillButton>
              <T style={{ color: colors.inkSoft, fontSize: 12.5, lineHeight: 17 }}>{tm("trySample.note", { address: destination.trim() || context?.destination || "—" })}</T>
            </>
          )}
        </Card>
      ) : null}

      {/* What shops say about the supplier (their ratings after orders arrived, shared/supplier-ratings.ts). */}
      {product.supplier.ratingCount > 0 && product.supplier.rating ? (
        // The big "4.7 ★ · 23 ratings", star bars when every rating is here, then the shops' latest words.
        <RatingSummaryCard
          title={tm("rate.whatShopsSay")}
          summary={ratingSummary(product.supplier.rating, product.supplier.ratingCount, product.ratings)}
          countLabel={tm("rate.count", { count: product.supplier.ratingCount })}
          accessibilityLabel={`${tm("rate.whatShopsSay")} · ★ ${product.supplier.rating.toFixed(1)} · ${tm("rate.count", { count: product.supplier.ratingCount })}`}
        >
          {product.ratings.filter((entry) => entry.text).map((entry) => (
            <View key={entry.at} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start", borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 }}>
              <Stars value={entry.rating} size={13} />
              <T style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>{entry.text}</T>
            </View>
          ))}
        </RatingSummaryCard>
      ) : null}

      {product.description ? (
        <Card style={{ gap: 6 }}>
          <T weight="extrabold" style={{ fontSize: 15 }}>{t("product.about")}</T>
          <T style={{ color: colors.inkSoft, lineHeight: 21 }}>{product.description}</T>
        </Card>
      ) : null}
    </Screen>
  );
}
