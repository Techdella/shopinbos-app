import { useMemo } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import { T } from "@/components/ui";
import { emailPreviewParts, SAMPLE_DETAILS } from "@/lib/marketing-pure";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// An email's words and pictures as the phone can show them (no web view in the app): headings, text, pictures
// and buttons, with sample customer details. The full design with the shop's colours is on the web.

export function EmailPreview({ html, shopName }: { html: string; shopName?: string }) {
  const t = useT("m_marketing");
  const parts = useMemo(() => emailPreviewParts(html, { ...SAMPLE_DETAILS, store: shopName || t("tpl.yourShop") }), [html, shopName, t]);
  if (!parts.length) return <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t("tpl.empty")}</T>;
  return (
    <View style={{ gap: 10, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 14 }}>
      {parts.map((part, index) =>
        part.kind === "image" ? (
          <Image key={index} source={{ uri: part.url }} style={{ width: "100%", aspectRatio: 1.6, borderRadius: 12 }} contentFit="cover" accessibilityIgnoresInvertColors />
        ) : part.kind === "button" ? (
          <View key={index} style={{ alignSelf: "center", backgroundColor: colors.inkFill, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 }}>
            <T weight="bold" style={{ color: "#FFFFFF", fontSize: 15 }}>{part.text}</T>
          </View>
        ) : (
          <T key={index} weight={part.kind === "heading" ? "extrabold" : "regular"} style={{ fontSize: part.kind === "heading" ? 20 : 15, lineHeight: part.kind === "heading" ? 26 : 22 }}>{part.text}</T>
        ),
      )}
    </View>
  );
}
