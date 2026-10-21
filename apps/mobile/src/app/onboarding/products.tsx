import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { PRODUCT_DOORS, type ProductDoor } from "@shared/onboarding";
import { Sub, Title } from "@/components/design";
import { Card, Notice, PillButton, T } from "@/components/ui";
import { OnboardingFrame } from "@/components/OnboardingFrame";
import { useOnboarding } from "@/components/OnboardingContext";
import { ProductDraftsCard, useProductDrafts } from "@/components/ProductDrafts";
import { API_URL } from "@/lib/api";
import { saveMemory } from "@/lib/onboarding";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

export default function Products() {
  const t = useT("m_onboarding", "m_products");
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
      drafts.setError(productError instanceof Error ? productError.message : t("add.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  const info = PRODUCT_DOORS.find((item) => item.key === door)!;
  const count = drafts.drafts.length;
  const label = count ? t("products.continueWith", { count }) : status?.productCount ? t("products.continue") : t("products.later");

  return (
    <OnboardingFrame
      step="products"
      footer={
        <>
          {drafts.error && <Notice>{drafts.error}</Notice>}
          <PillButton title={label} busy={busy} disabled={drafts.reading} onPress={() => void next()} />
        </>
      }
    >
      <Title>{t("products.title")}</Title>
      <Sub style={{ marginTop: 8, marginBottom: 20 }}>{t("products.sub")}</Sub>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {PRODUCT_DOORS.map((item) => (
          <Pressable key={item.key} accessibilityRole="button" accessibilityState={{ selected: door === item.key }} onPress={() => setDoor(item.key)} style={{ width: "48.4%", minHeight: 118, backgroundColor: colors.surface, borderRadius: 20, padding: 16, borderWidth: door === item.key ? 2.5 : 1.5, borderColor: door === item.key ? colors.ink : colors.line }}>
            <T weight="extrabold" style={{ fontSize: 15, lineHeight: 18 }}>{t.dynamic(`door.${item.key}.label`, item.label)}</T>
            <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 18, marginTop: 6 }}>{t.dynamic(`door.${item.key}.hint`, item.hint)}</T>
          </Pressable>
        ))}
      </View>
      <View style={{ marginTop: 16 }}>
        {door === "snap" ? (
          <ProductDraftsCard state={drafts} />
        ) : (
          <Card style={{ padding: 20, borderRadius: 24, borderWidth: 1, borderColor: colors.line }}>
            <T style={{ color: colors.inkSoft, lineHeight: 21 }}>{t.dynamic(`door.${info.key}.note`, info.note)}</T>
            {door === "ig" ? (
              <T weight="bold" style={{ color: colors.inkFaint, fontSize: 14, marginTop: 12 }}>{t("products.igSoon")}</T>
            ) : (
              <PillButton
                title={door === "file" ? t("products.upload") : t("products.browse")}
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
