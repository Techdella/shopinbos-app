import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { naira } from "@shared/onboarding";
import { BUNDLE_MAX_ITEMS, BUNDLE_MAX_QUANTITY, bundleAvailable, bundleDraftProblem, bundleItemKey, bundleSaving, partsTotal, type BundleItem } from "@shared/bundles";
import { Stepper } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { LoadingBlock } from "@/components/kit";
import { ProductPickSheet } from "@/components/ProductPickSheet";
import { Screen } from "@/components/Screen";
import { Card, Chip, Field, Label, LinkButton, Notice, PillButton, T, Toggle } from "@/components/ui";
import { fetchBundles, removeBundle, saveBundle, type BundleChoice } from "@/lib/bundles";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors, radii } from "@/theme";

// Make a bundle (or change one, ?id=): the phone's version of the web's /products/bundles form. Pick 2 to 10 of the
// shop's own products (ProductPickSheet) and how many of each (a product with sizes or options shows them as chips to
// pick one; the same product can be added again in another size), one price (the parts' total and the saving show as
// the seller types), a name, the photo (the first product's unless another is tapped) and whether it shows in the
// shop. Rules in shared/bundles.ts; the server checks everything again.

type Problem = "name" | "price" | "too_few" | "too_many" | "quantity" | "variant";

/**
 * Whether a product can be added again: for one without sizes, "" when it isn't in the bundle yet; for one with
 * sizes, the first size not in the bundle yet. False when it can't be added again.
 */
function freeVariant(choice: BundleChoice, items: BundleItem[]): string | false {
  const versions = choice.variants ?? [];
  if (!versions.length) return items.some((item) => item.productId === choice.id) ? false : "";
  return versions.find((variant) => !items.some((item) => item.productId === choice.id && item.variantId === variant.id))?.id ?? false;
}

export default function EditBundle() {
  const t = useT("bundles", "common");
  const { id } = useLocalSearchParams<{ id?: string }>();
  const data = useLoad(fetchBundles);
  const existing = id ? data.data?.bundles.find((bundle) => bundle.id === id) ?? null : null;
  const [ready, setReady] = useState(!id);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<BundleItem[]>([]);
  const [price, setPrice] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [publish, setPublish] = useState(true);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Editing: fill the form once the bundle has loaded.
  useEffect(() => {
    if (ready || !existing) return;
    setName(existing.name);
    setDescription(existing.description ?? "");
    setItems(existing.items.map((item) => ({ productId: item.productId, ...(item.variantId ? { variantId: item.variantId } : {}), quantity: item.quantity })));
    setPrice(String(existing.price));
    setImage(existing.image);
    setPublish(existing.status === "published");
    setReady(true);
  }, [existing, ready]);

  // The products a bundle can hold, plus (editing) its own items even if they can't go in a new one any more.
  const choices = useMemo<BundleChoice[]>(() => {
    const list = data.data?.choices ?? [];
    const known = new Set(list.map((choice) => choice.id));
    const old = existing?.items ?? [];
    const extra = old
      .filter((item, index) => !known.has(item.productId) && old.findIndex((other) => other.productId === item.productId) === index)
      .map((item) => ({
        id: item.productId,
        name: item.name || "?",
        images: item.image ? [item.image] : [],
        retailPrice: item.price,
        status: item.missing ? "archived" : "published",
        stock: 0,
        variants: old.filter((other) => other.productId === item.productId && other.variantId && other.variant).map((other) => ({ id: other.variantId!, name: other.variant!, price: other.price, stock: 0, image: other.image })),
      }));
    return [...list, ...extra];
  }, [data.data, existing]);
  const byId = useMemo(() => new Map(choices.map((choice) => [choice.id, choice])), [choices]);
  const variantOf = (item: BundleItem) => (item.variantId ? byId.get(item.productId)?.variants?.find((variant) => variant.id === item.variantId) : undefined);
  const total = partsTotal(items, (productId, item) => variantOf(item)?.price ?? byId.get(productId)?.retailPrice);
  const amount = Number(price.replace(/,/g, ""));
  const priceValue = price.trim() && Number.isFinite(amount) ? amount : null;
  const saving = bundleSaving(total, priceValue ?? 0);
  const canSell = bundleAvailable(items, (productId) => {
    const choice = byId.get(productId);
    return choice ? { status: choice.status, trackStock: choice.stock !== null, currentStock: choice.stock ?? 0, variants: (choice.variants ?? []).map((variant) => ({ id: variant.id, name: variant.name, stock: variant.stock })) } : null;
  });
  const photos = [...new Set(items.flatMap((item) => {
    const src = variantOf(item)?.image ?? byId.get(item.productId)?.images[0];
    return src ? [src] : [];
  }))];
  // Products that can't be added again (no size left to add).
  const full = (data.data?.choices ?? []).filter((choice) => freeVariant(choice, items) === false).map((choice) => choice.id);
  const shownImage = image ?? photos[0] ?? null;

  function setQuantity(key: string, quantity: number) {
    setProblem(null);
    setItems((current) => (quantity <= 0 ? current.filter((item) => bundleItemKey(item) !== key) : current.map((item) => (bundleItemKey(item) === key ? { ...item, quantity } : item))));
  }

  function pickVariant(key: string, variantId: string) {
    setProblem(null);
    setItems((current) => current.map((item) => (bundleItemKey(item) === key ? { ...item, variantId } : item)));
  }

  async function save() {
    const missing = bundleDraftProblem({ name, price: priceValue, items }, (productId) => Boolean(byId.get(productId)?.variants?.length));
    if (missing) return setProblem(t(`problem.${missing as Problem}`));
    setBusy(true);
    setProblem(null);
    try {
      await saveBundle({ name, description, price: priceValue!, items, image: image && image !== photos[0] ? image : null, publish }, id ?? null);
      if (router.canGoBack()) router.back();
      else router.replace("/bundles");
    } catch (saveError) {
      setProblem(saveError instanceof Error ? saveError.message : t("problem.couldNot"));
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    if (!id) return;
    Alert.alert(t("form.removeBundle"), t("form.removeConfirm"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("form.removeBundle"),
        style: "destructive",
        onPress: () => {
          setBusy(true);
          removeBundle(id)
            .then(() => (router.canGoBack() ? router.back() : router.replace("/bundles")))
            .catch((removeError: unknown) => setProblem(removeError instanceof Error ? removeError.message : t("problem.couldNot")))
            .finally(() => setBusy(false));
        },
      },
    ]);
  }

  const title = id ? t("form.editTitle") : t("form.newTitle");
  if (!ready) {
    return (
      <Screen title={title} fallback="/bundles">
        {data.error ? <Notice>{data.error}</Notice> : <LoadingBlock />}
      </Screen>
    );
  }

  return (
    <Screen
      title={title}
      sub={t("sub")}
      fallback="/bundles"
      footer={
        <View style={{ gap: 8 }}>
          {problem ? <Notice>{problem}</Notice> : null}
          <PillButton testID="bundle-save" busy={busy} icon="check" title={priceValue ? `${t("form.save")} · ${naira(priceValue)}` : t("form.save")} accessibilityLabel={t("form.save")} onPress={() => void save()} />
        </View>
      }
    >
      <Card style={{ gap: 14 }}>
        <View>
          <Label>{t("form.name")}</Label>
          <Field value={name} onChangeText={(next) => { setName(next); setProblem(null); }} maxLength={120} placeholder={t("form.namePlaceholder")} accessibilityLabel={t("form.name")} />
        </View>
        <View>
          <Label>{t("form.description")}</Label>
          <Field value={description} onChangeText={setDescription} maxLength={5000} multiline style={{ height: 88, paddingTop: 14, textAlignVertical: "top", borderRadius: radii.field }} accessibilityLabel={t("form.description")} />
        </View>
      </Card>

      <View style={{ gap: 4 }}>
        <T weight="extrabold" style={{ fontSize: 17 }} accessibilityRole="header">{t("form.items")}</T>
        <T style={{ color: colors.inkSoft, fontSize: 14.5, lineHeight: 20 }}>{t("form.itemsHint")}</T>
      </View>
      {items.map((item) => {
        const choice = byId.get(item.productId);
        const key = bundleItemKey(item);
        const variant = variantOf(item);
        const versions = choice?.variants ?? [];
        const photo = variant?.image ?? choice?.images[0];
        const stock = variant && variant.stock !== null && choice?.stock !== null ? Math.min(variant.stock, choice?.stock ?? 0) : choice?.stock ?? null;
        return (
          <Card key={key} style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              {photo ? (
                <Image source={{ uri: photo }} style={{ width: 48, height: 48, borderRadius: 12 }} contentFit="cover" />
              ) : (
                <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
                  <AppIcon name="box" size={20} color={colors.inkSoft} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <T weight="bold" style={{ fontSize: 16 }} numberOfLines={2}>{choice?.name ?? "…"}</T>
                <T style={{ color: colors.inkSoft, fontSize: 14 }}>
                  {naira(variant?.price ?? choice?.retailPrice ?? 0)} · {!choice || stock === null ? t("form.stockOff") : t("form.stockLeft", { count: Math.max(0, stock) })}
                </T>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={t("form.remove")} hitSlop={6} onPress={() => setQuantity(key, 0)} style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" }}>
                <AppIcon name="x" size={18} color={colors.inkSoft} />
              </Pressable>
            </View>
            {versions.length || item.variantId ? (
              <View style={{ gap: 6 }}>
                <T style={{ color: colors.inkSoft, fontSize: 15 }}>{variant ? t("form.option") : item.variantId ? t("form.optionGone") : t("form.pickOption")}</T>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {versions.map((entry) => (
                    <Chip
                      key={entry.id}
                      label={entry.name}
                      on={entry.id === item.variantId}
                      disabled={entry.id !== item.variantId && items.some((other) => other.productId === item.productId && other.variantId === entry.id)}
                      onPress={() => pickVariant(key, entry.id)}
                    />
                  ))}
                </View>
              </View>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <T style={{ flex: 1, color: colors.inkSoft, fontSize: 15 }}>{t("form.quantity")}</T>
              <Stepper value={item.quantity} min={1} max={BUNDLE_MAX_QUANTITY} label={variant ? `${choice?.name ?? ""} · ${variant.name}` : choice?.name ?? t("form.quantity")} onChange={(quantity) => setQuantity(key, quantity)} />
            </View>
          </Card>
        );
      })}
      {data.data && data.data.choices.length < 2 && !items.length ? <Notice tone="info">{t("form.noChoices")}</Notice> : null}
      {items.length < BUNDLE_MAX_ITEMS && (data.data?.choices ?? []).some((choice) => freeVariant(choice, items) !== false) ? (
        <PillButton testID="bundle-add" size="md" tone="white" icon="plus" title={items.length ? t("form.addAnother") : t("form.add")} accessibilityLabel={t("form.add")} onPress={() => setPicking(true)} />
      ) : null}

      <Card style={{ gap: 10 }}>
        <View>
          <Label>{t("form.price")}</Label>
          <Field value={price} onChangeText={(next) => { setPrice(next.replace(/[^\d.,]/g, "")); setProblem(null); }} keyboardType="decimal-pad" placeholder={total > 0 ? String(Math.round(total)) : ""} accessibilityLabel={t("form.price")} />
        </View>
        {items.length ? (
          <View style={{ gap: 4 }}>
            <T style={{ color: colors.inkSoft, fontSize: 14.5 }}>{t("form.separately", { amount: naira(total) })}</T>
            {priceValue && saving.amount > 0 ? (
              <T weight="bold" style={{ color: colors.success, fontSize: 14.5 }}>{t("form.saving", { amount: naira(saving.amount), percent: saving.percent })}</T>
            ) : total > 0 ? (
              <T style={{ color: colors.inkSoft, fontSize: 14.5 }}>{t("form.noSaving", { amount: naira(total) })}</T>
            ) : null}
            {canSell !== null ? <T style={{ color: colors.inkSoft, fontSize: 14.5 }}>{t("form.canSell", { count: canSell })}</T> : null}
          </View>
        ) : null}
      </Card>

      {photos.length ? (
        <Card style={{ gap: 10 }}>
          <View>
            <T weight="bold" style={{ fontSize: 16 }}>{t("form.photo")}</T>
            <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20, marginTop: 2 }}>{t("form.photoHint")}</T>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[...new Set([...(image && !photos.includes(image) ? [image] : []), ...photos])].map((src) => (
              <Pressable
                key={src}
                accessibilityRole="button"
                accessibilityLabel={t("form.photo")}
                accessibilityState={{ selected: src === shownImage }}
                onPress={() => setImage(src === photos[0] ? null : src)}
                style={{ borderRadius: 14, borderWidth: 2, borderColor: src === shownImage ? colors.ink : "transparent", overflow: "hidden" }}
              >
                <Image source={{ uri: src }} style={{ width: 68, height: 68 }} contentFit="cover" />
              </Pressable>
            ))}
          </View>
        </Card>
      ) : null}

      <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <T weight="bold" style={{ flex: 1, fontSize: 16 }}>{t("form.publish")}</T>
        <Toggle on={publish} onChange={setPublish} label={t("form.publish")} />
      </Card>

      {id ? <LinkButton testID="bundle-remove" title={t("form.removeBundle")} color={colors.danger} onPress={remove} /> : null}

      <ProductPickSheet
        visible={picking}
        onClose={() => setPicking(false)}
        title={t("form.pickTitle")}
        products={data.data?.choices ?? null}
        loading={data.loading}
        exclude={full}
        onPick={(product) => {
          const choice = byId.get(product.id);
          const variantId = choice ? freeVariant(choice, items) : "";
          if (variantId === false) return setPicking(false);
          setItems((current) => [...current, variantId ? { productId: product.id, variantId, quantity: 1 } : { productId: product.id, quantity: 1 }]);
          setProblem(null);
          setPicking(false);
        }}
      />
    </Screen>
  );
}
