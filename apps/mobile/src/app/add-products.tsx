import { useState } from "react";
import { ScrollView, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { BackButton, Notice, PillButton, T } from "@/components/ui";
import { ProductDraftsCard, useProductDrafts } from "@/components/ProductDrafts";
import { colors } from "@/theme";

// The orange "+" button: snap or pick photos, Rex names and prices them, they go straight into the shop.
export default function AddProducts() {
  const drafts = useProductDrafts();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(0);
  const count = drafts.drafts.length;

  async function save() {
    setBusy(true);
    drafts.setError(null);
    try {
      if (await drafts.save()) setSaved((total) => total + count);
    } catch (saveError) {
      drafts.setError(saveError instanceof Error ? saveError.message : "Couldn't add those products. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 10 }}>
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace("/home"))} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 24 }}>
        <T weight="extrabold" style={{ fontSize: 30, letterSpacing: -0.6 }} accessibilityRole="header">Add products</T>
        <T style={{ color: colors.inkSoft, marginTop: 6, marginBottom: 18, lineHeight: 21 }}>Snap or pick up to 6 photos. Rex writes the names, prices and descriptions; you check them.</T>
        {saved > 0 && <View style={{ marginBottom: 12 }}><Notice tone="success">{saved} product{saved === 1 ? "" : "s"} added to your shop.</Notice></View>}
        <ProductDraftsCard state={drafts} />
      </ScrollView>
      <View style={{ paddingHorizontal: 18, paddingBottom: 10, paddingTop: 8 }}>
        {drafts.error && <View style={{ marginBottom: 10 }}><Notice>{drafts.error}</Notice></View>}
        {count > 0 ? (
          <PillButton title={`Add ${count} product${count === 1 ? "" : "s"}`} busy={busy} disabled={drafts.reading} onPress={() => void save()} />
        ) : (
          <PillButton title="Done" tone="white" onPress={() => router.back()} />
        )}
      </View>
    </SafeAreaView>
  );
}
