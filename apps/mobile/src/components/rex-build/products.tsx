import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View, useWindowDimensions } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { suggestedRetailPrice } from "@shared/onboarding";
import { AppIcon } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { Field, Label, Notice, PillButton, T } from "@/components/ui";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { addSupplierPick, createProducts, draftProducts } from "@/lib/onboarding";
import { pickPhotos, type PhotoSource } from "@/lib/photos";
import { forgetEntry, saveCategories, updateProduct, type OnboardingProduct } from "@/lib/seller-onboarding";
import { colors, fonts, radii, surfaceCard } from "@/theme";
import { RexFrame, RexHead, RexSays } from "./Frame";
import { AddTile, ProductTile, SourceButton } from "./parts";
import type { StepCtx } from "./context";

// The plan (D0, design RB-02), products (D1a, RB-03) and categories (D1b, RB-04).

const PLAN: { key: "products" | "style" | "home" | "pages" | "golive"; min: number | null; tint: string; ink: string }[] = [
  { key: "products", min: 1, tint: "#FFEDE4", ink: "#B23E0A" },
  { key: "style", min: 1, tint: "#ECEAFB", ink: "#4B3FC4" },
  { key: "home", min: 2, tint: "#E2F6F1", ink: "#0C4A44" },
  { key: "pages", min: 1, tint: "#FDF0D5", ink: "#8A5A08" },
  { key: "golive", min: null, tint: "#E2F5EA", ink: "#16794A" },
];

/** D0 "Hi Ada! Let's build your shop together." with the five steps and their times. */
export function PlanStep({ ctx }: { ctx: StepCtx }) {
  const t = useT("m_rexBuild");
  const name = ctx.flow.firstName || ctx.data.owner.firstName;
  return (
    <RexFrame {...ctx.frame} step={0} close primary={{ title: t("plan.go"), onPress: () => void ctx.next({ buildStartedAt: new Date().toISOString() }), testID: "plan-go" }}>
      <View style={{ alignItems: "center", gap: 14 }}>
        <RexHead size={112} />
        <T accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 28, lineHeight: 32, textAlign: "center", letterSpacing: -0.5 }}>{name ? t("plan.title", { name }) : t("plan.titleNoName")}</T>
        <T style={{ fontSize: 16, lineHeight: 23, color: colors.inkSoft, textAlign: "center" }}>{ctx.mode === "redesign" ? t("plan.redesign") : t("plan.sub")}</T>
      </View>
      <View style={{ ...surfaceCard(24), paddingHorizontal: 18 }}>
        {PLAN.filter((row) => ctx.mode !== "redesign" || row.key !== "products").map((row, index, rows) => (
          <View key={row.key} style={{ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 58, borderBottomWidth: index < rows.length - 1 ? 1 : 0, borderBottomColor: colors.line }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: row.tint, alignItems: "center", justifyContent: "center" }}>
              <T weight="extrabold" style={{ color: row.ink, fontSize: 14 }}>{index + 1}</T>
            </View>
            <T weight="bold" style={{ flex: 1, fontSize: 16 }}>{t(`plan.${row.key}`)}</T>
            {row.min ? <T style={{ fontSize: 14, color: colors.inkSoft }}>{t("plan.min", { count: row.min })}</T> : null}
          </View>
        ))}
      </View>
    </RexFrame>
  );
}

/** Name and price for one product (the price check), saved through the products route. */
export function ProductSheet({ product, onClose, onSaved }: { product: OnboardingProduct | null; onClose: () => void; onSaved: () => void }) {
  const t = useT("m_rexBuild");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setName(product?.name ?? "");
    setPrice(product?.price ? String(Math.round(product.price)) : "");
    setError(null);
  }, [product]);

  async function save() {
    const amount = Number(price.replace(/\D/g, ""));
    if (!name.trim()) return setError(t("item.needName"));
    if (!amount) return setError(t("item.needPrice"));
    setBusy(true);
    try {
      await updateProduct(product!.id, { name, price: amount });
      onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : t("error.save"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={Boolean(product)} onClose={onClose} title={t("item.title")}>
      <View style={{ gap: 14 }}>
        {product?.image ? <Image source={{ uri: product.image }} style={{ width: 96, height: 96, borderRadius: 16 }} contentFit="cover" /> : null}
        <View>
          <Label>{t("item.name")}</Label>
          <Field value={name} onChangeText={setName} maxLength={120} accessibilityLabel={t("item.name")} />
        </View>
        <View>
          <Label>{t("item.price")}</Label>
          <Field value={price} onChangeText={(value) => setPrice(value.replace(/\D/g, ""))} keyboardType="number-pad" accessibilityLabel={t("item.price")} />
        </View>
        {error ? <Notice>{error}</Notice> : null}
        <PillButton tone="accent" title={t("item.save")} busy={busy} onPress={() => void save()} />
      </View>
    </Sheet>
  );
}

/** D1a "First, your products." Snap, pick from the gallery or find stock; Rex writes each one from its photo. */
export function ProductsStep({ ctx }: { ctx: StepCtx }) {
  const t = useT("m_rexBuild");
  const { width } = useWindowDimensions();
  const tile = Math.floor((Math.min(width, 600) - 36 - 20) / 3);
  const [writing, setWriting] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [editing, setEditing] = useState<OnboardingProduct | null>(null);
  const products = ctx.data.products ?? [];
  const intent = ctx.flow.intent;
  const reload = ctx.reload;
  const adding = useRef(false);

  // Came from the website's "Add to my shop": that product goes in first, tagged "Added from Trending".
  useEffect(() => {
    if (!intent || intent.addedProductId || adding.current) return;
    adding.current = true;
    void (async () => {
      try {
        const product = await api<{ id: string; wholesalePrice: number }>(`/api/public/products/${encodeURIComponent(intent.productSlug)}`);
        const before = new Set(products.map((item) => item.id));
        await addSupplierPick(product.id, suggestedRetailPrice(product.wholesalePrice) || product.wholesalePrice);
        const fresh = await reload();
        const added = fresh?.products?.find((item) => item.supplier && !before.has(item.id)) ?? null;
        await ctx.save({ intent: { ...intent, addedProductId: added?.id ?? "added" } });
        forgetEntry(["intent", "productSlug"]);
      } catch {
        // The product isn't open to add any more: carry on without it.
        await ctx.save({ intent: { ...intent, addedProductId: "skipped" } });
        forgetEntry(["intent", "productSlug"]);
      }
    })();
    // Once, when the screen opens with an intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent?.productSlug]);

  // Back from Find stock: the products added there show here.
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focused.current) void reload();
      focused.current = true;
    }, [reload]),
  );

  async function add(source: PhotoSource) {
    setNote(null);
    const photos = await pickPhotos(source, 6);
    if (photos === "denied") return setNote(t("products.denied"));
    if (!photos.length) return;
    setWriting(photos.length);
    try {
      const made = await draftProducts(photos);
      const drafts = made.drafts.map((draft, index) => ({ ...draft, name: draft.name.trim() || `${t("products.untitled", { number: products.length + index + 1 })}` }));
      await createProducts(drafts);
      if (!made.drafted) setNote(t("products.noAi"));
      else if (made.error) setNote(t("products.partly", { reason: made.error }));
      await reload();
    } catch (cause) {
      ctx.setError(cause instanceof Error && cause.message ? cause.message : t("error.save"));
    } finally {
      setWriting(0);
    }
  }

  return (
    <RexFrame
      {...ctx.frame}
      close
      primary={{ title: t("products.mine"), disabled: !products.length || writing > 0, onPress: () => void ctx.next(), testID: "products-mine" }}
      link={{ title: t("products.later"), onPress: () => ctx.rexChose(t("products.later"), {}), testID: "products-later" }}
    >
      <RexSays title={t("products.title")} sub={products.length ? t("products.subHave", { count: products.length }) : t("products.sub")} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {products.map((product) => (
          <ProductTile
            key={product.id}
            width={tile}
            image={product.image}
            name={product.name}
            ok={Boolean(product.price)}
            tag={intent?.addedProductId === product.id ? t("products.trending") : null}
            note={product.price ? null : t("products.noPrice")}
            onPress={() => setEditing(product)}
          />
        ))}
        {Array.from({ length: writing }, (_, index) => (
          <View key={`writing-${index}`} style={{ width: tile, height: tile * 0.84, borderRadius: 18, backgroundColor: colors.grayTint, alignItems: "center", justifyContent: "center", gap: 6 }}>
            <ActivityIndicator color={colors.accent} />
            <T style={{ fontSize: 12, color: colors.inkSoft }}>{t("products.writing")}</T>
          </View>
        ))}
        <AddTile width={tile} label={t("products.addMore")} onPress={() => void add("camera")} />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <SourceButton testID="products-camera" icon="camera" label={t("products.camera")} onPress={() => void add("camera")} />
        <SourceButton testID="products-gallery" icon="image" label={t("products.gallery")} onPress={() => void add("library")} />
        <SourceButton testID="products-find" icon="box" label={t("products.find")} onPress={() => router.push("/find")} />
      </View>
      {note ? <Notice tone="info">{note}</Notice> : null}
      <ProductSheet product={editing} onClose={() => setEditing(null)} onSaved={() => void reload()} />
    </RexFrame>
  );
}

/** D1b "I sorted them into 3 categories. Look right?" Rename, add a category, check prices, confirm. */
export function CategoriesStep({ ctx }: { ctx: StepCtx }) {
  const t = useT("m_rexBuild");
  const products = ctx.data.products ?? [];
  const byId = new Map(products.map((product) => [product.id, product]));
  const start = ctx.data.collections?.filter((collection) => collection.productIds.length).length ? ctx.data.collections! : ctx.data.suggestedGroups ?? [];
  const [groups, setGroups] = useState(() => start.map((group) => ({ name: group.name === "More products" ? t("categories.newName") : group.name, productIds: group.productIds })));
  const [renaming, setRenaming] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<OnboardingProduct | null>(null);
  const checks = (ctx.data.priceChecks ?? []).map((id) => byId.get(id)).filter((product): product is OnboardingProduct => Boolean(product));

  async function confirm() {
    const kept = groups.filter((group) => group.name.trim());
    setBusy(true);
    ctx.setError(null);
    try {
      if (kept.length) await saveCategories(kept);
      await ctx.next({ categoriesConfirmed: true });
    } catch (cause) {
      ctx.setError(cause instanceof Error && cause.message ? cause.message : t("error.save"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <RexFrame {...ctx.frame} close primary={{ title: t("categories.yes"), busy, onPress: () => void confirm(), testID: "categories-yes" }}>
      {products.length ? (
        <RexSays title={groups.length === 1 ? t("categories.titleOne") : t("categories.title", { count: groups.length })} sub={t("categories.sub")} />
      ) : (
        <RexSays title={t("categories.none")} />
      )}
      {groups.map((group, index) => {
        const thumbs = group.productIds.map((id) => byId.get(id)?.image).filter((url): url is string => Boolean(url)).slice(0, 2);
        return (
          <View key={index} style={{ ...surfaceCard(22), flexDirection: "row", alignItems: "center", gap: 14, padding: 12 }}>
            <View style={{ width: 66, height: 52, flexDirection: "row", borderRadius: 12, overflow: "hidden", backgroundColor: colors.grayTint }}>
              {thumbs.map((url) => (
                <Image key={url} source={{ uri: url }} style={{ flex: 1 }} contentFit="cover" />
              ))}
            </View>
            <View style={{ flex: 1 }}>
              {renaming === index ? (
                <TextInput
                  autoFocus
                  value={group.name}
                  onChangeText={(value) => setGroups((current) => current.map((item, at) => (at === index ? { ...item, name: value.slice(0, 80) } : item)))}
                  onBlur={() => setRenaming(null)}
                  onSubmitEditing={() => setRenaming(null)}
                  accessibilityLabel={t("categories.rename")}
                  style={{ fontFamily: fonts.extrabold, fontSize: 17, color: colors.ink, borderBottomWidth: 2, borderBottomColor: colors.accent, paddingVertical: 4 }}
                />
              ) : (
                <Pressable accessibilityRole="button" accessibilityLabel={`${t("categories.rename")}: ${group.name}`} onPress={() => setRenaming(index)}>
                  <T weight="extrabold" style={{ fontSize: 17 }} numberOfLines={1}>{group.name}</T>
                </Pressable>
              )}
              <T style={{ fontSize: 14, color: colors.inkSoft }}>{t("categories.count", { count: group.productIds.length })}</T>
            </View>
            {group.productIds.length ? (
              <Pressable accessibilityRole="button" accessibilityLabel={t("categories.rename")} onPress={() => setRenaming(index)} hitSlop={8} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
                <AppIcon name="type" size={22} color={colors.inkSoft} />
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button" accessibilityLabel={t("categories.remove")} onPress={() => setGroups((current) => current.filter((_, at) => at !== index))} hitSlop={8} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
                <AppIcon name="x" size={20} color={colors.inkSoft} />
              </Pressable>
            )}
          </View>
        );
      })}
      {products.length ? (
        <Pressable
          testID="categories-add"
          accessibilityRole="button"
          onPress={() => {
            setGroups((current) => [...current, { name: t("categories.newName"), productIds: [] }]);
            setRenaming(groups.length);
          }}
          style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48, paddingHorizontal: 16, borderRadius: radii.pill, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface }}
        >
          <AppIcon name="plus" size={18} color={colors.ink} />
          <T weight="bold" style={{ fontSize: 15 }}>{t("categories.add")}</T>
        </Pressable>
      ) : null}
      {products.length ? (
        <View style={{ backgroundColor: colors.peach, borderRadius: 20, padding: 14, gap: 10 }}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <AppIcon name="sparkle" size={16} color={colors.accentInk} />
            <T style={{ flex: 1, fontSize: 15, lineHeight: 21, color: colors.accentInk }}>{checks.length ? t("categories.checkPrices", { count: checks.length }) : t("categories.checked")}</T>
          </View>
          {checks.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {checks.map((product) => (
                <PillButton key={product.id} size="sm" tone="white" title={product.name} onPress={() => setEditing(product)} />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
      <ProductSheet product={editing} onClose={() => setEditing(null)} onSaved={() => void ctx.reload()} />
    </RexFrame>
  );
}
