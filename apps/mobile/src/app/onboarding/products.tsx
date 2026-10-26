import { useState } from "react";
import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { PRODUCT_DOORS, type ProductDoor } from "@shared/onboarding";
import { Sub, Title } from "@/components/design";
import { Card, Notice, PillButton, T } from "@/components/ui";
import { OnboardingFrame } from "@/components/OnboardingFrame";
import { useOnboarding } from "@/components/OnboardingContext";
import { ProductDraftsCard, useProductDrafts } from "@/components/ProductDrafts";
import { openWeb } from "@/lib/web";
import { WebButtonLabel } from "@/components/WebBadge";
import { saveMemory } from "@/lib/onboarding";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Instagram import isn't in the app: that door is left out rather than shown as "coming soon".
const DOORS = PRODUCT_DOORS.filter((item) => item.key !== "ig");

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
      await saveMemory({ screen: "where" }).catch(() => null);
      router.push("/onboarding/where");
    } catch (productError) {
      drafts.setError(productError instanceof Error ? productError.message : t("add.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  const info = DOORS.find((item) => item.key === door) ?? DOORS[0];
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
        {DOORS.map((item) => (
          // Two to a row; an odd last one takes the whole row instead of leaving a gap.
          <Pressable key={item.key} accessibilityRole="button" accessibilityState={{ selected: door === item.key }} onPress={() => setDoor(item.key)} style={{ flexGrow: 1, flexBasis: "45%", minHeight: 118, backgroundColor: colors.surface, borderRadius: 20, padding: 16, borderWidth: door === item.key ? 2.5 : 1.5, borderColor: door === item.key ? colors.ink : colors.line }}>
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
            {door === "file" ? (
              // The spreadsheet import is a web tool (signed in through openWeb); the button says it opens the website.
              <PillButton size="md" style={{ marginTop: 14 }} onPress={() => void openWeb("/products/import")}>
                <WebButtonLabel title={t("products.upload")} size="md" />
              </PillButton>
            ) : (
              <PillButton title={t("products.browse")} size="md" style={{ marginTop: 14 }} onPress={() => router.push("/find")} />
            )}
          </Card>
        )}
      </View>
    </OnboardingFrame>
  );
}
