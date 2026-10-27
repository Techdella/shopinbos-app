import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { naira } from "@shared/onboarding";
import { Heading } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { ChipRow, ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { FieldLabel } from "@/components/SupplierKit";
import { PreorderEditor } from "@/components/Preorder";
import { Chip, Field, LinkButton, Notice, PillButton, T, Toggle } from "@/components/ui";
import { VoiceInput } from "@/components/VoiceInput";
import { useT } from "@/lib/i18n";
import { parseAmount, parseCount } from "@/lib/partner-pure";
import { PREORDER_PROBLEM_KEY, preorderFormFrom, preorderPatch, savedFromColumns, type PreorderForm } from "@/lib/preorder-pure";
import { editSupplierProduct, fetchSupplierProduct, uploadSupplierPhoto, type PriceTier } from "@/lib/supplier";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// Edit a supplier product in the app (the web's /supplier/products/[id]/edit): photos, name, description, the
// wholesale price tiers (cheaper per piece for bigger orders), minimum order, shipping time, regions, and dropship /
// wholesale. Saved through the portal's own PATCH /api/supplier/products/[id]; a live product goes back for review
// when what shops see changes. ?focus=tiers opens with the price tiers first (Account › Wholesale price tiers).
// Preorders (shared/preorder.ts, like the web form): take them, ships from, most on preorder and the promise to shops;
// sent as `preorder` only when changed (no new review).

const SHIPS = ["Same day", "24 hours", "48 hours", "3 days"];
const MAX_PHOTOS = 6;
const MAX_TIERS = 5;

type Photo = { uri: string; mimeType?: string | null; fileName?: string | null; uploaded?: boolean };
type TierDraft = { minQty: string; price: string };

export default function EditSupplierProduct() {
  const { id, focus } = useLocalSearchParams<{ id: string; focus?: string }>();
  const t = useT("m_supplier", "common", "m_ui");
  const product = useLoad(() => fetchSupplierProduct(String(id)), String(id));
  const data = product.data;
  const tiersOnly = focus === "tiers";
  const [filled, setFilled] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tiers, setTiers] = useState<TierDraft[]>([]);
  const [moq, setMoq] = useState("1");
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
    setTiers((data.pricingTiers ?? []).map((tier) => ({ minQty: String(tier.minQty), price: String(tier.price) })));
    setMoq(String(data.moq || 1));
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

  function readTiers(): PriceTier[] | string {
    const out: PriceTier[] = [];
    for (const tier of tiers) {
      if (!tier.minQty.trim() && !tier.price.trim()) continue;
      const minQty = parseCount(tier.minQty);
      const price = parseAmount(tier.price);
      if (!minQty || minQty < 1 || !price) return t("edit.badTier");
      out.push({ minQty, price });
    }
    return out.sort((a, b) => a.minQty - b.minQty);
  }

  async function save() {
    if (!data) return;
    const priced = readTiers();
    if (typeof priced === "string") return setError(priced);
    if (!tiersOnly) {
      if (!photos.length) return setError(t("new.needPhoto"));
      if (name.trim().length < 2) return setError(t("new.needName"));
      if (description.trim().length < 10) return setError(t("new.needDescription"));
      if (!parseCount(moq) || parseCount(moq)! < 1) return setError(t("new.needMoq"));
      if (!dropship && !bulk) return setError(t("new.needKind"));
    }
    // Preorders: only from servers that send them, and only when changed.
    const preorderResult = !tiersOnly && data.preorderEnabled !== undefined ? preorderPatch(preorder, savedFromColumns(data)) : ({ ok: true, patch: null } as const);
    if (!preorderResult.ok) return setError(t.dynamic(PREORDER_PROBLEM_KEY[preorderResult.problem]));
    setError(null);
    setBusy("save");
    try {
      const images: string[] = [];
      if (!tiersOnly) {
        for (const [index, photo] of photos.entries()) {
          if (photo.uploaded) images.push(photo.uri);
          else {
            setBusy(t("new.uploading", { index: index + 1, total: photos.length }));
            images.push((await uploadSupplierPhoto(photo)).url);
          }
        }
      }
      setBusy("save");
      const saved = await editSupplierProduct(
        data.id,
        tiersOnly
          ? { pricingTiers: priced }
          : {
              name: name.trim(),
              description: description.trim(),
              images,
              moq: parseCount(moq)!,
              ...(ships ? { processingTime: ships } : {}),
              deliveryRegions: regions.split(",").map((item) => item.trim()).filter(Boolean),
              dropshipAvailable: dropship,
              bulkOrderAvailable: bulk,
              pricingTiers: priced,
              ...(preorderResult.patch ? { preorder: preorderResult.patch } : {}),
            },
      );
      Alert.alert(saved.status === "pending_review" && data.status === "published" ? t("product.savedReview") : t("product.saved"));
      router.back();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("product.saveFailed"));
    } finally {
      setBusy(null);
    }
  }

  if (!data) {
    return (
      <Screen title={t("edit.title")}>
        {product.loading ? <LoadingBlock /> : null}
        {product.error ? <ErrorState message={product.error} onRetry={() => void product.reload()} /> : null}
      </Screen>
    );
  }

  const tierEditor = (
    <View style={{ gap: 10 }}>
      <View>
        <FieldLabel>{t("money.tiers")}</FieldLabel>
        <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("edit.tiersHint", { price: naira(data.wholesalePrice) })}</T>
      </View>
      {tiers.map((tier, index) => (
        <View key={index} style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <T style={{ fontSize: 13, color: colors.inkSoft, marginBottom: 4 }}>{t("edit.fromQty")}</T>
            <Field value={tier.minQty} onChangeText={(value) => setTiers((all) => all.map((item, at) => (at === index ? { ...item, minQty: value } : item)))} keyboardType="number-pad" placeholder="20" accessibilityLabel={t("edit.fromQty")} />
          </View>
          <View style={{ flex: 1.3 }}>
            <T style={{ fontSize: 13, color: colors.inkSoft, marginBottom: 4 }}>{t("edit.pricePer")}</T>
            <Field value={tier.price} onChangeText={(value) => setTiers((all) => all.map((item, at) => (at === index ? { ...item, price: value } : item)))} keyboardType="decimal-pad" placeholder="10,500" accessibilityLabel={t("edit.pricePer")} />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t("edit.removeTier")} hitSlop={6} onPress={() => setTiers((all) => all.filter((_, at) => at !== index))} style={{ width: 44, height: 54, alignItems: "center", justifyContent: "center" }}>
            <AppIcon name="x" size={18} color={colors.inkSoft} />
          </Pressable>
        </View>
      ))}
      {tiers.length < MAX_TIERS ? <PillButton title={t("edit.addTier")} tone="white" size="md" onPress={() => setTiers((all) => [...all, { minQty: "", price: "" }])} /> : null}
    </View>
  );

  return (
    <Screen
      title={tiersOnly ? t("money.tiers") : t("edit.title")}
      footer={
        <>
          {busy && busy !== "save" ? <T style={{ color: colors.inkSoft, textAlign: "center", fontSize: 15 }}>{busy}</T> : null}
          <PillButton title={t("product.save")} tone="accent" busy={Boolean(busy)} onPress={() => void save()} />
        </>
      }
    >
      {error ? <Notice>{error}</Notice> : null}
      {tiersOnly ? (
        <>
          <Heading>{data.name}</Heading>
          {tierEditor}
          <LinkButton title={t("edit.everything")} color={colors.inkSoft} onPress={() => router.setParams({ focus: "" })} />
        </>
      ) : (
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

          {tierEditor}

          <View>
            <FieldLabel>{t("new.moq")}</FieldLabel>
            <Field value={moq} onChangeText={setMoq} keyboardType="number-pad" accessibilityLabel={t("moqLabel")} />
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
              <T weight="bold" style={{ fontSize: 15 }}>{t("kind.dropship")}</T>
              <T style={{ color: colors.inkSoft, fontSize: 14.5 }}>{t("new.dropshipHint")}</T>
            </View>
            <Toggle on={dropship} onChange={setDropship} label={t("kind.dropship")} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <T weight="bold" style={{ fontSize: 15 }}>{t("kind.wholesale")}</T>
              <T style={{ color: colors.inkSoft, fontSize: 14.5 }}>{t("new.wholesaleHint")}</T>
            </View>
            <Toggle on={bulk} onChange={setBulk} label={t("kind.wholesale")} />
          </View>
          {data.preorderEnabled !== undefined ? <PreorderEditor value={preorder} onChange={setPreorder} audience="shops" taken={data.preorderEnabled ? data.preorderTaken : null} /> : null}
        </>
      )}
    </Screen>
  );
}
