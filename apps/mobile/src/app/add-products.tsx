import { useState } from "react";
import { ScrollView, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { HelpButton } from "@/components/Help";
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
        <View style={{ flex: 1 }} />
        <HelpButton />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 24 }}>
        <T weight="extrabold" style={{ fontSize: 30, letterSpacing: -0.6 }} accessibilityRole="header">Add a product</T>
        <T style={{ color: colors.inkSoft, marginTop: 6, marginBottom: 18, lineHeight: 21 }}>Take a photo, or pick up to 6. Rex writes the name, price and description. You check them.</T>
        {saved > 0 && <View style={{ marginBottom: 12 }}><Notice tone="success">{saved === 1 ? "It's in your shop now. Customers can see it." : `${saved} products are in your shop now. Customers can see them.`}</Notice></View>}
        <ProductDraftsCard state={drafts} />
      </ScrollView>
      <View style={{ paddingHorizontal: 18, paddingBottom: 10, paddingTop: 8 }}>
        {drafts.error && <View style={{ marginBottom: 10 }}><Notice>{drafts.error}</Notice></View>}
        {count > 0 ? (
          <PillButton title={count === 1 ? "Put it in my shop" : `Put ${count} products in my shop`} busy={busy} disabled={drafts.reading} onPress={() => void save()} />
        ) : (
          <PillButton title="Done" tone="white" onPress={() => router.back()} />
        )}
      </View>
    </SafeAreaView>
  );
}
