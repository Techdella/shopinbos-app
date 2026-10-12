import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { PRODUCT_DOORS, type ProductDoor } from "@shared/onboarding";
import { Card, Notice, PillButton, T } from "@/components/ui";
import { OnboardingFrame } from "@/components/OnboardingFrame";
import { useOnboarding } from "@/components/OnboardingContext";
import { ProductDraftsCard, useProductDrafts } from "@/components/ProductDrafts";
import { API_URL } from "@/lib/api";
import { saveMemory } from "@/lib/onboarding";
import { colors, radii } from "@/theme";

export default function Products() {
  const params = useLocalSearchParams<{ door?: string }>();
  const { status, setStatus } = useOnboarding();
  const [door, setDoor] = useState<ProductDoor>(params.door === "sup" ? "sup" : "snap");
  const drafts = useProductDrafts();
  const [busy, setBusy] = useState(false);

  async function next() {
    setBusy(true);
    drafts.setError(null);
    try {
      const count = drafts.drafts.length;
      if (!(await drafts.save())) return;
      if (status && count) setStatus({ ...status, productCount: status.productCount + count });
      await saveMemory({ screen: "payments" }).catch(() => null);
      router.push("/onboarding/payments");
    } catch (productError) {
      drafts.setError(productError instanceof Error ? productError.message : "Couldn't add those products. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const info = PRODUCT_DOORS.find((item) => item.key === door)!;
  const count = drafts.drafts.length;
  const label = count ? `Continue with ${count} product${count === 1 ? "" : "s"}` : status?.productCount ? "Continue" : "Add products later";

  return (
    <OnboardingFrame
      step="products"
      footer={
        <>
          {drafts.error && <View style={{ marginBottom: 10 }}><Notice>{drafts.error}</Notice></View>}
          <PillButton title={label} busy={busy} disabled={drafts.reading} onPress={() => void next()} />
        </>
      }
    >
      <T weight="extrabold" style={{ fontSize: 30, letterSpacing: -0.6, lineHeight: 33 }} accessibilityRole="header">Add your first products</T>
      <T style={{ color: colors.inkSoft, marginTop: 6, marginBottom: 18 }}>One is enough to go live. Add the rest later.</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {PRODUCT_DOORS.map((item) => (
          <Pressable key={item.key} accessibilityRole="button" accessibilityState={{ selected: door === item.key }} onPress={() => setDoor(item.key)} style={{ width: "48.4%", minHeight: 118, backgroundColor: colors.surface, borderRadius: radii.card, padding: 16, borderWidth: 2, borderColor: door === item.key ? colors.ink : "transparent" }}>
            <T weight="extrabold" style={{ fontSize: 15, lineHeight: 18 }}>{item.label}</T>
            <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 18, marginTop: 6 }}>{item.hint}</T>
          </Pressable>
        ))}
      </View>
      <View style={{ marginTop: 16 }}>
        {door === "snap" ? (
          <ProductDraftsCard state={drafts} />
        ) : (
          <Card style={{ padding: 20 }}>
            <T style={{ color: colors.inkSoft, lineHeight: 21 }}>{info.note}</T>
            {door === "ig" ? (
              <T weight="bold" style={{ color: colors.inkFaint, fontSize: 14, marginTop: 12 }}>Instagram import is coming soon. Snap photos for now.</T>
            ) : (
              <PillButton
                title={door === "file" ? "Upload a spreadsheet on the web" : "Browse suppliers"}
                size="md"
                style={{ marginTop: 14 }}
                onPress={() => void Linking.openURL(`${API_URL}${door === "file" ? "/products/import" : "/marketplace"}`)}
              />
            )}
          </Card>
        )}
      </View>
    </OnboardingFrame>
  );
}
