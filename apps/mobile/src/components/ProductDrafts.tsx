import { useState } from "react";
import { Pressable, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { naira } from "@shared/onboarding";
import { Card, Field, Mascot, PillButton, T } from "@/components/ui";
import { createProducts, draftProducts, type ProductDraft } from "@/lib/onboarding";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// "Snap photos": pick or take product photos, Rex names and prices them, the seller checks, then they're created.
// Used by onboarding and by the app's "Add products" screen.

export function useProductDrafts() {
  const t = useT("m_products");
  const [drafts, setDrafts] = useState<ProductDraft[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(source: "camera" | "library") {
    setError(null);
    const permission = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return setError(source === "camera" ? t("drafts.allowCamera") : t("drafts.allowPhotos"));
    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 6, quality: 0.7 });
    if (result.canceled || !result.assets.length) return;
    setReading(true);
    try {
      const { drafts: next, drafted, error: rest } = await draftProducts(result.assets.slice(0, 6));
      setDrafts((current) => [...current, ...next].slice(0, 12));
      if (rest) setError(rest);
      else if (!drafted) setError(t("drafts.notNamed"));
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : t("drafts.readFailed"));
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
      setError(t("drafts.incomplete"));
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
  const t = useT("m_products", "common");
  return (
    <Card>
      {drafts.length > 0 && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Mascot name="rex" size={28} />
          <T weight="bold" style={{ color: colors.forest, flex: 1 }}>{t("drafts.named")}</T>
        </View>
      )}
      {drafts.map((item, index) => {
        const needsCheck = item.confidence === "check" || !item.price;
        return (
          <View key={`${item.imageUrl}-${index}`} style={{ paddingVertical: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Image source={{ uri: item.imageUrl }} style={{ width: 58, height: 58, borderRadius: 12 }} contentFit="cover" />
              <View style={{ flex: 1 }}>
                <T weight="extrabold" style={{ fontSize: 15 }} numberOfLines={1}>{item.name || t("drafts.nameThis")}</T>
                {needsCheck ? (
                  <T weight="semibold" style={{ color: colors.accentInk, fontSize: 14 }}>{item.price ? t("drafts.checkPrice", { price: naira(item.price) }) : t("drafts.addPrice")}</T>
                ) : (
                  <T style={{ color: colors.inkSoft, fontSize: 14 }} numberOfLines={1}>{[naira(item.price ?? 0), item.detail, t("drafts.inStock", { count: item.stock })].filter(Boolean).join(" · ")}</T>
                )}
              </View>
              {editing !== index && <PillButton title={needsCheck ? t("edit") : "✓"} tone="white" size="sm" onPress={() => setEditing(index)} />}
            </View>
            {editing === index && (
              <View style={{ gap: 8, marginTop: 10, backgroundColor: colors.canvas, borderRadius: 14, padding: 12 }}>
                <Field accessibilityLabel={t("drafts.name")} value={item.name} onChangeText={(value) => update(index, { name: value })} />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Field style={{ flex: 1 }} accessibilityLabel={t("drafts.priceLabel")} keyboardType="number-pad" placeholder={t("drafts.pricePlaceholder")} value={item.price ? String(item.price) : ""} onChangeText={(value) => update(index, { price: Number(value.replace(/\D/g, "")) || null })} />
                  <Field style={{ flex: 1 }} accessibilityLabel={t("drafts.stockLabel")} keyboardType="number-pad" placeholder={t("drafts.stockPlaceholder")} value={String(item.stock)} onChangeText={(value) => update(index, { stock: Number(value.replace(/\D/g, "")) || 0 })} />
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Pressable onPress={() => remove(index)} hitSlop={8}>
                    <T weight="bold" style={{ color: colors.danger }}>{t("remove")}</T>
                  </Pressable>
                  <PillButton title={t("done")} size="sm" onPress={() => { update(index, { confidence: "ok" }); setEditing(null); }} />
                </View>
              </View>
            )}
          </View>
        );
      })}
      {/* Stacked, full width: side by side, "Choose photos" wrapped onto two lines on small phones. */}
      <View style={{ gap: 10, marginTop: drafts.length ? 8 : 0 }}>
        <PillButton testID="drafts-take-photo" tone="accent" size="md" accessibilityLabel={t("drafts.takePhoto")} busy={reading} onPress={() => void pick("camera")} icon="camera" title={t("drafts.takePhoto")} />
        <PillButton testID="drafts-choose-photos" tone="white" size="md" accessibilityLabel={t("drafts.choosePhotos")} disabled={reading} onPress={() => void pick("library")} icon="image" title={t("drafts.choosePhotos")} />
      </View>
      {reading && <T style={{ color: colors.inkSoft, marginTop: 10, textAlign: "center" }}>{t("drafts.reading")}</T>}
    </Card>
  );
}
