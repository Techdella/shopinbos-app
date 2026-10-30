import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { AppIcon } from "@/components/icons";
import { ChipRow, ErrorState, LoadingBlock } from "@/components/kit";
import { BoardScreen, Screen } from "@/components/Screen";
import { FieldLabel } from "@/components/SupplierKit";
import { ChannelPrices, DropshipSettings, LockedPreorderCard, useWords } from "@/components/supplier/DropshipKit";
import { PreorderEditor } from "@/components/Preorder";
import { Chip, Field, LinkButton, Notice, PillButton, T, Toggle, WithTip } from "@/components/ui";
import { VoiceInput } from "@/components/VoiceInput";
import { dropshipBody, dropshipFormFrom, pricesFormFrom, readPricesForm, type DropshipForm, type PricesForm } from "@/lib/dropship-pure";
import { useT } from "@/lib/i18n";
import { parseCount } from "@/lib/partner-pure";
import { PREORDER_PROBLEM_KEY, preorderFormFrom, preorderPatch, savedFromColumns, type PreorderForm } from "@/lib/preorder-pure";
import { editSupplierProduct, fetchSupplierLevel, fetchSupplierProduct, uploadSupplierPhoto, type ProductEdit } from "@/lib/supplier";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// Edit a supplier product in the app (the web's /supplier/products/[id]/edit): photos, name, description, the prices
// per channel, minimum order, shipping time, regions, dropship / wholesale and the dropship settings. Saved through
// the portal's own PATCH /api/supplier/products/[id]; a live product goes back for review when what shops see changes.
// Two parts open on their own (Supplier & Dropship Rules, shared/dropship-rules.ts):
//   ?focus=tiers (or prices)  "Prices" (P-Pricing): same price for all or per channel, dropship price, wholesale price
//                             and quantity breaks, pre-order price (locked with a meter below Established), what
//                             sellers charge; "Save prices" (Account › Wholesale price tiers, a product's Prices)
//   ?focus=dropship           "Dropship settings" (P-Dropship): single pieces or a minimum, packing days, parcel
//                             size, samples
// The server checks the prices together (400 invalid_prices) and pre-orders open at Established (403
// preorder_locked); its words show above the form. Preorders (shared/preorder.ts, like the web form): take them,
// ships from, most on preorder and the promise to shops; sent as `preorder` only when changed (no new review).

const SHIPS = ["Same day", "24 hours", "48 hours", "3 days"];
const MAX_PHOTOS = 6;

type Photo = { uri: string; mimeType?: string | null; fileName?: string | null; uploaded?: boolean };

export default function EditSupplierProduct() {
  const { id, focus } = useLocalSearchParams<{ id: string; focus?: string }>();
  const t = useT("m_supplier", "common", "m_ui");
  const words = useWords();
  const product = useLoad(() => fetchSupplierProduct(String(id)), String(id));
  const level = useLoad(() => fetchSupplierLevel().catch(() => null));
  const data = product.data;
  const part: "prices" | "dropship" | null = focus === "tiers" || focus === "prices" ? "prices" : focus === "dropship" ? "dropship" : null;
  const preorderOpen = level.data?.perks.preorders === true;
  const [filled, setFilled] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prices, setPrices] = useState<PricesForm>(() => pricesFormFrom(null));
  const [shipping, setShipping] = useState<DropshipForm>(() => dropshipFormFrom(null));
  const [moq, setMoq] = useState("1");
  const [stock, setStock] = useState("");
  const [ships, setShips] = useState("");
  const [regions, setRegions] = useState("");
  const [dropship, setDropship] = useState(false);
  const [bulk, setBulk] = useState(true);
  const [preorder, setPreorder] = useState<PreorderForm>(() => preorderFormFrom(null));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!data || filled) return;
    setFilled(true);
    setPhotos(data.images.map((uri) => ({ uri, uploaded: true })));
    setName(data.name);
    setDescription(data.description ?? "");
    setPrices(pricesFormFrom(data));
    setShipping(dropshipFormFrom(data));
    setMoq(String(data.moq || 1));
    setStock(String(data.stockQuantity ?? 0));
    const extra = data as { processingTime?: string | null; deliveryRegions?: string[] };
    setShips(extra.processingTime ?? "");
    setRegions((extra.deliveryRegions ?? []).join(", "));
    setDropship(data.dropshipAvailable);
    setBulk(data.bulkOrderAvailable ?? true);
    setPreorder(preorderFormFrom(savedFromColumns(data)));
  }, [data, filled]);

  async function addPhotos() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert(t("new.photosOff"), t("new.allowAccess"));
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: MAX_PHOTOS - photos.length, quality: 0.7 });
    if (result.canceled) return;
    setPhotos((current) => [...current, ...result.assets.map((asset) => ({ uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName }))].slice(0, MAX_PHOTOS));
  }

  async function save() {
    if (!data) return;
    const read = part === "dropship" ? null : readPricesForm(prices, preorderOpen, words);
    if (read && !read.ok) return setError(read.message);
    const channel = read?.ok ? read.body : null;
    const priced = channel?.pricingTiers ?? [];
    if (!part) {
      if (!photos.length) return setError(t("new.needPhoto"));
      if (name.trim().length < 2) return setError(t("new.needName"));
      if (description.trim().length < 10) return setError(t("new.needDescription"));
      if (!parseCount(moq) || parseCount(moq)! < 1) return setError(t("new.needMoq"));
      if (!stock.trim() || parseCount(stock) === null) return setError(t("new.needStock"));
      if (!dropship && !bulk) return setError(t("new.needKind"));
    }
    // Preorders: only from servers that send them, and only when changed.
    const preorderResult = !part && data.preorderEnabled !== undefined ? preorderPatch(preorder, savedFromColumns(data)) : ({ ok: true, patch: null } as const);
    if (!preorderResult.ok) return setError(t.dynamic(PREORDER_PROBLEM_KEY[preorderResult.problem]));
    setError(null);
    setBusy("save");
    try {
      const images: string[] = [];
      if (!part) {
        for (const [index, photo] of photos.entries()) {
          if (photo.uploaded) images.push(photo.uri);
          else {
            setBusy(t("new.uploading", { index: index + 1, total: photos.length }));
            images.push((await uploadSupplierPhoto(photo)).url);
          }
        }
      }
      setBusy("save");
      const patch: ProductEdit =
        part === "dropship"
          ? dropshipBody(shipping)
          : part === "prices"
            ? { ...channel!, pricingTiers: priced }
            : {
                name: name.trim(),
                description: description.trim(),
                images,
                moq: parseCount(moq)!,
                stockQuantity: parseCount(stock)!,
                ...(ships ? { processingTime: ships } : {}),
                deliveryRegions: regions.split(",").map((item) => item.trim()).filter(Boolean),
                dropshipAvailable: dropship,
                bulkOrderAvailable: bulk,
                ...channel!,
                pricingTiers: priced,
                ...(dropship ? dropshipBody(shipping) : {}),
                ...(preorderResult.patch ? { preorder: preorderResult.patch } : {}),
              };
      const saved = await editSupplierProduct(data.id, patch);
      Alert.alert(saved.status === "pending_review" && data.status === "published" ? t("product.savedReview") : t("product.saved"));
      router.back();
    } catch (saveError) {
      // The server's own words: invalid_prices, preorder_locked (pre-orders open at Established), …
      setError(saveError instanceof Error ? saveError.message : t("product.saveFailed"));
    } finally {
      setBusy(null);
    }
  }

  const title = part === "prices" ? words("prices.title", "Prices") : part === "dropship" ? words("ds.title", "Dropship settings") : t("edit.title");

  if (!data) {
    const Frame = part ? BoardScreen : Screen;
    return (
      <Frame title={title}>
        {product.loading ? <LoadingBlock /> : null}
        {product.error ? <ErrorState message={product.error} onRetry={() => void product.reload()} /> : null}
      </Frame>
    );
  }

  const cta = part === "prices" ? words("prices.save", "Save prices") : part === "dropship" ? t("save") : t("product.save");
  // A listing already taking pre-orders stays editable (and can be switched off); otherwise they open at Established.
  const preorderEditable = data.preorderEnabled !== undefined && (preorderOpen || data.preorderEnabled === true);
  const footer = (
    <>
      {busy && busy !== "save" ? <T style={{ color: colors.inkSoft, textAlign: "center", fontSize: 15 }}>{busy}</T> : null}
      <PillButton title={cta} tone="accent" busy={Boolean(busy)} onPress={() => void save()} />
    </>
  );

  // Prices (P-Pricing) and Dropship settings (P-Dropship) are drawn like their boards: the product's name under the title.
  if (part) {
    return (
      <BoardScreen title={title} sub={part === "prices" ? data.name : words("ds.sub", "Sellers see these before they add your product")} footer={footer}>
        {error ? <Notice>{error}</Notice> : null}
        {part === "prices" ? <ChannelPrices value={prices} onChange={setPrices} level={level.data ?? null} /> : <DropshipSettings value={shipping} onChange={setShipping} />}
        <LinkButton title={t("edit.everything")} color={colors.inkSoft} onPress={() => router.setParams({ focus: "" })} />
      </BoardScreen>
    );
  }

  return (
    <Screen title={title} footer={footer}>
      {error ? <Notice>{error}</Notice> : null}
      {(
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {photos.map((photo, index) => (
              <View key={photo.uri}>
                <Image source={{ uri: photo.uri }} style={{ width: 88, height: 88, borderRadius: 16, backgroundColor: colors.grayTint }} contentFit="cover" accessibilityLabel={t("new.photoN", { n: index + 1 })} />
                <Pressable accessibilityRole="button" accessibilityLabel={t("new.removePhoto", { n: index + 1 })} onPress={() => setPhotos((current) => current.filter((item) => item.uri !== photo.uri))} hitSlop={6} style={{ position: "absolute", top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" }}>
                  <AppIcon name="x" size={13} color="#FFFFFF" strokeWidth={2.4} />
                </Pressable>
              </View>
            ))}
            {photos.length < MAX_PHOTOS ? (
              <Pressable accessibilityRole="button" accessibilityLabel={t("new.fromGallery")} onPress={() => void addPhotos()} style={{ width: 88, height: 88, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" }}>
                <AppIcon name="image" />
              </Pressable>
            ) : null}
          </ScrollView>

          <View>
            <FieldLabel>{t("new.name")}</FieldLabel>
            <Field value={name} onChangeText={setName} maxLength={200} accessibilityLabel={t("new.name")} />
          </View>
          <View>
            <FieldLabel>{t("new.describe")}</FieldLabel>
            <Field value={description} onChangeText={setDescription} multiline maxLength={5000} accessibilityLabel={t("new.describe")} style={{ height: 120, paddingTop: 14, textAlignVertical: "top" }} />
            <VoiceInput value={description} onChange={setDescription} maxLength={5000} context="a product description" style={{ marginTop: 8 }} />
          </View>

          <View>
            <FieldLabel>{words("prices.title", "Prices")}</FieldLabel>
            <ChannelPrices value={prices} onChange={setPrices} level={level.data ?? null} showPreorder={preorderOpen} />
          </View>

          <View>
            <FieldLabel>{t("new.moq")}</FieldLabel>
            <Field value={moq} onChangeText={setMoq} keyboardType="number-pad" accessibilityLabel={t("moqLabel")} />
          </View>
          {/* Stock: the number in stock now (it was missing here, so a product saved with 0 stayed at 0). */}
          <View>
            <FieldLabel>{t("new.howMany")}</FieldLabel>
            <Field value={stock} onChangeText={setStock} keyboardType="number-pad" accessibilityLabel={t("new.howMany")} />
          </View>
          <View>
            <FieldLabel>{t("new.shipsWithin")}</FieldLabel>
            <ChipRow>{SHIPS.map((item, index) => <Chip key={item} label={t.dynamic(`new.ship.${index}`, item)} on={ships === item} onPress={() => setShips(item)} />)}</ChipRow>
          </View>
          <View>
            <FieldLabel>{t("new.regions")}</FieldLabel>
            <Field value={regions} onChangeText={setRegions} placeholder="Lagos, Abuja, Ibadan" accessibilityLabel={t("new.regions")} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <WithTip title={t("kind.dropship")} tip={{ text: t("new.dropshipHint") }}>
                <T weight="bold" style={{ fontSize: 15 }}>{t("kind.dropship")}</T>
              </WithTip>
            </View>
            <Toggle on={dropship} onChange={setDropship} label={t("kind.dropship")} />
          </View>
          {dropship ? (
            <View>
              <FieldLabel>{words("ds.title", "Dropship settings")}</FieldLabel>
              <DropshipSettings value={shipping} onChange={setShipping} />
            </View>
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <T weight="bold" style={{ fontSize: 15 }}>{t("kind.wholesale")}</T>
              <T style={{ color: colors.inkSoft, fontSize: 14.5 }}>{t("new.wholesaleHint")}</T>
            </View>
            <Toggle on={bulk} onChange={setBulk} label={t("kind.wholesale")} />
          </View>
          {preorderEditable ? (
            <PreorderEditor value={preorder} onChange={setPreorder} audience="shops" taken={data.preorderEnabled ? data.preorderTaken : null} />
          ) : level.data ? (
            <LockedPreorderCard level={level.data} />
          ) : null}
        </>
      )}
    </Screen>
  );
}
