import { useState } from "react";
import { Pressable, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { naira } from "@shared/onboarding";
import { Card, Field, Mascot, PillButton, T } from "@/components/ui";
import { createProducts, draftProducts, type ProductDraft } from "@/lib/onboarding";
import { colors } from "@/theme";

// "Snap photos": pick or take product photos, Rex names and prices them, the seller checks, then they're created.
// Used by onboarding and by the app's "Add products" screen.

export function useProductDrafts() {
  const [drafts, setDrafts] = useState<ProductDraft[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(source: "camera" | "library") {
    setError(null);
    const permission = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return setError(source === "camera" ? "Allow the camera to snap your products." : "Allow photo access to choose product photos.");
    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 6, quality: 0.7 });
    if (result.canceled || !result.assets.length) return;
    setReading(true);
    try {
      const { drafts: next, drafted } = await draftProducts(result.assets.slice(0, 6));
      setDrafts((current) => [...current, ...next].slice(0, 12));
      if (!drafted) setError("Rex couldn't name these yet. Add a name and price for each one.");
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : "Rex couldn't read those photos. Check your connection and try again.");
    } finally {
      setReading(false);
    }
  }

  function update(index: number, patch: Partial<ProductDraft>) {
    setDrafts((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function remove(index: number) {
    setDrafts((current) => current.filter((_, i) => i !== index));
    setEditing(null);
  }

  /** Creates every draft; returns false (and opens the first incomplete one) when something is missing. */
  async function save() {
    const incomplete = drafts.findIndex((item) => !item.name.trim() || !item.price || item.price <= 0);
    if (incomplete >= 0) {
      setEditing(incomplete);
      setError("Add a name and price for every product, or remove it.");
      return false;
    }
    await createProducts(drafts);
    setDrafts([]);
    return true;
  }

  return { drafts, editing, setEditing, reading, error, setError, pick, update, remove, save };
}

export function ProductDraftsCard({ state }: { state: ReturnType<typeof useProductDrafts> }) {
  const { drafts, editing, setEditing, reading, pick, update, remove } = state;
  return (
    <Card>
      {drafts.length > 0 && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Mascot name="rex" size={28} />
          <T weight="bold" style={{ color: colors.forest, flex: 1 }}>Rex named and priced these from your photos</T>
        </View>
      )}
      {drafts.map((item, index) => {
        const needsCheck = item.confidence === "check" || !item.price;
        return (
          <View key={`${item.imageUrl}-${index}`} style={{ paddingVertical: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Image source={{ uri: item.imageUrl }} style={{ width: 58, height: 58, borderRadius: 12 }} contentFit="cover" />
              <View style={{ flex: 1 }}>
                <T weight="extrabold" style={{ fontSize: 15 }} numberOfLines={1}>{item.name || "Name this product"}</T>
                {needsCheck ? (
                  <T weight="semibold" style={{ color: colors.accentInk, fontSize: 14 }}>{item.price ? `Check the price: ${naira(item.price)}?` : "Add a price"}</T>
                ) : (
                  <T style={{ color: colors.inkSoft, fontSize: 14 }} numberOfLines={1}>{[naira(item.price ?? 0), item.detail, `${item.stock} in stock`].filter(Boolean).join(" · ")}</T>
                )}
              </View>
              {editing !== index && <PillButton title={needsCheck ? "Edit" : "✓"} tone="white" size="sm" onPress={() => setEditing(index)} />}
            </View>
            {editing === index && (
              <View style={{ gap: 8, marginTop: 10, backgroundColor: colors.canvas, borderRadius: 14, padding: 12 }}>
                <Field accessibilityLabel="Product name" value={item.name} onChangeText={(value) => update(index, { name: value })} />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Field style={{ flex: 1 }} accessibilityLabel="Price in naira" keyboardType="number-pad" placeholder="Price (₦)" value={item.price ? String(item.price) : ""} onChangeText={(value) => update(index, { price: Number(value.replace(/\D/g, "")) || null })} />
                  <Field style={{ flex: 1 }} accessibilityLabel="How many you have" keyboardType="number-pad" placeholder="In stock" value={String(item.stock)} onChangeText={(value) => update(index, { stock: Number(value.replace(/\D/g, "")) || 0 })} />
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Pressable onPress={() => remove(index)} hitSlop={8}>
                    <T weight="bold" style={{ color: colors.danger }}>Remove</T>
                  </Pressable>
                  <PillButton title="Done" size="sm" onPress={() => { update(index, { confidence: "ok" }); setEditing(null); }} />
                </View>
              </View>
            )}
          </View>
        );
      })}
      <View style={{ flexDirection: "row", gap: 8, marginTop: drafts.length ? 8 : 0 }}>
        <PillButton title="Take a photo" size="md" style={{ flex: 1 }} busy={reading} onPress={() => void pick("camera")} />
        <PillButton title="Choose photos" tone="white" size="md" style={{ flex: 1 }} disabled={reading} onPress={() => void pick("library")} />
      </View>
      {reading && <T style={{ color: colors.inkSoft, marginTop: 10, textAlign: "center" }}>Rex is looking at your photos…</T>}
    </Card>
  );
}
