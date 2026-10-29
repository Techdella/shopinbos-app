import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View, type LayoutChangeEvent } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { naira } from "@shared/onboarding";
import { preorderShareText } from "@shared/preorder";
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
  type ProductEditForm,
  type ProductEditProblem,
  type VariantEdits,
} from "@shared/product-edit";
import { PRODUCT_TYPES, productTypeDef, type ProductTypeKey } from "@shared/product-types";
import { checkShortCode, normalizeShortCode } from "@shared/product-codes";
import type { ProductVariant } from "@shared/product-variants";
import { Eyebrow, Heading, Stepper, Sub } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { IconButton } from "@/components/seller/bits";
import { CodeBadge, ShareProductButton } from "@/components/seller/ProductCode";
import { OneLine, PreorderEditor } from "@/components/Preorder";
import { ApiError } from "@/lib/api";
import { Screen } from "@/components/Screen";
import { ChoiceRow, Sheet } from "@/components/Sheet";
import { Card, Field, Label, LinkButton, Notice, PillButton, Segmented, T, Toggle } from "@/components/ui";
import { setPaused } from "@/lib/dropship";
import { saleBreakdown } from "@/lib/find-pure";
import { cleanCategoryName, categoryOptions, sameNameCategory, type CategoryLite } from "@/lib/categories-pure";
import {
  LIMITS,
  WEIGHT_UNITS,
  addOption,
  addOptionValues,
  editsWithNew,
  marginPercent,
  moreFormFrom,
  morePatch,
  moveRow,
  removeOption,
  removeOptionValue,
  rowKey,
  versionSave,
  type FaqRow,
  type MoreForm,
  type MoreProblem,
  type OptionResult,
  type SpecRow,
  type TextColumn,
  type VersionState,
} from "@/lib/product-more-pure";
import { archiveProduct, createCategory, fetchAllCategories, fetchEditProduct, fetchStoreCategories, saveProduct, uploadProductPhoto, type EditProduct } from "@/lib/products";
import { fetchSetup } from "@/lib/setup";
import { shareOnWhatsApp, shareText } from "@/lib/share";
import { PREORDER_PROBLEM_KEY, isDropshipProduct, preorderFormFrom, preorderLineText, preorderPatch, type PreorderForm } from "@/lib/preorder-pure";
import { useT } from "@/lib/i18n";
import { colors, fonts, radii } from "@/theme";

// Edit product (web /products/[id]): everything the web product form fills in. Always open: photos (order, main
// photo), name, price, old price, stock (count it or not), description, category and whether customers see it.
// Folded sections, opened with a tap: type and details (+ the seller's own specification rows), sizes / colours /
// options (add or remove them; each version's price, stock and on/off), full description, questions buyers ask,
// care / delivery / returns / warranty / support, cost / SKU / barcode / weight, and tags / video / Google text /
// featured. One Save sends only what changed with PATCH /api/store/products/[id], the web form's route and rules
// (logic in lib/product-more-pure.ts and shared/product-edit.ts). Dropship products show the supplier and what each
// sale leaves; their stock and options are the supplier's. Only the product page layout stays on the website.
// Preorders (shared/preorder.ts, like the web form's Inventory › Preorder): take them, ships from, most preorders and
// the promise, saved as `preorder` with the rest; Share preorder posts it to WhatsApp. Not on dropship products
// (they follow the supplier's listing: a note says when the supplier takes preorders).

type Visible = "live" | "hidden";

const PROBLEM_WORDS = {
  name: "edit.problem.name",
  price: "edit.problem.price",
  compareAt: "edit.problem.compareAt",
  stock: "edit.problem.stock",
  lowStock: "edit.problem.lowStock",
  description: "edit.problem.description",
} as const satisfies Record<ProductEditProblem, string>;

const MORE_PROBLEM_WORDS = {
  longDescription: "more.problem.longDescription",
  longText: "more.problem.longText",
  spec: "more.problem.spec",
  faq: "more.problem.faq",
  sku: "more.problem.sku",
  barcode: "more.problem.barcode",
  video: "more.problem.video",
  costPrice: "more.problem.costPrice",
  weight: "more.problem.weight",
  reserved: "more.problem.reserved",
  seoTitle: "more.problem.seoTitle",
  seoDescription: "more.problem.seoDescription",
} as const satisfies Record<MoreProblem, string>;

const OPTION_PROBLEM_WORDS = {
  optionName: "opt.problem.optionName",
  optionTwice: "opt.problem.optionTwice",
  maxOptions: "opt.problem.maxOptions",
  maxValues: "opt.problem.maxValues",
  tooMany: "opt.problem.tooMany",
} as const;

const POLICY_FIELDS = [
  { key: "careInstructions", label: "policy.careInstructions", placeholder: "policy.carePlaceholder" },
  { key: "shippingInfo", label: "policy.shippingInfo", placeholder: "policy.shippingPlaceholder" },
  { key: "returnPolicy", label: "policy.returnPolicy", placeholder: "policy.returnPlaceholder" },
  { key: "warranty", label: "policy.warranty", placeholder: "policy.warrantyPlaceholder" },
  { key: "supportInfo", label: "policy.supportInfo", placeholder: "policy.supportPlaceholder" },
] as const satisfies ReadonlyArray<{ key: TextColumn; label: string; placeholder: string }>;

type FoldId = "details" | "options" | "long" | "faqs" | "policies" | "codes" | "more";

const LONG_BOX = { height: 110, paddingTop: 14, textAlignVertical: "top" } as const;

/** A section that opens with a tap, so the screen stays short. */
function Fold({ title, sub, open, onToggle, children }: { title: string; sub: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <Card style={{ gap: 12 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        hitSlop={6}
        style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44, opacity: pressed ? 0.7 : 1 })}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <T weight="extrabold" style={{ fontSize: 18 }}>{title}</T>
          <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{sub}</T>
        </View>
        <View style={{ transform: [{ rotate: open ? "270deg" : "90deg" }] }}>
          <AppIcon name="chevron" size={20} color={colors.inkSoft} />
        </View>
      </Pressable>
      {open ? children : null}
    </Card>
  );
}

/** A small round "x" button that removes a row. */
function RemoveButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.dangerTint, opacity: pressed ? 0.7 : 1 })}>
      <AppIcon name="x" size={18} color={colors.danger} />
    </Pressable>
  );
}

/** A switch with its words, for on/off settings. */
function SwitchRow({ title, sub, on, onChange }: { title: string; sub?: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <T weight="bold" style={{ fontSize: 16 }}>{title}</T>
        {sub ? <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{sub}</T> : null}
      </View>
      <Toggle on={on} onChange={onChange} label={title} />
    </View>
  );
}

function versionStateOf(product: EditProduct): VersionState {
  // Older servers send only the editable rows: shown and edited, but options can't be added or removed.
  const rows: ProductVariant[] = product.variantRows ?? product.variants.map((row) => ({ ...row, options: {}, compareAtPrice: null, sku: null, imageUrl: null }));
  return { options: product.variantOptions ?? [], rows };
}

function isLive(product: EditProduct): boolean {
  const published = product.status === "published" || product.status === "active";
  return product.dropship ? published && !product.dropship.paused : published;
}

export default function EditProductScreen() {
  const t = useT("m_productedit", "m_products", "common", "productTypes", "m_ui");
  const tm = useT("marketplace");
  // section=preorder (from the pre-orders list): open scrolled to the Preorder settings.
  const { id, section } = useLocalSearchParams<{ id: string; section?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const jumped = useRef(false);
  const jumpTo = (event: LayoutChangeEvent) => {
    if (jumped.current || section !== "preorder") return;
    jumped.current = true;
    const y = event.nativeEvent.layout.y;
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true }), 250);
  };
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
  const [more, setMore] = useState<MoreForm | null>(null);
  const [productType, setProductType] = useState<ProductTypeKey>("other");
  const [typePicking, setTypePicking] = useState(false);
  const [versionState, setVersions] = useState<VersionState>({ options: [], rows: [] });
  const [versionsBefore, setVersionsBefore] = useState<VersionState>({ options: [], rows: [] });
  const [versionOn, setVersionOn] = useState<Record<string, boolean>>({});
  const [newOption, setNewOption] = useState({ name: "", values: "" });
  const [valueDrafts, setValueDrafts] = useState<Record<string, string>>({});
  const [optionProblem, setOptionProblem] = useState<string | null>(null);
  const [open, setOpen] = useState<Partial<Record<FoldId, boolean>>>({});
  // Category: the one picked (saved as categoryId), the picker sheet and its choices (loaded when it opens).
  const [category, setCategory] = useState<CategoryLite | null>(null);
  const [picking, setPicking] = useState(false);
  const [choices, setChoices] = useState<{ own: CategoryLite[]; all: CategoryLite[] } | null>(null);
  const [choicesError, setChoicesError] = useState<string | null>(null);
  const [categoryQ, setCategoryQ] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [creating, setCreating] = useState(false);
  // The shop's link, for Share this product (its page is <shop link>/product/<id>).
  const [storeUrl, setStoreUrl] = useState<string | null>(null);
  // The short code customers quote ("BAG2"), editable: 2–8 letters and numbers, unique in the shop.
  const [code, setCode] = useState("");
  // Preorders: take them, the ship date, the most taken and the promise (lib/preorder-pure.ts).
  const [preorder, setPreorder] = useState<PreorderForm>(() => preorderFormFrom(null));
  const stockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    void fetchSetup()
      .then((overview) => setStoreUrl(overview.store.url))
      .catch(() => null);
    return () => {
      if (stockTimer.current) clearTimeout(stockTimer.current);
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const next = await fetchEditProduct(id);
      setProduct(next);
      setForm(formFromProduct(next));
      setVariantEdits(variantEditsFrom(next.variants));
      setDetails({ ...next.productDetails });
      setMore(moreFormFrom(next));
      setCode(next.shortCode ?? "");
      setPreorder(preorderFormFrom(next.preorder));
      setProductType(next.productType);
      const shape = versionStateOf(next);
      setVersions(shape);
      setVersionsBefore(shape);
      setVersionOn(Object.fromEntries(shape.rows.map((row) => [row.id, row.enabled])));
      setOptionProblem(null);
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

  function editMore(patch: Partial<MoreForm>) {
    setMore((current) => (current ? { ...current, ...patch } : current));
    setSaved(false);
  }

  function toggleFold(id: FoldId) {
    setOpen((current) => ({ ...current, [id]: !current[id] }));
  }

  /** Options added or removed: rows are rebuilt; new versions get empty boxes (main price, not counted). */
  function changeOptions(result: OptionResult) {
    if (!result.ok) {
      setOptionProblem(t(OPTION_PROBLEM_WORDS[result.problem], { count: result.count ?? 0 }));
      return false;
    }
    setOptionProblem(null);
    setVersions(result.state);
    setVariantEdits((current) => editsWithNew(result.state.rows, current));
    setVersionOn((current) => Object.fromEntries(result.state.rows.map((row) => [row.id, current[row.id] ?? row.enabled])));
    setSaved(false);
    return true;
  }

  function editSpec(index: number, patch: Partial<SpecRow>) {
    if (!more) return;
    editMore({ specs: more.specs.map((row, i) => (i === index ? { ...row, ...patch } : row)) });
  }

  function editFaq(index: number, patch: Partial<FaqRow>) {
    if (!more) return;
    editMore({ faqs: more.faqs.map((row, i) => (i === index ? { ...row, ...patch } : row)) });
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
    if (!product || !form || !more) return;
    setError(null);
    const result = productPatch(product, form);
    if (!result.ok) return setError(t(PROBLEM_WORDS[result.problem]));
    const extraFields = morePatch(product, more, { tracksStock: product.tracksStock });
    if (!extraFields.ok) return setError(t(MORE_PROBLEM_WORDS[extraFields.problem], { number: extraFields.row ?? 1 }));
    const versions = versionSave(product.variants, versionsBefore, versionState, variantEdits, versionOn);
    if (!versions.ok) {
      if (versions.problem === "versions") return setError(t("more.problem.versions"));
      return setError(t(versions.problem === "variantPrice" ? "edit.problem.variantPrice" : "edit.problem.variantStock", { name: versions.name }));
    }
    const typedCode = normalizeShortCode(code);
    let codePatch: { shortCode: string } | null = null;
    if (typedCode !== (product.shortCode ?? "")) {
      const checked = checkShortCode(typedCode);
      if (!checked.ok) return setError(t("code.format"));
      codePatch = { shortCode: checked.code };
    }
    // Preorders: only when the server sent them (newer servers) and the product isn't dropship; only when changed.
    const preorderResult = product.preorder && !isDropshipProduct(product) ? preorderPatch(preorder, product.preorder) : ({ ok: true, patch: null } as const);
    if (!preorderResult.ok) return setError(t.dynamic(PREORDER_PROBLEM_KEY[preorderResult.problem]));
    const changedDetails = detailsPatch(product.productDetails, details);
    const extra: Record<string, unknown> = {
      ...(preorderResult.patch ? { preorder: preorderResult.patch } : {}),
      ...extraFields.patch,
      ...(versions.full ? versions.full : versions.updates.length ? { variantUpdates: versions.updates } : {}),
      ...(changedDetails ? { productDetails: changedDetails } : {}),
      ...(codePatch ?? {}),
      ...(productType !== product.productType ? { productType } : {}),
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
      if (e instanceof ApiError && e.code === "CODE_TAKEN") return setError(t("code.taken", { code: typedCode }));
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

  if (!product || !form || !more) {
    return (
      <Screen title={t("edit.title")}>
        {loadError ? <ErrorState message={loadError} onRetry={() => void load()} /> : <LoadingBlock />}
      </Screen>
    );
  }

  const dropship = product.dropship;
  const type = productTypeDef(productType);
  // "Count my stock" shows when the server sends it (own stock only); older servers: own stock is always counted.
  const hasStockSwitch = product.tracksStock && product.trackStock != null;
  const countsStock = product.tracksStock && (!hasStockSwitch || more.trackStock);
  // Stock counted per version: the product's own stock is their total (the server adds it up).
  const countedVersions = countsStock ? versionState.rows.filter((variant) => (versionOn[variant.id] ?? variant.enabled) && (variantEdits[variant.id]?.stock ?? "").trim() !== "") : [];
  const versionTotal = countedVersions.reduce((sum, variant) => sum + (parseWholeNumber(variantEdits[variant.id]?.stock ?? "") ?? 0), 0);
  const typedPrice = parseNaira(form.price);
  const sale = dropship ? saleBreakdown(typedPrice ?? 0, dropship.cost) : null;
  // Options can be added or removed when the server sent them in full; a dropship product's are the supplier's.
  const canEditOptions = Boolean(product.variantRows) && !dropship;
  // Care instructions and warranty show with the type's details when the type asks for them, else under policies.
  const typeColumns = new Set<string>(type.fields.flatMap((entry) => (entry.column ? [entry.column] : [])));
  const margin = marginPercent(typedPrice, parseNaira(more.costPrice));
  const presetOptions = type.options.filter((preset) => !versionState.options.some((option) => option.name.toLowerCase() === preset.name.toLowerCase()));

  // The prototype's product page on top: the photo, name and price, the stock with − and + (saved a moment after
  // the last tap), and Share this product. The full editor follows under "Edit details".
  const stepStock = countsStock && !countedVersions.length;
  const stockNow = parseWholeNumber(form.stock) ?? product.currentStock;
  const shareUrl = storeUrl && isLive(product) ? `${storeUrl.replace(/\/$/, "")}/product/${product.id}` : null;
  // Share preorder: once preorders are saved on (and the product is live), a ready-made post for WhatsApp.
  const ownDropship = isDropshipProduct(product);
  const preorderShare =
    shareUrl && product.preorder?.enabled && !ownDropship
      ? preorderShareText({ name: product.name, price: naira(product.retailPrice), shipsOn: product.preorder.shipsOn, url: product.url ?? shareUrl })
      : null;
  const supplierPreorder = dropship?.preorder?.on ? dropship.preorder : null;

  function bumpStock(next: number) {
    edit({ stock: String(next) });
    if (stockTimer.current) clearTimeout(stockTimer.current);
    stockTimer.current = setTimeout(() => {
      stockTimer.current = null;
      saveProduct(product!.id, { currentStock: next })
        .then(() => setProduct((current) => (current ? { ...current, currentStock: next } : current)))
        .catch((e) => setError(e instanceof Error ? e.message : t("edit.saveFailed")));
    }, 700);
  }

  return (
    <Screen
      title={t("view.title")}
      scrollRef={scrollRef}
      refreshing={refreshing}
      onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
      footer={
        <View style={{ gap: 6 }}>
          {error ? <Notice>{error}</Notice> : saved ? <Notice tone="success">{t("edit.saved")}</Notice> : null}
          <PillButton title={t("edit.save")} busy={busy === "save"} disabled={uploading > 0 || busy === "remove"} onPress={() => void save()} />
        </View>
      }
    >
      {form.images[0] ? <Image source={{ uri: form.images[0] }} style={{ width: "100%", height: 260, borderRadius: 24 }} contentFit="cover" transition={150} accessibilityIgnoresInvertColors /> : null}
      <View style={{ gap: 4 }}>
        <Heading>{form.name.trim() || product.name}</Heading>
        {typedPrice ? <Sub>{naira(typedPrice)}</Sub> : null}
        {product.shortCode ? <CodeBadge code={product.shortCode} /> : null}
      </View>
      {stepStock ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 20 }}>
          <View style={{ flex: 1, gap: 3 }}>
            <T weight="bold" style={{ fontSize: 16 }}>{t("view.inStock")}</T>
            <T style={{ fontSize: 14, color: stockNow <= (parseWholeNumber(form.lowStock) ?? 0) ? colors.accentInk : colors.inkSoft }}>
              {stockNow <= 0 ? t("list.soldOut") : stockNow <= (parseWholeNumber(form.lowStock) ?? 0) ? t("list.runningLow", { count: stockNow }) : t("drafts.inStock", { count: stockNow })}
            </T>
          </View>
          <Stepper value={stockNow} label={t("edit.stock")} onChange={bumpStock} />
        </View>
      ) : null}
      {/* Share to WhatsApp (name, price, code and link, in the seller's language), and the share sheet. */}
      {shareUrl ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <ShareProductButton product={{ name: product.name, retailPrice: product.retailPrice, shortCode: product.shortCode, url: product.url ?? shareUrl }} />
          </View>
          <IconButton icon="share" label={t("view.share")} onPress={() => void shareText(`${form.name.trim() || product.name} ${shareUrl}`)} />
        </View>
      ) : null}
      {preorderShare ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <PillButton tone="white" size="md" accessibilityLabel={t("preorder.share")} onPress={() => void shareOnWhatsApp(preorderShare)}>
              <AppIcon name="clock" size={18} color={colors.ink} />
              <OneLine text={t("preorder.share")} size={16} />
            </PillButton>
          </View>
          <IconButton icon="share" label={t("preorder.share")} onPress={() => void shareText(preorderShare)} />
        </View>
      ) : null}
      <Eyebrow>{t("view.editDetails")}</Eyebrow>

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
          {/* One tap to Rex's video studio with this product's photos (the supplier's photos came with it). */}
          <PillButton
            testID="rex-video"
            tone="white"
            size="sm"
            icon="play"
            title={tm("rex.makeVideo")}
            style={{ alignSelf: "flex-start" }}
            onPress={() => router.push({ pathname: "/video/studio", params: { purpose: "product", product: String(id) } })}
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
        <Label>{t("code.label")}</Label>
        <Field
          value={code}
          onChangeText={(value) => {
            setCode(value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8));
            setSaved(false);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={8}
          placeholder="BAG2"
          style={{ fontFamily: fonts.mono, letterSpacing: 1 }}
          accessibilityLabel={t("code.label")}
        />
        <T style={{ color: colors.inkSoft, fontSize: 14, marginTop: 6 }}>{t("code.hint")}</T>
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

      {hasStockSwitch ? (
        <Card>
          <SwitchRow title={t("stock.track")} sub={more.trackStock ? t("stock.trackOn") : t("stock.trackOff")} on={more.trackStock} onChange={(trackStock) => editMore({ trackStock })} />
        </Card>
      ) : null}
      {countsStock && countedVersions.length ? (
        <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t("edit.variantTotal", { count: versionTotal })}</T>
      ) : null}
      {countsStock && !countedVersions.length ? (
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
      {hasStockSwitch && more.trackStock ? (
        <>
          <View>
            <Label>{t("stock.reserved")}</Label>
            <Field value={more.reservedStock} onChangeText={(reservedStock) => editMore({ reservedStock })} keyboardType="number-pad" accessibilityLabel={t("stock.reserved")} />
            <T style={{ color: colors.inkSoft, fontSize: 14, marginTop: 6 }}>{t("stock.reservedHint")}</T>
          </View>
          <Card>
            <SwitchRow title={t("stock.keepSelling")} sub={t("stock.keepSellingSub")} on={more.continueSelling} onChange={(continueSelling) => editMore({ continueSelling })} />
          </Card>
        </>
      ) : null}

      {/* Preorders: sell before the stock arrives (own products). Dropship products follow the supplier's listing. */}
      {ownDropship ? (
        product.preorder || supplierPreorder ? (
          <View onLayout={jumpTo}>
            <Card style={{ gap: 6 }}>
              <T weight="extrabold" style={{ fontSize: 18 }}>{t("preorder.title")}</T>
              <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>
                {supplierPreorder && dropship
                  ? t("preorder.dropshipSupplier", { name: dropship.supplier.name, line: preorderLineText(supplierPreorder, new Date(), t) ?? "" })
                  : t("preorder.dropshipOff")}
              </T>
            </Card>
          </View>
        ) : null
      ) : product.preorder ? (
        <View onLayout={jumpTo}>
          <PreorderEditor value={preorder} onChange={(next) => { setPreorder(next); setSaved(false); }} audience="customers" taken={product.preorder.enabled ? product.preorder.taken : null} />
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

      {/* Type, its details (Material, Skin type…) and the seller's own rows. */}
      <Fold
        title={t("fold.details")}
        sub={t("fold.detailsSub", { type: t.dynamic(`type.${type.key}`, type.label) })}
        open={Boolean(open.details)}
        onToggle={() => toggleFold("details")}
      >
        <View>
          <Label>{t("ptype.label")}</Label>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t("ptype.label")}: ${t.dynamic(`type.${type.key}`, type.label)}`}
            onPress={() => setTypePicking(true)}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 56, paddingHorizontal: 16, borderRadius: radii.field, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 })}
          >
            <AppIcon name="tag" size={18} color={colors.inkSoft} />
            <T weight="bold" style={{ flex: 1, fontSize: 16 }} numberOfLines={1}>{t.dynamic(`type.${type.key}`, type.label)}</T>
            <T weight="bold" style={{ fontSize: 15, color: colors.accentInk }}>{t("edit.categoryChange")}</T>
          </Pressable>
          <T style={{ color: colors.inkSoft, fontSize: 14, marginTop: 6 }}>{t("ptype.hint")}</T>
        </View>

        {type.fields.length ? <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("edit.detailsSub")}</T> : null}
        {type.fields.map((entry) => {
          const label = t.dynamic(`field.${entry.key}`, entry.label);
          const value = entry.column ? more[entry.column] : details[entry.key] ?? "";
          const change = (text: string) => {
            if (entry.column) editMore({ [entry.column]: text });
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

        <View style={{ gap: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.line }}>
          <T weight="extrabold" style={{ fontSize: 16, marginTop: 6 }}>{t("spec.title")}</T>
          <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("spec.sub")}</T>
        </View>
        {more.specs.map((row, index) => (
          <View key={row.key} style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <Field value={row.name} onChangeText={(name) => editSpec(index, { name })} maxLength={LIMITS.specName} placeholder={t("spec.namePlaceholder")} accessibilityLabel={t("spec.nameLabel", { number: index + 1 })} style={{ flex: 1 }} />
              <RemoveButton label={t("spec.remove", { number: index + 1 })} onPress={() => editMore({ specs: more.specs.filter((_, i) => i !== index) })} />
            </View>
            <Field value={row.value} onChangeText={(value) => editSpec(index, { value })} maxLength={LIMITS.specValue} placeholder={t("spec.valuePlaceholder")} accessibilityLabel={t("spec.valueLabel", { number: index + 1 })} />
          </View>
        ))}
        <PillButton title={t("spec.add")} tone="white" size="sm" onPress={() => editMore({ specs: [...more.specs, { key: rowKey(), name: "", value: "" }] })} />
      </Fold>

      {/* Sizes, colours…: options and one row per combination with its own price, stock and on/off. */}
      {canEditOptions || versionState.rows.length ? (
        <Fold
          title={t("fold.options")}
          sub={versionState.rows.length ? t("fold.optionsCount", { count: versionState.rows.length }) : t("fold.optionsSub")}
          open={Boolean(open.options)}
          onToggle={() => toggleFold("options")}
        >
          {dropship ? <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("opt.dropshipNote")}</T> : null}
          {canEditOptions && !versionState.options.length ? <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("opt.empty")}</T> : null}
          {canEditOptions
            ? versionState.options.map((option, index) => {
                const optionName = t.dynamic(`option.${option.name}`, option.name);
                const preset = type.options.find((entry) => entry.name.toLowerCase() === option.name.toLowerCase());
                const quick = (preset?.values ?? []).filter((value) => !option.values.some((existing) => existing.toLowerCase() === value.toLowerCase())).slice(0, 8);
                const draft = valueDrafts[option.name] ?? "";
                const addDraft = (text: string) => {
                  if (changeOptions(addOptionValues(versionState, index, text))) setValueDrafts((current) => ({ ...current, [option.name]: "" }));
                };
                return (
                  <View key={option.name} style={{ gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <T weight="extrabold" style={{ flex: 1, fontSize: 16 }}>{optionName}</T>
                      <RemoveButton label={t("opt.remove", { name: optionName })} onPress={() => changeOptions(removeOption(versionState, index))} />
                    </View>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      {option.values.map((value) => (
                        <Pressable
                          key={value}
                          accessibilityRole="button"
                          accessibilityLabel={t("opt.removeValue", { value })}
                          onPress={() => changeOptions(removeOptionValue(versionState, index, value))}
                          style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: radii.pill, backgroundColor: colors.canvas, opacity: pressed ? 0.7 : 1 })}
                        >
                          <T weight="bold" style={{ fontSize: 15 }}>{value}</T>
                          <AppIcon name="x" size={14} color={colors.inkSoft} />
                        </Pressable>
                      ))}
                    </View>
                    {quick.length ? (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        {quick.map((value) => (
                          <Pressable
                            key={value}
                            accessibilityRole="button"
                            accessibilityLabel={t("opt.addValue", { value })}
                            onPress={() => addDraft(value)}
                            style={({ pressed }) => ({ minHeight: 40, paddingHorizontal: 14, justifyContent: "center", borderRadius: radii.pill, borderWidth: 1, borderStyle: "dashed", borderColor: colors.line, opacity: pressed ? 0.7 : 1 })}
                          >
                            <T style={{ fontSize: 15 }}>+ {t.dynamic(`value.${value}`, value)}</T>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                    <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                      <Field
                        value={draft}
                        onChangeText={(text) => setValueDrafts((current) => ({ ...current, [option.name]: text }))}
                        placeholder={t("opt.addValuesPlaceholder")}
                        accessibilityLabel={t("opt.addValues", { name: optionName })}
                        returnKeyType="done"
                        onSubmitEditing={() => addDraft(draft)}
                        style={{ flex: 1, height: 48 }}
                      />
                      <PillButton title={t("opt.add")} size="sm" disabled={!draft.trim()} onPress={() => addDraft(draft)} />
                    </View>
                  </View>
                );
              })
            : null}

          {canEditOptions && versionState.options.length < 3 ? (
            <View style={{ gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line }}>
              <T weight="extrabold" style={{ fontSize: 16 }}>{t("opt.newTitle")}</T>
              {presetOptions.length ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {presetOptions.map((preset) => (
                    <Pressable
                      key={preset.name}
                      accessibilityRole="button"
                      onPress={() => setNewOption((current) => ({ ...current, name: preset.name }))}
                      style={({ pressed }) => ({ minHeight: 40, paddingHorizontal: 14, justifyContent: "center", borderRadius: radii.pill, borderWidth: 1, borderColor: newOption.name === preset.name ? colors.ink : colors.line, opacity: pressed ? 0.7 : 1 })}
                    >
                      <T weight="bold" style={{ fontSize: 15 }}>{t.dynamic(`option.${preset.name}`, preset.name)}</T>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <Field value={newOption.name} onChangeText={(name) => setNewOption((current) => ({ ...current, name }))} maxLength={40} placeholder={t("opt.newNamePlaceholder")} accessibilityLabel={t("opt.newName")} style={{ height: 48 }} />
              <Field value={newOption.values} onChangeText={(values) => setNewOption((current) => ({ ...current, values }))} placeholder={t("opt.newValuesPlaceholder")} accessibilityLabel={t("opt.newValues")} style={{ height: 48 }} />
              <PillButton
                title={t("opt.newAdd")}
                tone="white"
                size="sm"
                disabled={!newOption.name.trim()}
                onPress={() => {
                  if (changeOptions(addOption(versionState, newOption.name, newOption.values))) setNewOption({ name: "", values: "" });
                }}
              />
            </View>
          ) : null}
          {optionProblem ? <Notice>{optionProblem}</Notice> : null}

          {versionState.rows.length ? (
            <View style={{ gap: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line }}>
              <T weight="extrabold" style={{ fontSize: 16 }}>{t("opt.rows")}</T>
              <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("edit.variantsSub")}</T>
            </View>
          ) : null}
          {versionState.rows.map((variant) => {
            const boxes = variantEdits[variant.id] ?? { price: "", stock: "" };
            const setBoxes = (patch: Partial<typeof boxes>) => {
              setVariantEdits((current) => ({ ...current, [variant.id]: { ...boxes, ...patch } }));
              setSaved(false);
            };
            const on = versionOn[variant.id] ?? variant.enabled;
            return (
              <View key={variant.id} style={{ gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <T weight="bold" numberOfLines={1} style={{ flex: 1 }}>
                    {variant.name}
                    {on ? "" : ` · ${t("edit.variantOff")}`}
                  </T>
                  <Toggle on={on} onChange={(next) => { setVersionOn((current) => ({ ...current, [variant.id]: next })); setSaved(false); }} label={t("edit.variantOn", { name: variant.name })} />
                </View>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Label>{t("edit.variantPrice")}</Label>
                    <Field value={boxes.price} onChangeText={(price) => setBoxes({ price })} keyboardType="decimal-pad" placeholder={form.price} accessibilityLabel={`${variant.name} ${t("edit.variantPrice")}`} />
                  </View>
                  {countsStock ? (
                    <View style={{ flex: 1 }}>
                      <Label>{t("edit.variantStockLabel")}</Label>
                      <Field value={boxes.stock} onChangeText={(stock) => setBoxes({ stock })} keyboardType="number-pad" placeholder="—" accessibilityLabel={`${variant.name} ${t("edit.variantStockLabel")}`} />
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </Fold>
      ) : null}

      <Fold title={t("fold.long")} sub={t("fold.longSub")} open={Boolean(open.long)} onToggle={() => toggleFold("long")}>
        <Field
          value={more.longDescription}
          onChangeText={(longDescription) => editMore({ longDescription })}
          multiline
          maxLength={LIMITS.longDescription}
          placeholder={t("long.placeholder")}
          accessibilityLabel={t("fold.long")}
          style={{ height: 200, paddingTop: 14, textAlignVertical: "top" }}
        />
      </Fold>

      <Fold
        title={t("fold.faqs")}
        sub={more.faqs.length ? t("fold.faqsCount", { count: more.faqs.length }) : t("fold.faqsSub")}
        open={Boolean(open.faqs)}
        onToggle={() => toggleFold("faqs")}
      >
        {!more.faqs.length ? <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("faq.empty")}</T> : null}
        {more.faqs.map((row, index) => (
          <View key={row.key} style={{ gap: 6, padding: 12, borderRadius: radii.field, backgroundColor: colors.canvas }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <T weight="bold" style={{ flex: 1 }}>{t("faq.question", { number: index + 1 })}</T>
              {index > 0 ? <LinkButton title={t("faq.up")} color={colors.inkSoft} onPress={() => editMore({ faqs: moveRow(more.faqs, index, -1) })} /> : null}
              <RemoveButton label={t("faq.remove", { number: index + 1 })} onPress={() => editMore({ faqs: more.faqs.filter((_, i) => i !== index) })} />
            </View>
            <Field value={row.question} onChangeText={(question) => editFaq(index, { question })} maxLength={LIMITS.faqQuestion} placeholder={t("faq.questionPlaceholder")} accessibilityLabel={t("faq.question", { number: index + 1 })} />
            <Field value={row.answer} onChangeText={(answer) => editFaq(index, { answer })} multiline maxLength={LIMITS.faqAnswer} placeholder={t("faq.answerPlaceholder")} accessibilityLabel={t("faq.answer", { number: index + 1 })} style={{ height: 90, paddingTop: 14, textAlignVertical: "top" }} />
          </View>
        ))}
        <PillButton title={t("faq.add")} tone="white" size="sm" onPress={() => editMore({ faqs: [...more.faqs, { key: rowKey(), question: "", answer: "" }] })} />
      </Fold>

      <Fold title={t("fold.policies")} sub={t("fold.policiesSub")} open={Boolean(open.policies)} onToggle={() => toggleFold("policies")}>
        {POLICY_FIELDS.filter((entry) => !typeColumns.has(entry.key)).map((entry) => (
          <View key={entry.key}>
            <Label>{t(entry.label)}</Label>
            <Field
              value={more[entry.key]}
              onChangeText={(text) => editMore({ [entry.key]: text })}
              multiline
              maxLength={LIMITS.longText}
              placeholder={t(entry.placeholder)}
              accessibilityLabel={t(entry.label)}
              style={LONG_BOX}
            />
          </View>
        ))}
      </Fold>

      <Fold title={t("fold.codes")} sub={t("fold.codesSub")} open={Boolean(open.codes)} onToggle={() => toggleFold("codes")}>
        {!dropship ? (
          <View>
            <Label>{t("codes.cost")}</Label>
            <Field value={more.costPrice} onChangeText={(costPrice) => editMore({ costPrice })} keyboardType="decimal-pad" placeholder="8000" accessibilityLabel={t("codes.cost")} />
            <T style={{ color: colors.inkSoft, fontSize: 14, marginTop: 6 }}>{margin !== null ? t("codes.margin", { percent: margin }) : t("codes.costHint")}</T>
          </View>
        ) : null}
        <View>
          <Label>{t("codes.sku")}</Label>
          <Field value={more.sku} onChangeText={(sku) => editMore({ sku })} maxLength={LIMITS.code} autoCapitalize="characters" placeholder="TOTE-001" accessibilityLabel={t("codes.sku")} />
        </View>
        <View>
          <Label>{t("codes.barcode")}</Label>
          <Field value={more.barcode} onChangeText={(barcode) => editMore({ barcode })} maxLength={LIMITS.code} placeholder={t("codes.barcodePlaceholder")} accessibilityLabel={t("codes.barcode")} />
        </View>
        <View>
          <Label>{t("codes.weight")}</Label>
          <Field value={more.weight} onChangeText={(weight) => editMore({ weight })} keyboardType="decimal-pad" placeholder="0.5" accessibilityLabel={t("codes.weight")} />
          <View style={{ marginTop: 8 }}>
            <Segmented options={WEIGHT_UNITS.map((unit) => ({ value: unit, label: unit }))} value={more.weightUnit as (typeof WEIGHT_UNITS)[number]} onChange={(weightUnit) => editMore({ weightUnit })} />
          </View>
          <T style={{ color: colors.inkSoft, fontSize: 14, marginTop: 6 }}>{t("codes.weightHint")}</T>
        </View>
      </Fold>

      <Fold title={t("fold.more")} sub={t("fold.moreSub")} open={Boolean(open.more)} onToggle={() => toggleFold("more")}>
        <View>
          <Label>{t("more.tags")}</Label>
          <Field value={more.tags} onChangeText={(tags) => editMore({ tags })} autoCapitalize="none" placeholder={t("more.tagsPlaceholder")} accessibilityLabel={t("more.tags")} />
          <T style={{ color: colors.inkSoft, fontSize: 14, marginTop: 6 }}>{t("more.tagsHint")}</T>
        </View>
        <View>
          <Label>{t("more.video")}</Label>
          <Field value={more.videoUrl} onChangeText={(videoUrl) => editMore({ videoUrl })} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://youtube.com/watch?v=…" accessibilityLabel={t("more.video")} />
          <T style={{ color: colors.inkSoft, fontSize: 14, marginTop: 6 }}>{t("more.videoHint")}</T>
        </View>
        {product.featured != null ? <SwitchRow title={t("more.featured")} sub={t("more.featuredSub")} on={more.featured} onChange={(featured) => editMore({ featured })} /> : null}
        <View style={{ gap: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.line }}>
          <T weight="extrabold" style={{ fontSize: 16, marginTop: 6 }}>{t("more.google")}</T>
          <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("more.googleSub")}</T>
        </View>
        <View>
          <Label>{t("more.seoTitle")}</Label>
          <Field value={more.seoTitle} onChangeText={(seoTitle) => editMore({ seoTitle })} maxLength={LIMITS.seoTitle} placeholder={form.name} accessibilityLabel={t("more.seoTitle")} />
          <T style={{ color: colors.inkSoft, fontSize: 14, marginTop: 6 }}>{t("more.letters", { count: more.seoTitle.length, max: LIMITS.seoTitle })}</T>
        </View>
        <View>
          <Label>{t("more.seoDescription")}</Label>
          <Field value={more.seoDescription} onChangeText={(seoDescription) => editMore({ seoDescription })} multiline maxLength={LIMITS.seoDescription} accessibilityLabel={t("more.seoDescription")} style={{ height: 90, paddingTop: 14, textAlignVertical: "top" }} />
          <T style={{ color: colors.inkSoft, fontSize: 14, marginTop: 6 }}>{t("more.letters", { count: more.seoDescription.length, max: LIMITS.seoDescription })}</T>
        </View>
      </Fold>


      <Sheet visible={typePicking} onClose={() => setTypePicking(false)} title={t("ptype.title")}>
        <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
          {PRODUCT_TYPES.map((entry) => {
            const on = entry.key === productType;
            return (
              <Pressable
                key={entry.key}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => { setProductType(entry.key); setTypePicking(false); setSaved(false); }}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 56, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line, opacity: pressed ? 0.7 : 1 })}
              >
                <View style={{ flex: 1 }}>
                  <T weight={on ? "extrabold" : "semibold"} style={{ fontSize: 16 }}>{t.dynamic(`type.${entry.key}`, entry.label)}</T>
                  <T style={{ color: colors.inkSoft, fontSize: 13 }} numberOfLines={1}>{t.dynamic(`hint.${entry.key}`, entry.hint)}</T>
                </View>
                {on ? <AppIcon name="check" size={18} color={colors.success} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </Sheet>

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
