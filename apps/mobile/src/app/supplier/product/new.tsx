import { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { AppIcon } from "@/components/icons";
import { ChipRow } from "@/components/kit";
import { ChoiceSheet } from "@/components/partner";
import { Screen } from "@/components/Screen";
import { Card, Chip, Field, Label, Notice, PillButton, T, Toggle } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { parseAmount, parseCount } from "@/lib/partner-pure";
import { createSupplierProduct, fetchCategories, uploadSupplierPhoto } from "@/lib/supplier";
import { useLoad } from "@/lib/useLoad";
import { colors, radii } from "@/theme";

// Add a supplier product from the phone: photos from the camera or gallery, name, description, category,
// wholesale and shop prices, minimum order, stock and how it can be sold. Saved through the portal's own
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

  function check() {
    if (!photos.length) return "Add at least one photo.";
    if (name.trim().length < 2) return "Give the product a name.";
    if (description.trim().length < 10) return "Describe it in a sentence or two (at least 10 characters).";
    if (!categoryId) return "Pick a category.";
    if (!parseAmount(wholesale)) return "Enter your wholesale price per unit.";
    if (!parseAmount(retail)) return "Enter the price shops should sell it at.";
    if (!parseCount(moq) || parseCount(moq)! < 1) return "Minimum order must be at least 1.";
    if (parseCount(stock) === null) return "Enter how many you have in stock.";
    if (!dropship && !bulk) return "Choose dropship, wholesale or both.";
    return null;
  }

  async function save(status: "draft" | "pending_review") {
    const problem = check();
    if (problem) return setError(problem);
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
      Alert.alert(status === "draft" ? "Saved as a draft" : "Sent for review", status === "draft" ? "Send it for review from Products when you're ready." : "It goes live on the marketplace once it's approved.");
      router.back();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Couldn't save the product. Try again.";
      setError(saveError instanceof ApiError && (saveError.code === "VERIFICATION_REQUIRED" || saveError.code === "ONBOARDING_REQUIRED") ? "You can add products once your business is set up and verified. Check More → Verification." : message);
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  return (
    <Screen
      title="Add a product"
      sub="Shops add it to their store and sell it under their brand, or order it wholesale."
      footer={
        <View style={{ gap: 8 }}>
          {progress ? <T style={{ color: colors.inkSoft, textAlign: "center" }}>{progress}</T> : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <PillButton title="Save draft" tone="white" size="md" style={{ flex: 0.8 }} busy={busy === "draft"} disabled={Boolean(busy)} onPress={() => void save("draft")} />
            <PillButton title="Send for review" size="md" style={{ flex: 1 }} busy={busy === "review"} disabled={Boolean(busy)} onPress={() => void save("pending_review")} />
          </View>
        </View>
      }
    >
      {error ? <Notice>{error}</Notice> : null}

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
              <Pressable accessibilityRole="button" onPress={() => void addPhotos("camera")} style={{ width: 96, height: 96, borderRadius: 16, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center", gap: 6 }}>
                <AppIcon name="camera" color="#FFFFFF" />
                <T weight="bold" style={{ color: "#FFFFFF", fontSize: 12.5 }}>Take photo</T>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => void addPhotos("library")} style={{ width: 96, height: 96, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center", gap: 6 }}>
                <AppIcon name="image" />
                <T weight="bold" style={{ fontSize: 12.5 }}>From photos</T>
              </Pressable>
            </>
          ) : null}
        </ScrollView>
      </View>

      <View>
        <Label>Name</Label>
        <Field value={name} onChangeText={setName} placeholder="Leather slides, size 38–45" maxLength={200} />
      </View>
      <View>
        <Label>Description</Label>
        <Field value={description} onChangeText={setDescription} placeholder="What it's made of, sizes, colours, what's in the box" multiline maxLength={5000} style={{ height: 110, paddingTop: 14, textAlignVertical: "top" }} />
      </View>
      <View>
        <Label>Category</Label>
        <Pressable accessibilityRole="button" onPress={() => setPicking(true)} disabled={!categories.data} style={{ height: 54, borderRadius: radii.field, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <T style={{ fontSize: 16, color: category ? colors.ink : colors.inkFaint }}>{category?.name ?? (categories.error ? "Couldn't load categories" : categories.data ? "Pick a category" : "Loading…")}</T>
          <AppIcon name="chevron" size={18} color={colors.inkSoft} />
        </Pressable>
      </View>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Label>Wholesale ₦</Label>
          <Field value={wholesale} onChangeText={setWholesale} keyboardType="decimal-pad" placeholder="6,000" />
        </View>
        <View style={{ flex: 1 }}>
          <Label>Shops sell at ₦</Label>
          <Field value={retail} onChangeText={setRetail} keyboardType="decimal-pad" placeholder="13,000" />
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Label>Minimum order</Label>
          <Field value={moq} onChangeText={setMoq} keyboardType="number-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Label>In stock</Label>
          <Field value={stock} onChangeText={setStock} keyboardType="number-pad" placeholder="50" />
        </View>
      </View>

      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <T weight="bold">Dropship</T>
            <T style={{ color: colors.inkSoft, fontSize: 13 }}>Shops list it; you ship each order with their label.</T>
          </View>
          <Toggle on={dropship} onChange={setDropship} label="Dropship" />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <T weight="bold">Wholesale</T>
            <T style={{ color: colors.inkSoft, fontSize: 13 }}>Shops order in bulk at your wholesale price.</T>
          </View>
          <Toggle on={bulk} onChange={setBulk} label="Wholesale" />
        </View>
      </Card>

      <View>
        <Label>Ships within</Label>
        <ChipRow>{SHIPS.map((item) => <Chip key={item} label={item} on={ships === item} onPress={() => setShips(item)} />)}</ChipRow>
      </View>
      <View>
        <Label>Delivers to</Label>
        <Field value={regions} onChangeText={setRegions} placeholder="Lagos, Abuja, Ibadan" />
        <T style={{ color: colors.inkSoft, fontSize: 12.5, marginTop: 6 }}>States or cities, separated by commas.</T>
      </View>

      <ChoiceSheet
        visible={picking}
        title="Category"
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
