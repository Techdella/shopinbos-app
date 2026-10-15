import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { naira } from "@shared/onboarding";
import {
  detailsPatch,
  formFromProduct,
  makeMainPhoto,
  movePhoto,
  parseNaira,
  parseWholeNumber,
  productPatch,
  removePhoto,
  variantEditsFrom,
  variantUpdatesFrom,
  type ProductEditForm,
  type ProductEditProblem,
  type VariantEdits,
} from "@shared/product-edit";
import { productTypeDef } from "@shared/product-types";
import { AppIcon } from "@/components/icons";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { ChoiceRow, Sheet } from "@/components/Sheet";
import { Card, Field, Label, LinkButton, Notice, PillButton, Segmented, T } from "@/components/ui";
import { setPaused } from "@/lib/dropship";
import { saleBreakdown } from "@/lib/find-pure";
import { cleanCategoryName, categoryOptions, sameNameCategory, type CategoryLite } from "@/lib/categories-pure";
import { archiveProduct, createCategory, fetchAllCategories, fetchEditProduct, fetchStoreCategories, saveProduct, uploadProductPhoto, type EditProduct } from "@/lib/products";
import { openWeb } from "@/lib/web";
import { useT } from "@/lib/i18n";
import { colors, radii } from "@/theme";

// Edit product (web /products/[id]): name, price, old price, stock, description, photos and whether customers see
// it. Saves with PATCH /api/store/products/[id], the web form's route and rules. Dropship products show the
// supplier and what each sale leaves; their stock is the supplier's. Versions (sizes, colours…) have their price and
// stock edited here (sent as variantUpdates); adding or removing options is done on the web form. The product
// type's details (Material, Skin type…) are edited too.

type Visible = "live" | "hidden";

const PROBLEM_WORDS = {
  name: "edit.problem.name",
  price: "edit.problem.price",
  compareAt: "edit.problem.compareAt",
  stock: "edit.problem.stock",
  lowStock: "edit.problem.lowStock",
  description: "edit.problem.description",
} as const satisfies Record<ProductEditProblem, string>;

function isLive(product: EditProduct): boolean {
  const published = product.status === "published" || product.status === "active";
  return product.dropship ? published && !product.dropship.paused : published;
}

export default function EditProductScreen() {
  const t = useT("m_productedit", "m_products", "common", "productTypes");
  const { id } = useLocalSearchParams<{ id: string }>();
  const [product, setProduct] = useState<EditProduct | null>(null);
  const [form, setForm] = useState<ProductEditForm | null>(null);
  const [visible, setVisible] = useState<Visible>("live");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<null | "save" | "remove">(null);
  const [uploading, setUploading] = useState(0);
  const [photo, setPhoto] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [variantEdits, setVariantEdits] = useState<VariantEdits>({});
  const [details, setDetails] = useState<Record<string, string>>({});
  const [columns, setColumns] = useState({ careInstructions: "", warranty: "" });
  // Category: the one picked (saved as categoryId), the picker sheet and its choices (loaded when it opens).
  const [category, setCategory] = useState<CategoryLite | null>(null);
  const [picking, setPicking] = useState(false);
  const [choices, setChoices] = useState<{ own: CategoryLite[]; all: CategoryLite[] } | null>(null);
  const [choicesError, setChoicesError] = useState<string | null>(null);
  const [categoryQ, setCategoryQ] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const next = await fetchEditProduct(id);
      setProduct(next);
      setForm(formFromProduct(next));
      setVariantEdits(variantEditsFrom(next.variants));
      setDetails({ ...next.productDetails });
      setColumns({ careInstructions: next.careInstructions ?? "", warranty: next.warranty ?? "" });
      setCategory(next.category ?? null);
      setVisible(isLive(next) ? "live" : "hidden");
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t("edit.loadFailed"));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  function edit(patch: Partial<ProductEditForm>) {
    setForm((current) => (current ? { ...current, ...patch } : current));
    setSaved(false);
  }

  async function addPhotos() {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return setError(t("edit.allowPhotos"));
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 6, quality: 0.7 });
    if (result.canceled || !result.assets.length) return;
    setUploading(result.assets.length);
    try {
      for (const asset of result.assets) {
        const url = await uploadProductPhoto({ uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName });
        setForm((current) => (current ? { ...current, images: [...current.images, url] } : current));
        setSaved(false);
        setUploading((count) => Math.max(0, count - 1));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("edit.uploadFailed"));
    } finally {
      setUploading(0);
    }
  }

  function changePhotos(next: (images: string[]) => string[]) {
    if (!form) return;
    edit({ images: next(form.images) });
    setPhoto(null);
  }

  async function save() {
    if (!product || !form) return;
    setError(null);
    const result = productPatch(product, form);
    if (!result.ok) return setError(t(PROBLEM_WORDS[result.problem]));
    const versions = variantUpdatesFrom(product.variants, variantEdits);
    if (!versions.ok) return setError(t(versions.problem === "variantPrice" ? "edit.problem.variantPrice" : "edit.problem.variantStock", { name: versions.name }));
    const changedDetails = detailsPatch(product.productDetails, details);
    const extra: Record<string, unknown> = {
      ...(versions.updates.length ? { variantUpdates: versions.updates } : {}),
      ...(changedDetails ? { productDetails: changedDetails } : {}),
      ...(columns.careInstructions.trim() !== (product.careInstructions ?? "").trim() ? { careInstructions: columns.careInstructions.trim() } : {}),
      ...(columns.warranty.trim() !== (product.warranty ?? "").trim() ? { warranty: columns.warranty.trim() } : {}),
      ...(category && category.id !== (product.categoryId ?? product.category?.id ?? null) ? { categoryId: category.id } : {}),
    };
    const wantLive = visible === "live";
    const statusChanged = wantLive !== isLive(product);
    setBusy("save");
    try {
      // Dropship products are paused and sold again like on the Dropship screen (that also hides / shows them).
      const base = { ...result.patch, ...extra };
      const patch = statusChanged && !product.dropship ? { ...base, status: wantLive ? "published" : "draft" } : base;
      if (Object.keys(patch).length) await saveProduct(product.id, patch);
      if (statusChanged && product.dropship) await setPaused(product.dropship.relationshipId, !wantLive);
      await load();
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("edit.saveFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function openCategories() {
    setPicking(true);
    setCategoryQ("");
    setNewCategory("");
    setChoicesError(null);
    try {
      const [own, all] = await Promise.all([fetchStoreCategories(), fetchAllCategories().catch(() => [] as CategoryLite[])]);
      setChoices({ own, all });
    } catch (e) {
      setChoicesError(e instanceof Error ? e.message : t("edit.categoryLoadFailed"));
    }
  }

  function pickCategory(next: CategoryLite) {
    setCategory({ id: next.id, name: next.name });
    setPicking(false);
    setSaved(false);
  }

  async function addCategory() {
    const name = cleanCategoryName(newCategory);
    if (!name) return setChoicesError(t("edit.categoryShort"));
    const twin = sameNameCategory([...(choices?.own ?? []), ...(choices?.all ?? [])], name);
    if (twin) return pickCategory(twin);
    setCreating(true);
    setChoicesError(null);
    try {
      pickCategory(await createCategory(name));
    } catch (e) {
      setChoicesError(e instanceof Error ? e.message : t("edit.categoryAddFailed"));
    } finally {
      setCreating(false);
    }
  }

  function confirmRemove() {
    if (!product) return;
    Alert.alert(t("edit.removeTitle"), t("edit.removeBody"), [
      { text: t("edit.keep"), style: "cancel" },
      {
        text: t("edit.removeYes"),
        style: "destructive",
        onPress: async () => {
          setBusy("remove");
          setError(null);
          try {
            await archiveProduct(product.id);
            if (router.canGoBack()) router.back();
            else router.replace("/products");
          } catch (e) {
            setError(e instanceof Error ? e.message : t("edit.removeFailed"));
            setBusy(null);
          }
        },
      },
    ]);
  }

  if (!product || !form) {
    return (
      <Screen title={t("edit.title")}>
        {loadError ? <ErrorState message={loadError} onRetry={() => void load()} /> : <LoadingBlock />}
      </Screen>
    );
  }

  const dropship = product.dropship;
  const type = productTypeDef(product.productType);
  // Stock counted per version: the product's own stock is their total (the server adds it up).
  const countedVersions = product.tracksStock ? product.variants.filter((variant) => variant.enabled && (variantEdits[variant.id]?.stock ?? "").trim() !== "") : [];
  const versionTotal = countedVersions.reduce((sum, variant) => sum + (parseWholeNumber(variantEdits[variant.id]?.stock ?? "") ?? 0), 0);
  const typedPrice = parseNaira(form.price);
  const sale = dropship ? saleBreakdown(typedPrice ?? 0, dropship.cost) : null;

  return (
    <Screen
      title={product.name}
      sub={t("edit.title")}
      refreshing={refreshing}
      onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
      footer={
        <View style={{ gap: 6 }}>
          {error ? <Notice>{error}</Notice> : saved ? <Notice tone="success">{t("edit.saved")}</Notice> : null}
          <PillButton title={t("edit.save")} busy={busy === "save"} disabled={uploading > 0 || busy === "remove"} onPress={() => void save()} />
        </View>
      }
    >
      {/* Dropship: who sends it and what each sale leaves (live as the price changes). */}
      {dropship && sale ? (
        <Card style={{ gap: 6 }}>
          <T weight="extrabold" style={{ fontSize: 18 }}>{t("edit.dropshipFrom", { name: dropship.supplier.name })}</T>
          <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 22 }}>{t("edit.dropshipBody", { name: dropship.supplier.name })}</T>
          <T style={{ fontSize: 15 }}>
            {t("dropship.cost")} <T weight="extrabold" style={{ fontSize: 15 }}>{naira(dropship.cost)}</T>
            {"  ·  "}
            {t("edit.supplierStock", { count: dropship.supplierStock })}
          </T>
          {typedPrice ? (
            <T weight="extrabold" style={{ fontSize: 15, color: sale.keep > 0 ? colors.success : colors.danger }}>
              {sale.keep > 0 ? t("dropship.keep", { amount: naira(sale.keep), percent: sale.keepPct }) : t("dropship.lose", { amount: naira(-sale.keep) })}
            </T>
          ) : null}
          <LinkButton
            title={t("edit.messageSupplier")}
            color={colors.forest}
            style={{ alignItems: "flex-start" }}
            onPress={() => router.push({ pathname: "/partners/[id]", params: { id: dropship.supplier.userId, name: dropship.supplier.name } })}
          />
        </Card>
      ) : null}

      {/* Photos: the first is the main one. Tap one to move or remove it. */}
      <Card style={{ gap: 10 }}>
        <T weight="extrabold" style={{ fontSize: 18 }}>{t("edit.photos")}</T>
        <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 22 }}>{t("edit.photosSub")}</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {form.images.map((url, index) => (
            <Pressable
              key={`${url}-${index}`}
              accessibilityRole="button"
              accessibilityLabel={t("edit.photoTitle", { number: index + 1 })}
              onPress={() => setPhoto(index)}
              style={{ width: 96, height: 96, borderRadius: 16, overflow: "hidden", backgroundColor: colors.canvas }}
            >
              <Image source={{ uri: url }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={150} />
              {index === 0 ? (
                <View style={{ position: "absolute", left: 6, bottom: 6, backgroundColor: colors.surface, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <T weight="bold" style={{ fontSize: 12 }}>{t("edit.mainPhoto")}</T>
                </View>
              ) : null}
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("edit.addPhoto")}
            disabled={uploading > 0}
            onPress={() => void addPhotos()}
            style={{ width: 96, height: 96, borderRadius: 16, borderWidth: 2, borderStyle: "dashed", borderColor: colors.line, alignItems: "center", justifyContent: "center", gap: 4 }}
          >
            {uploading > 0 ? <ActivityIndicator color={colors.ink} /> : <AppIcon name="plus" size={24} color={colors.ink} />}
            <T weight="bold" style={{ fontSize: 13 }}>{uploading > 0 ? t("edit.uploading") : t("edit.addPhoto")}</T>
          </Pressable>
        </View>
      </Card>

      <View>
        <Label>{t("edit.name")}</Label>
        <Field value={form.name} onChangeText={(name) => edit({ name })} maxLength={200} accessibilityLabel={t("edit.name")} />
      </View>

      <View>
        <Label>{t("edit.price")}</Label>
        <Field value={form.price} onChangeText={(price) => edit({ price })} keyboardType="decimal-pad" placeholder="15000" accessibilityLabel={t("edit.price")} />
      </View>

      <View>
        <Label>{t("edit.compareAt")}</Label>
        <Field value={form.compareAt} onChangeText={(compareAt) => edit({ compareAt })} keyboardType="decimal-pad" placeholder="20000" accessibilityLabel={t("edit.compareAt")} />
        <T style={{ color: colors.inkSoft, fontSize: 14, marginTop: 6 }}>{t("edit.compareAtHint")}</T>
      </View>

      {product.tracksStock && countedVersions.length ? (
        <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t("edit.variantTotal", { count: versionTotal })}</T>
      ) : null}
      {product.tracksStock && !countedVersions.length ? (
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Label>{t("edit.stock")}</Label>
            <Field value={form.stock} onChangeText={(stock) => edit({ stock })} keyboardType="number-pad" accessibilityLabel={t("edit.stock")} />
          </View>
          <View style={{ flex: 1 }}>
            <Label>{t("edit.lowStock")}</Label>
            <Field value={form.lowStock} onChangeText={(lowStock) => edit({ lowStock })} keyboardType="number-pad" accessibilityLabel={t("edit.lowStock")} />
          </View>
        </View>
      ) : null}

      <View>
        <Label>{t("edit.description")}</Label>
        <Field
          value={form.description}
          onChangeText={(description) => edit({ description })}
          multiline
          maxLength={5000}
          placeholder={t("edit.descriptionPlaceholder")}
          accessibilityLabel={t("edit.description")}
          style={{ height: 130, paddingTop: 14, textAlignVertical: "top" }}
        />
      </View>

      <View>
        <Label>{t("edit.category")}</Label>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t("edit.category")}: ${category?.name ?? t("edit.noCategory")}`}
          onPress={() => void openCategories()}
          style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 56, paddingHorizontal: 16, borderRadius: radii.field, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 })}
        >
          <AppIcon name="grid" size={18} color={colors.inkSoft} />
          <T weight={category ? "bold" : "regular"} style={{ flex: 1, fontSize: 16, color: category ? colors.ink : colors.inkSoft }} numberOfLines={1}>{category?.name ?? t("edit.noCategory")}</T>
          <T weight="bold" style={{ fontSize: 15, color: colors.accentInk }}>{t("edit.categoryChange")}</T>
        </Pressable>
        <T style={{ color: colors.inkSoft, fontSize: 14, marginTop: 6 }}>{t("edit.categoryHint")}</T>
      </View>

      <View>
        <Label>{t("edit.status")}</Label>
        <Segmented<Visible>
          options={[{ value: "live", label: t("edit.live") }, { value: "hidden", label: t("edit.hidden") }]}
          value={visible}
          onChange={(value) => { setVisible(value); setSaved(false); }}
        />
        <T style={{ color: colors.inkSoft, fontSize: 14, marginTop: 6 }}>{visible === "live" ? t("edit.liveSub") : t("edit.hiddenSub")}</T>
      </View>

      {product.variants.length ? (
        <Card style={{ gap: 8 }}>
          <T weight="extrabold" style={{ fontSize: 18 }}>{t("edit.variants")}</T>
          <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("edit.variantsSub")}</T>
          {product.variants.map((variant) => {
            const edit = variantEdits[variant.id] ?? { price: "", stock: "" };
            const setEdit = (patch: Partial<typeof edit>) => {
              setVariantEdits((current) => ({ ...current, [variant.id]: { ...edit, ...patch } }));
              setSaved(false);
            };
            return (
              <View key={variant.id} style={{ gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line }}>
                <T weight="bold" numberOfLines={1}>
                  {variant.name}
                  {variant.enabled ? "" : ` · ${t("edit.variantOff")}`}
                </T>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Label>{t("edit.variantPrice")}</Label>
                    <Field value={edit.price} onChangeText={(price) => setEdit({ price })} keyboardType="decimal-pad" placeholder={form.price} accessibilityLabel={`${variant.name} ${t("edit.variantPrice")}`} />
                  </View>
                  {product.tracksStock ? (
                    <View style={{ flex: 1 }}>
                      <Label>{t("edit.variantStockLabel")}</Label>
                      <Field value={edit.stock} onChangeText={(stock) => setEdit({ stock })} keyboardType="number-pad" placeholder="—" accessibilityLabel={`${variant.name} ${t("edit.variantStockLabel")}`} />
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </Card>
      ) : null}

      {type.fields.length ? (
        <Card style={{ gap: 10 }}>
          <T weight="extrabold" style={{ fontSize: 18 }}>{t("edit.details")}</T>
          <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("edit.detailsSub")}</T>
          {type.fields.map((entry) => {
            const label = t.dynamic(`field.${entry.key}`, entry.label);
            const value = entry.column ? columns[entry.column] : details[entry.key] ?? "";
            const change = (text: string) => {
              if (entry.column) setColumns((current) => ({ ...current, [entry.column!]: text }));
              else setDetails((current) => ({ ...current, [entry.key]: text }));
              setSaved(false);
            };
            return (
              <View key={entry.key}>
                <Label>{label}</Label>
                <Field
                  value={value}
                  onChangeText={change}
                  maxLength={1000}
                  multiline={entry.kind === "longtext"}
                  placeholder={entry.placeholder ?? entry.choices?.join(", ")}
                  accessibilityLabel={label}
                  style={entry.kind === "longtext" ? { height: 100, paddingTop: 14, textAlignVertical: "top" } : undefined}
                />
              </View>
            );
          })}
        </Card>
      ) : null}

      <LinkButton title={t("edit.moreOnWeb")} color={colors.inkSoft} onPress={() => void openWeb(`/products/${product.id}`)} />
      <LinkButton title={busy === "remove" ? t("edit.removing") : t("edit.remove")} color={colors.danger} onPress={confirmRemove} />

      <Sheet visible={picking} onClose={() => setPicking(false)} title={t("edit.categoryTitle")}>
        {choicesError ? <Notice>{choicesError}</Notice> : null}
        {!choices && !choicesError ? <LoadingBlock /> : null}
        {choices ? (
          <>
            <Field value={categoryQ} onChangeText={setCategoryQ} placeholder={t("edit.categorySearch")} returnKeyType="search" accessibilityLabel={t("edit.categorySearch")} style={{ height: 48 }} />
            <ScrollView style={{ maxHeight: 280 }} keyboardShouldPersistTaps="handled">
              {categoryOptions(choices.own, choices.all, categoryQ).map((option) => {
                const on = option.id === category?.id;
                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => pickCategory(option)}
                    style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line, opacity: pressed ? 0.7 : 1 })}
                  >
                    <T weight={on ? "extrabold" : "semibold"} style={{ flex: 1, fontSize: 16 }} numberOfLines={1}>{option.name}</T>
                    {option.own ? <T style={{ color: colors.inkSoft, fontSize: 13 }}>{t("edit.categoryYours")}</T> : null}
                    {on ? <AppIcon name="check" size={18} color={colors.success} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Label>{t("edit.categoryNew")}</Label>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <Field value={newCategory} onChangeText={setNewCategory} maxLength={60} placeholder={t("edit.categoryNewPlaceholder")} accessibilityLabel={t("edit.categoryNew")} style={{ flex: 1, height: 48 }} />
              <PillButton title={t("edit.categoryAdd")} size="sm" busy={creating} disabled={!newCategory.trim()} onPress={() => void addCategory()} />
            </View>
          </>
        ) : null}
      </Sheet>

      <Sheet visible={photo !== null} onClose={() => setPhoto(null)} title={t("edit.photoTitle", { number: (photo ?? 0) + 1 })}>
        {photo !== null && photo > 0 ? (
          <ChoiceRow icon="star" title={t("edit.makeMain")} sub={t("edit.makeMainSub")} tint={colors.successTint} onPress={() => changePhotos((images) => makeMainPhoto(images, photo))} />
        ) : null}
        {photo !== null && photo > 0 ? (
          <ChoiceRow icon="chevron" title={t("edit.moveLeft")} onPress={() => changePhotos((images) => movePhoto(images, photo, photo - 1))} />
        ) : null}
        {photo !== null && photo < form.images.length - 1 ? (
          <ChoiceRow icon="chevron" title={t("edit.moveRight")} onPress={() => changePhotos((images) => movePhoto(images, photo, photo + 1))} />
        ) : null}
        {photo !== null ? (
          <ChoiceRow icon="x" title={t("edit.removePhoto")} tint={colors.dangerTint} iconColor={colors.danger} onPress={() => changePhotos((images) => removePhoto(images, photo))} />
        ) : null}
      </Sheet>
    </Screen>
  );
}
