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
import { parseAmount, parseCount } from "@/lib/partner-pure";
import { createSupplierProduct, fetchCategories, uploadSupplierPhoto } from "@/lib/supplier";
import { useLoad } from "@/lib/useLoad";
import { colors, radii } from "@/theme";

// Add a supplier product from the phone, one question per screen: photos and what it is; your price to shops,
// what shops sell it for and how many you have; then a description and the kind of product (the rest folded away). Saved through the portal's own
// POST /api/supplier/products as a draft or sent for review (admins publish it).

type Photo = { uri: string; mimeType?: string | null; fileName?: string | null };

const SHIPS = ["Same day", "24 hours", "48 hours", "3 days"];
const MAX_PHOTOS = 6;

export default function NewSupplierProduct() {
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
      Alert.alert(source === "camera" ? "Camera is off" : "Photos are off", "Allow access in your phone's settings to add product photos.");
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
    if (!photos.length) return { step: 0, text: "Add at least one photo, so shops can see it." };
    if (name.trim().length < 2) return { step: 0, text: "Type what it is, like \"Leather slides\"." };
    if (upTo < 1) return null;
    if (!parseAmount(wholesale)) return { step: 1, text: "Type your price to shops for one, in naira, like 6000." };
    if (!parseAmount(retail)) return { step: 1, text: "Type what shops sell it for, in naira, like 13000." };
    if (parseCount(stock) === null) return { step: 1, text: "Type how many you have, like 50." };
    if (upTo < 2) return null;
    if (description.trim().length < 10) return { step: 2, text: "Describe it in a sentence: what it's made of, sizes or colours." };
    if (!categoryId) return { step: 2, text: "Pick what kind of product it is." };
    if (!parseCount(moq) || parseCount(moq)! < 1) return { step: 2, text: "The smallest order should be 1 or more." };
    if (!dropship && !bulk) return { step: 2, text: "Pick at least one way shops can buy it." };
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
        setProgress(`Uploading photo ${index + 1} of ${photos.length}…`);
        images.push((await uploadSupplierPhoto(photo)).url);
      }
      setProgress("Saving…");
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
      Alert.alert(status === "draft" ? "Saved for later" : "Shops can see it soon", status === "draft" ? "Open it from My products and tap \"Show it to shops\" when you're ready." : "We check it first, usually within a day. We'll tell you when a shop adds it.");
      router.back();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "That didn't save. Check your connection and try again.";
      setError(saveError instanceof ApiError && (saveError.code === "VERIFICATION_REQUIRED" || saveError.code === "ONBOARDING_REQUIRED") ? "You can add products once we've checked your business. Open Money → Checks on your business." : message);
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  const questions = ["What is it?", "Your price", "A few details"];

  return (
    <Screen
      title={questions[step]}
      sub={`Step ${step + 1} of 3`}
      footer={
        <View style={{ gap: 6 }}>
          {progress ? <T style={{ color: colors.inkSoft, textAlign: "center", fontSize: 15 }}>{progress}</T> : null}
          {step < 2 ? (
            <PillButton title="Next" onPress={nextStep} />
          ) : (
            <>
              <PillButton title="Show it to shops" busy={busy === "review"} disabled={Boolean(busy)} onPress={() => void save("pending_review")} />
              <LinkButton title={busy === "draft" ? "Saving…" : "Save for later"} color={colors.inkSoft} onPress={() => !busy && void save("draft")} />
            </>
          )}
          {step > 0 ? <LinkButton title="Back" color={colors.inkSoft} onPress={() => { setError(null); setStep(step - 1); }} /> : null}
        </View>
      }
    >
      {error ? <Notice>{error}</Notice> : null}

      {step === 0 ? (
        <>
          <View>
            <Label>Photos</Label>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {photos.map((photo, index) => (
                <View key={photo.uri}>
                  <Image source={{ uri: photo.uri }} style={{ width: 96, height: 96, borderRadius: 16 }} contentFit="cover" accessibilityLabel={`Photo ${index + 1}`} />
                  <Pressable accessibilityRole="button" accessibilityLabel={`Remove photo ${index + 1}`} onPress={() => setPhotos((current) => current.filter((item) => item.uri !== photo.uri))} hitSlop={6} style={{ position: "absolute", top: 6, right: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" }}>
                    <AppIcon name="x" size={14} color="#FFFFFF" strokeWidth={2.4} />
                  </Pressable>
                </View>
              ))}
              {photos.length < MAX_PHOTOS ? (
                <>
                  <Pressable accessibilityRole="button" onPress={() => void addPhotos("camera")} style={{ width: 104, height: 96, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <AppIcon name="camera" />
                    <T weight="bold" style={{ fontSize: 14 }}>Take a photo</T>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => void addPhotos("library")} style={{ width: 104, height: 96, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <AppIcon name="image" />
                    <T weight="bold" style={{ fontSize: 14 }}>From photos</T>
                  </Pressable>
                </>
              ) : null}
            </ScrollView>
          </View>
          <View>
            <Label>What is it?</Label>
            <Field value={name} onChangeText={setName} placeholder="Leather slides, size 38 to 45" maxLength={200} accessibilityLabel="What is it?" />
          </View>
        </>
      ) : null}

      {step === 1 ? (
        <>
          <View>
            <Label>Your price to shops (for one) ₦</Label>
            <Field value={wholesale} onChangeText={setWholesale} keyboardType="decimal-pad" placeholder="6,000" accessibilityLabel="Your price to shops, for one" />
          </View>
          <View>
            <Label>Shops sell it for about ₦</Label>
            <Field value={retail} onChangeText={setRetail} keyboardType="decimal-pad" placeholder="13,000" accessibilityLabel="Shops sell it for about" />
            <T style={{ color: colors.inkSoft, fontSize: 15, marginTop: 6, lineHeight: 21 }}>Shops add their own profit on top of your price.</T>
          </View>
          <View>
            <Label>How many do you have?</Label>
            <Field value={stock} onChangeText={setStock} keyboardType="number-pad" placeholder="50" accessibilityLabel="How many do you have?" />
          </View>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <View>
            <Label>Describe it</Label>
            <Field value={description} onChangeText={setDescription} placeholder="What it's made of, sizes, colours, what's in the box" multiline maxLength={5000} accessibilityLabel="Describe it" style={{ height: 110, paddingTop: 14, textAlignVertical: "top" }} />
          </View>
          <View>
            <Label>What kind of product?</Label>
            <Pressable accessibilityRole="button" onPress={() => setPicking(true)} disabled={!categories.data} style={{ height: 54, borderRadius: radii.field, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <T style={{ fontSize: 16, color: category ? colors.ink : colors.inkFaint }}>{category?.name ?? (categories.error ? "Couldn't load the list. Pull down to try again" : categories.data ? "Pick one" : "Loading…")}</T>
              <AppIcon name="chevron" size={18} color={colors.inkSoft} />
            </Pressable>
          </View>

          {more ? (
            <Card style={{ gap: 14 }}>
              <View>
                <Label>Smallest order</Label>
                <Field value={moq} onChangeText={setMoq} keyboardType="number-pad" accessibilityLabel="Smallest order" />
              </View>
              <View>
                <Label>Ready to send within</Label>
                <ChipRow>{SHIPS.map((item) => <Chip key={item} label={item} on={ships === item} onPress={() => setShips(item)} />)}</ChipRow>
              </View>
              <View>
                <Label>Places you send to</Label>
                <Field value={regions} onChangeText={setRegions} placeholder="Lagos, Abuja, Ibadan" accessibilityLabel="Places you send to" />
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <T weight="bold" style={{ fontSize: 15 }}>Shops sell it for you</T>
                  <T style={{ color: colors.inkSoft, fontSize: 14.5 }}>You send each order with the shop&apos;s label.</T>
                </View>
                <Toggle on={dropship} onChange={setDropship} label="Shops sell it for you" />
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <T weight="bold" style={{ fontSize: 15 }}>Shops can buy a lot at once</T>
                  <T style={{ color: colors.inkSoft, fontSize: 14.5 }}>They ask, you tell them your price.</T>
                </View>
                <Toggle on={bulk} onChange={setBulk} label="Shops can buy a lot at once" />
              </View>
            </Card>
          ) : (
            <LinkButton title="Smallest order, sending and more (optional)" color={colors.inkSoft} onPress={() => setMore(true)} />
          )}
        </>
      ) : null}

      <ChoiceSheet
        visible={picking}
        title="What kind of product?"
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
