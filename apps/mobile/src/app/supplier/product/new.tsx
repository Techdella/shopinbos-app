import { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { AppIcon } from "@/components/icons";
import { ChipRow } from "@/components/kit";
import { ChoiceSheet } from "@/components/partner";
import { Screen } from "@/components/Screen";
import { Card, Chip, Field, Label, LinkButton, Notice, PillButton, T, Toggle } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { parseAmount, parseCount } from "@/lib/partner-pure";
import { createSupplierProduct, fetchCategories, uploadSupplierPhoto } from "@/lib/supplier";
import { useLoad } from "@/lib/useLoad";
import { colors, radii } from "@/theme";
import { VoiceInput } from "@/components/VoiceInput";

// Add a supplier product from the phone, one question per screen: photos and what it is; wholesale price,
// suggested retail price and stock; then a description and the kind of product (the rest folded away). Saved through the portal's own
// POST /api/supplier/products as a draft or sent for review (admins publish it).

type Photo = { uri: string; mimeType?: string | null; fileName?: string | null };

// Saved as written (English); shown in the app language (m_supplier "new.ship.<index>").
const SHIPS = ["Same day", "24 hours", "48 hours", "3 days"];
const MAX_PHOTOS = 6;

export default function NewSupplierProduct() {
  const t = useT("m_supplier", "common");
  const categories = useLoad(fetchCategories);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [wholesale, setWholesale] = useState("");
  const [retail, setRetail] = useState("");
  const [moq, setMoq] = useState("1");
  const [stock, setStock] = useState("");
  const [dropship, setDropship] = useState(true);
  const [bulk, setBulk] = useState(true);
  const [regions, setRegions] = useState("Lagos");
  const [ships, setShips] = useState("24 hours");
  const [busy, setBusy] = useState<null | "draft" | "review">(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [more, setMore] = useState(false);

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

  // One question per screen (build spec 8A): what it is, the price, then the details. Each step checks its own answers.
  function check(upTo: number) {
    if (!photos.length) return { step: 0, text: t("new.needPhoto") };
    if (name.trim().length < 2) return { step: 0, text: t("new.needName") };
    if (upTo < 1) return null;
    if (!parseAmount(wholesale)) return { step: 1, text: t("new.needWholesale") };
    if (!parseAmount(retail)) return { step: 1, text: t("new.needRetail") };
    if (parseCount(stock) === null) return { step: 1, text: t("new.needStock") };
    if (upTo < 2) return null;
    if (description.trim().length < 10) return { step: 2, text: t("new.needDescription") };
    if (!categoryId) return { step: 2, text: t("new.needCategory") };
    if (!parseCount(moq) || parseCount(moq)! < 1) return { step: 2, text: t("new.needMoq") };
    if (!dropship && !bulk) return { step: 2, text: t("new.needKind") };
    return null;
  }

  function nextStep() {
    const problem = check(step);
    if (problem) {
      setStep(problem.step);
      return setError(problem.text);
    }
    setError(null);
    setStep(step + 1);
  }

  async function save(status: "draft" | "pending_review") {
    const problem = check(2);
    if (problem) {
      setStep(problem.step);
      return setError(problem.text);
    }
    setError(null);
    setBusy(status === "draft" ? "draft" : "review");
    try {
      const images: string[] = [];
      for (const [index, photo] of photos.entries()) {
        setProgress(t("new.uploading", { index: index + 1, total: photos.length }));
        images.push((await uploadSupplierPhoto(photo)).url);
      }
      setProgress(t("saving"));
      await createSupplierProduct({
        name: name.trim(),
        description: description.trim(),
        categoryId: categoryId!,
        images,
        wholesalePrice: parseAmount(wholesale)!,
        suggestedRetailPrice: parseAmount(retail)!,
        moq: parseCount(moq)!,
        stockQuantity: parseCount(stock)!,
        dropshipAvailable: dropship,
        bulkOrderAvailable: bulk,
        deliveryRegions: regions.split(",").map((item) => item.trim()).filter(Boolean),
        processingTime: ships,
        status,
      });
      Alert.alert(status === "draft" ? t("new.draftSaved") : t("new.sentForReview"), status === "draft" ? t("new.draftBody") : t("new.reviewBody"));
      router.back();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : t("product.saveFailed");
      setError(saveError instanceof ApiError && (saveError.code === "VERIFICATION_REQUIRED" || saveError.code === "ONBOARDING_REQUIRED") ? t("new.verifyFirst") : message);
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  const questions = [t("new.q0"), t("new.q1"), t("new.q2")];

  return (
    <Screen
      title={questions[step]}
      sub={t("new.step", { step: step + 1 })}
      footer={
        <View style={{ gap: 6 }}>
          {progress ? <T style={{ color: colors.inkSoft, textAlign: "center", fontSize: 15 }}>{progress}</T> : null}
          {step < 2 ? (
            <PillButton title={t("next")} onPress={nextStep} />
          ) : (
            <>
              <PillButton title={t("showToShops")} busy={busy === "review"} disabled={Boolean(busy)} onPress={() => void save("pending_review")} />
              <LinkButton title={busy === "draft" ? t("saving") : t("new.later")} color={colors.inkSoft} onPress={() => !busy && void save("draft")} />
            </>
          )}
          {step > 0 ? <LinkButton title={t("back")} color={colors.inkSoft} onPress={() => { setError(null); setStep(step - 1); }} /> : null}
        </View>
      }
    >
      {error ? <Notice>{error}</Notice> : null}

      {step === 0 ? (
        <>
          <View>
            <Label>{t("new.photos")}</Label>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {photos.map((photo, index) => (
                <View key={photo.uri}>
                  <Image source={{ uri: photo.uri }} style={{ width: 96, height: 96, borderRadius: 16 }} contentFit="cover" accessibilityLabel={t("new.photoN", { n: index + 1 })} />
                  <Pressable accessibilityRole="button" accessibilityLabel={t("new.removePhoto", { n: index + 1 })} onPress={() => setPhotos((current) => current.filter((item) => item.uri !== photo.uri))} hitSlop={6} style={{ position: "absolute", top: 6, right: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" }}>
                    <AppIcon name="x" size={14} color="#FFFFFF" strokeWidth={2.4} />
                  </Pressable>
                </View>
              ))}
              {photos.length < MAX_PHOTOS ? (
                <>
                  <Pressable accessibilityRole="button" onPress={() => void addPhotos("camera")} style={{ width: 104, height: 96, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <AppIcon name="camera" />
                    <T weight="bold" style={{ fontSize: 14 }}>{t("new.takePhoto")}</T>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => void addPhotos("library")} style={{ width: 104, height: 96, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <AppIcon name="image" />
                    <T weight="bold" style={{ fontSize: 14 }}>{t("new.fromPhotos")}</T>
                  </Pressable>
                </>
              ) : null}
            </ScrollView>
          </View>
          <View>
            <Label>{t("new.q0")}</Label>
            <Field value={name} onChangeText={setName} placeholder={t("new.namePlaceholder")} maxLength={200} accessibilityLabel={t("new.q0")} />
          </View>
        </>
      ) : null}

      {step === 1 ? (
        <>
          <View>
            <Label>{t("new.wholesale")}</Label>
            <Field value={wholesale} onChangeText={setWholesale} keyboardType="decimal-pad" placeholder="6,000" accessibilityLabel={t("new.wholesaleLabel")} />
          </View>
          <View>
            <Label>{t("new.retail")}</Label>
            <Field value={retail} onChangeText={setRetail} keyboardType="decimal-pad" placeholder="13,000" accessibilityLabel={t("suggestedRetail")} />
            <T style={{ color: colors.inkSoft, fontSize: 15, marginTop: 6, lineHeight: 21 }}>{t("new.margin")}</T>
          </View>
          <View>
            <Label>{t("new.stock")}</Label>
            <Field value={stock} onChangeText={setStock} keyboardType="number-pad" placeholder="50" accessibilityLabel={t("unitsInStock")} />
          </View>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <View>
            <Label>{t("new.describe")}</Label>
            <Field value={description} onChangeText={setDescription} placeholder={t("new.describePlaceholder")} multiline maxLength={5000} accessibilityLabel={t("new.describe")} style={{ height: 110, paddingTop: 14, textAlignVertical: "top" }} />
            <VoiceInput value={description} onChange={setDescription} maxLength={5000} context="a product description" style={{ marginTop: 8 }} />
          </View>
          <View>
            <Label>{t("new.kind")}</Label>
            <Pressable accessibilityRole="button" onPress={() => setPicking(true)} disabled={!categories.data} style={{ height: 54, borderRadius: radii.field, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <T style={{ fontSize: 16, color: category ? colors.ink : colors.inkFaint }}>{category?.name ?? (categories.error ? t("new.listFailed") : categories.data ? t("new.pickOne") : t("loading"))}</T>
              <AppIcon name="chevron" size={18} color={colors.inkSoft} />
            </Pressable>
          </View>

          {more ? (
            <Card style={{ gap: 14 }}>
              <View>
                <Label>{t("new.moq")}</Label>
                <Field value={moq} onChangeText={setMoq} keyboardType="number-pad" accessibilityLabel={t("moqLabel")} />
              </View>
              <View>
                <Label>{t("new.shipsWithin")}</Label>
                <ChipRow>{SHIPS.map((item, index) => <Chip key={item} label={t.dynamic(`new.ship.${index}`, item)} on={ships === item} onPress={() => setShips(item)} />)}</ChipRow>
              </View>
              <View>
                <Label>{t("new.regions")}</Label>
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
            </Card>
          ) : (
            <LinkButton title={t("new.more")} color={colors.inkSoft} onPress={() => setMore(true)} />
          )}
        </>
      ) : null}

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
