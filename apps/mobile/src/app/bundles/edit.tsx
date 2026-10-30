import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { naira } from "@shared/onboarding";
import { BUNDLE_MAX_ITEMS, BUNDLE_MAX_QUANTITY, bundleAvailable, bundleDraftProblem, bundleSaving, partsTotal, type BundleItem } from "@shared/bundles";
import { Stepper } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { LoadingBlock } from "@/components/kit";
import { ProductPickSheet } from "@/components/ProductPickSheet";
import { Screen } from "@/components/Screen";
import { Card, Field, Label, LinkButton, Notice, PillButton, T, Toggle } from "@/components/ui";
import { fetchBundles, removeBundle, saveBundle, type BundleChoice } from "@/lib/bundles";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors, radii } from "@/theme";

// Make a bundle (or change one, ?id=): the phone's version of the web's /products/bundles form. Pick 2 to 10 of the
// shop's own products (ProductPickSheet) and how many of each, one price (the parts' total and the saving show as
// the seller types), a name, the photo (the first product's unless another is tapped) and whether it shows in the
// shop. Rules in shared/bundles.ts; the server checks everything again.

type Problem = "name" | "price" | "too_few" | "too_many" | "quantity";

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
    setItems(existing.items.map((item) => ({ productId: item.productId, quantity: item.quantity })));
    setPrice(String(existing.price));
    setImage(existing.image);
    setPublish(existing.status === "published");
    setReady(true);
  }, [existing, ready]);

  // The products a bundle can hold, plus (editing) its own items even if they can't go in a new one any more.
  const choices = useMemo<BundleChoice[]>(() => {
    const list = data.data?.choices ?? [];
    const known = new Set(list.map((choice) => choice.id));
    const extra = (existing?.items ?? []).filter((item) => !known.has(item.productId)).map((item) => ({ id: item.productId, name: item.name || "?", images: item.image ? [item.image] : [], retailPrice: item.price, status: item.missing ? "archived" : "published", stock: 0 }));
    return [...list, ...extra];
  }, [data.data, existing]);
  const byId = useMemo(() => new Map(choices.map((choice) => [choice.id, choice])), [choices]);
  const total = partsTotal(items, (productId) => byId.get(productId)?.retailPrice);
  const amount = Number(price.replace(/,/g, ""));
  const priceValue = price.trim() && Number.isFinite(amount) ? amount : null;
  const saving = bundleSaving(total, priceValue ?? 0);
  const canSell = bundleAvailable(items, (productId) => {
    const choice = byId.get(productId);
    return choice ? { status: choice.status, trackStock: choice.stock !== null, currentStock: choice.stock ?? 0 } : null;
  });
  const photos = [...new Set(items.flatMap((item) => byId.get(item.productId)?.images.slice(0, 1) ?? []))];
  const shownImage = image ?? photos[0] ?? null;

  function setQuantity(productId: string, quantity: number) {
    setProblem(null);
    setItems((current) => (quantity <= 0 ? current.filter((item) => item.productId !== productId) : current.map((item) => (item.productId === productId ? { ...item, quantity } : item))));
  }

  async function save() {
    const missing = bundleDraftProblem({ name, price: priceValue, items });
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
        return (
          <Card key={item.productId} style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              {choice?.images[0] ? (
                <Image source={{ uri: choice.images[0] }} style={{ width: 48, height: 48, borderRadius: 12 }} contentFit="cover" />
              ) : (
                <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
                  <AppIcon name="box" size={20} color={colors.inkSoft} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <T weight="bold" style={{ fontSize: 16 }} numberOfLines={2}>{choice?.name ?? "…"}</T>
                <T style={{ color: colors.inkSoft, fontSize: 14 }}>
                  {naira(choice?.retailPrice ?? 0)} · {!choice || choice.stock === null ? t("form.stockOff") : t("form.stockLeft", { count: Math.max(0, choice.stock) })}
                </T>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={t("form.remove")} hitSlop={6} onPress={() => setQuantity(item.productId, 0)} style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" }}>
                <AppIcon name="x" size={18} color={colors.inkSoft} />
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <T style={{ flex: 1, color: colors.inkSoft, fontSize: 15 }}>{t("form.quantity")}</T>
              <Stepper value={item.quantity} min={1} max={BUNDLE_MAX_QUANTITY} label={choice?.name ?? t("form.quantity")} onChange={(quantity) => setQuantity(item.productId, quantity)} />
            </View>
          </Card>
        );
      })}
      {data.data && data.data.choices.length < 2 && !items.length ? <Notice tone="info">{t("form.noChoices")}</Notice> : null}
      {items.length < BUNDLE_MAX_ITEMS && (data.data?.choices ?? []).some((choice) => !items.some((item) => item.productId === choice.id)) ? (
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
        exclude={items.map((item) => item.productId)}
        onPick={(product) => {
          setItems((current) => [...current, { productId: product.id, quantity: 1 }]);
          setProblem(null);
          setPicking(false);
        }}
      />
    </Screen>
  );
}
