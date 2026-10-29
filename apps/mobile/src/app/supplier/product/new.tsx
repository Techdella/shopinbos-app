import { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Heading, Sub } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { ChipRow } from "@/components/kit";
import { ChoiceSheet } from "@/components/partner";
import { Screen } from "@/components/Screen";
import { PreorderEditor } from "@/components/Preorder";
import { DoneView, FieldLabel } from "@/components/SupplierKit";
import { ChannelPrices, DropshipSettings, useWords } from "@/components/supplier/DropshipKit";
import { Chip, Field, LinkButton, Notice, PillButton, T, Toggle, WithTip } from "@/components/ui";
import { VoiceInput } from "@/components/VoiceInput";
import { ApiError } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { parseCount } from "@/lib/partner-pure";
import { dropshipBody, dropshipFormFrom, pricesFormFrom, readPricesForm, type DropshipForm, type PricesForm } from "@/lib/dropship-pure";
import { PREORDER_PROBLEM_KEY, preorderFormFrom, preorderPatch, type PreorderForm } from "@/lib/preorder-pure";
import { savedAs } from "@/lib/supplier-pure";
import { createSupplierProduct, fetchCategories, fetchSupplierLevel, uploadSupplierPhoto } from "@/lib/supplier";
import { useLoad } from "@/lib/useLoad";
import { colors, radii } from "@/theme";

// Add a product ("Simple app, end to end" supplier prototype), on one screen: first "Take a photo of it", then the
// photo, the name, the price for one (dropship), the wholesale price for 20 or more (a price tier), and how many you
// have. The rest the marketplace needs (suggested retail price, a description and the kind of product) sits below,
// with MOQ, shipping time, regions and dropship / wholesale folded away. Saved through the portal's own POST
// /api/supplier/products: "Save" sends it for review (admins publish it), "Save for later" keeps a draft.
// Under "More": take preorders (stock not here yet: ships from a date, a cap and the promise to shops; shared/preorder.ts).
// Supplier & Dropship Rules (shared/dropship-rules.ts): the prices are P-Pricing (same price for all, or a dropship
// price, wholesale price and quantity breaks, a pre-order price locked below Established, then what sellers charge)
// and the dropship settings P-Dropship (single pieces or a minimum, packing days, parcel size, samples). Pre-orders
// can be switched on only at Established; the server refuses below it (403 preorder_locked) and checks the prices
// together (400 invalid_prices); its words show above the form.

type Photo = { uri: string; mimeType?: string | null; fileName?: string | null };

// Saved as written (English); shown in the app language (m_supplier "new.ship.<index>").
const SHIPS = ["Same day", "24 hours", "48 hours", "3 days"];
const MAX_PHOTOS = 6;

export default function NewSupplierProduct() {
  const t = useT("m_supplier", "common", "m_ui");
  const words = useWords();
  const categories = useLoad(fetchCategories);
  // Pre-orders and the pre-order price open at Established; the locked card shows how far there is to go.
  const level = useLoad(() => fetchSupplierLevel().catch(() => null));
  const preorderOpen = level.data?.perks.preorders === true;
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [prices, setPrices] = useState<PricesForm>(() => pricesFormFrom(null));
  const [shipping, setShipping] = useState<DropshipForm>(() => dropshipFormFrom(null));
  const [moq, setMoq] = useState("1");
  const [stock, setStock] = useState("");
  const [dropship, setDropship] = useState(true);
  const [bulk, setBulk] = useState(true);
  const [regions, setRegions] = useState("Lagos");
  const [ships, setShips] = useState("24 hours");
  const [busy, setBusy] = useState<null | "draft" | "review">(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [preorder, setPreorder] = useState<PreorderForm>(() => ({ ...preorderFormFrom(null), depositPct: 0 }));
  // "unverified": asked to show it to shops, but the business isn't verified yet, so the server kept it as a draft.
  const [saved, setSaved] = useState<null | "draft" | "pending_review" | "unverified">(null);

  const category = categories.data?.find((item) => item.id === categoryId);

  async function addPhotos(source: "camera" | "library") {
    const permission = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(source === "camera" ? t("new.cameraOff") : t("new.photosOff"), t("new.allowAccess"));
      return;
    }
    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: MAX_PHOTOS - photos.length, quality: 0.7 });
    if (result.canceled) return;
    setPhotos((current) => [...current, ...result.assets.map((asset) => ({ uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName }))].slice(0, MAX_PHOTOS));
  }

  function problem() {
    if (!photos.length) return t("new.needPhoto");
    if (name.trim().length < 2) return t("new.needName");
    const priced = readPricesForm(prices, preorderOpen, words);
    if (!priced.ok) return priced.message;
    if (parseCount(stock) === null) return t("new.needStock");
    if (description.trim().length < 10) return t("new.needDescription");
    if (!categoryId) return t("new.needCategory");
    if (!parseCount(moq) || parseCount(moq)! < 1) return t("new.needMoq");
    if (!dropship && !bulk) return t("new.needKind");
    const preorderResult = preorderPatch(preorder, null);
    if (!preorderResult.ok) return t.dynamic(PREORDER_PROBLEM_KEY[preorderResult.problem]);
    return null;
  }

  async function save(status: "draft" | "pending_review") {
    const wrong = problem();
    if (wrong) return setError(wrong);
    setError(null);
    setBusy(status === "draft" ? "draft" : "review");
    try {
      const images: string[] = [];
      for (const [index, photo] of photos.entries()) {
        setProgress(t("new.uploading", { index: index + 1, total: photos.length }));
        images.push((await uploadSupplierPhoto(photo)).url);
      }
      setProgress(t("saving"));
      const priced = readPricesForm(prices, preorderOpen, words);
      if (!priced.ok) throw new Error(priced.message);
      const preorderResult = preorderPatch(preorder, null);
      const created = await createSupplierProduct({
        name: name.trim(),
        description: description.trim(),
        categoryId: categoryId!,
        images,
        ...priced.body,
        ...(dropship ? dropshipBody(shipping) : {}),
        moq: parseCount(moq)!,
        stockQuantity: parseCount(stock)!,
        dropshipAvailable: dropship,
        bulkOrderAvailable: bulk,
        deliveryRegions: regions.split(",").map((item) => item.trim()).filter(Boolean),
        processingTime: ships,
        ...(preorderOpen && preorderResult.ok && preorderResult.patch?.enabled ? { preorder: preorderResult.patch } : {}),
        status,
      });
      setSaved(savedAs(status, created?.status));
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : t("product.saveFailed");
      setError(saveError instanceof ApiError && (saveError.code === "VERIFICATION_REQUIRED" || saveError.code === "ONBOARDING_REQUIRED") ? t("new.verifyFirst") : message);
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  if (saved === "unverified") {
    return (
      <DoneView
        title={t("new.savedUnverified")}
        sub={t("new.savedUnverifiedSub")}
        footer={
          <>
            <PillButton title={t("new.getVerified")} tone="accent" onPress={() => router.replace("/supplier/verification")} />
            <PillButton title={t("done")} tone="white" onPress={() => router.replace("/supplier/products")} />
          </>
        }
      />
    );
  }

  if (saved) {
    return (
      <DoneView
        title={saved === "draft" ? t("new.draftSaved") : t("new.sentForReview")}
        sub={saved === "draft" ? t("new.draftBody") : t("new.reviewBody")}
        footer={<PillButton title={t("done")} onPress={() => router.replace("/supplier/products")} />}
      />
    );
  }

  if (!photos.length) {
    return (
      <Screen
        title={t("products.add")}
        footer={
          <>
            <PillButton tone="accent" onPress={() => void addPhotos("camera")} accessibilityLabel={t("new.takePhoto")} icon="camera" title={t("new.takePhoto")} />
            <PillButton title={t("new.fromGallery")} tone="white" onPress={() => void addPhotos("library")} />
          </>
        }
      >
        <View style={{ alignItems: "center", gap: 16, paddingTop: 40 }}>
          <View style={{ width: 120, height: 120, borderRadius: 36, backgroundColor: colors.peach, alignItems: "center", justifyContent: "center" }}>
            <AppIcon name="camera" size={56} color={colors.accentInk} />
          </View>
          <Heading style={{ textAlign: "center" }}>{t("new.photoTitle")}</Heading>
          <Sub style={{ textAlign: "center" }}>{t("new.photoSub")}</Sub>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      title={t("products.add")}
      footer={
        <>
          {progress ? <T style={{ color: colors.inkSoft, textAlign: "center", fontSize: 15 }}>{progress}</T> : null}
          <PillButton tone="accent" busy={busy === "review"} disabled={Boolean(busy)} onPress={() => void save("pending_review")} accessibilityLabel={t("new.save")} icon="check" title={t("new.save")} />
          <LinkButton title={busy === "draft" ? t("saving") : t("new.later")} color={colors.inkSoft} onPress={() => !busy && void save("draft")} />
        </>
      }
    >
      {error ? <Notice>{error}</Notice> : null}

      <Image source={{ uri: photos[0].uri }} style={{ width: "100%", height: 200, borderRadius: 24 }} contentFit="cover" accessibilityLabel={t("new.yourPhoto")} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {photos.map((photo, index) => (
          <View key={photo.uri}>
            <Image source={{ uri: photo.uri }} style={{ width: 72, height: 72, borderRadius: 16 }} contentFit="cover" accessibilityLabel={t("new.photoN", { n: index + 1 })} />
            <Pressable accessibilityRole="button" accessibilityLabel={t("new.removePhoto", { n: index + 1 })} onPress={() => setPhotos((current) => current.filter((item) => item.uri !== photo.uri))} hitSlop={6} style={{ position: "absolute", top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" }}>
              <AppIcon name="x" size={13} color="#FFFFFF" strokeWidth={2.4} />
            </Pressable>
          </View>
        ))}
        {photos.length < MAX_PHOTOS ? (
          <>
            <Pressable accessibilityRole="button" accessibilityLabel={t("new.takePhoto")} onPress={() => void addPhotos("camera")} style={{ width: 72, height: 72, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" }}>
              <AppIcon name="camera" />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={t("new.fromGallery")} onPress={() => void addPhotos("library")} style={{ width: 72, height: 72, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" }}>
              <AppIcon name="image" />
            </Pressable>
          </>
        ) : null}
      </ScrollView>

      <View>
        <FieldLabel>{t("new.name")}</FieldLabel>
        <Field value={name} onChangeText={setName} placeholder={t("new.namePlaceholder")} maxLength={200} accessibilityLabel={t("new.name")} />
      </View>
      <View>
        <FieldLabel>{words("prices.title", "Prices")}</FieldLabel>
        <ChannelPrices value={prices} onChange={setPrices} level={level.data ?? null} />
      </View>
      <View>
        <FieldLabel>{t("new.howMany")}</FieldLabel>
        <Field value={stock} onChangeText={setStock} keyboardType="number-pad" placeholder="80" accessibilityLabel={t("unitsInStock")} />
      </View>
      {dropship ? (
        <View>
          <FieldLabel>{words("ds.title", "Dropship settings")}</FieldLabel>
          <T style={{ color: colors.inkSoft, fontSize: 14, marginBottom: 8, lineHeight: 20 }}>{words("ds.sub", "Sellers see these before they add your product")}</T>
          <DropshipSettings value={shipping} onChange={setShipping} />
        </View>
      ) : null}
      <View>
        <FieldLabel>{t("new.describe")}</FieldLabel>
        <Field value={description} onChangeText={setDescription} placeholder={t("new.describePlaceholder")} multiline maxLength={5000} accessibilityLabel={t("new.describe")} style={{ height: 110, paddingTop: 14, textAlignVertical: "top" }} />
        <VoiceInput value={description} onChange={setDescription} maxLength={5000} context="a product description" style={{ marginTop: 8 }} />
      </View>
      <View>
        <FieldLabel>{t("new.kind")}</FieldLabel>
        <Pressable accessibilityRole="button" onPress={() => setPicking(true)} disabled={!categories.data} style={{ height: 54, borderRadius: radii.field, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <T style={{ fontSize: 16, color: category ? colors.ink : colors.inkFaint }}>{category?.name ?? (categories.error ? t("new.listFailed") : categories.data ? t("new.pickOne") : t("loading"))}</T>
          <AppIcon name="chevron" size={18} color={colors.inkSoft} />
        </Pressable>
      </View>

      {more ? (
        <View style={{ gap: 14 }}>
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
              <WithTip title={t("kind.dropship")} tip={{ text: t("new.dropshipHint") }}>
                <T weight="bold" style={{ fontSize: 15 }}>{t("kind.dropship")}</T>
              </WithTip>
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
          {preorderOpen ? <PreorderEditor value={preorder} onChange={setPreorder} audience="shops" /> : null}
        </View>
      ) : (
        <LinkButton title={t("new.more")} color={colors.inkSoft} onPress={() => setMore(true)} />
      )}

      <ChoiceSheet
        visible={picking}
        title={t("new.kind")}
        options={(categories.data ?? []).map((item) => ({ value: item.id, label: item.name }))}
        onPick={(value) => {
          setCategoryId(value);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </Screen>
  );
}
