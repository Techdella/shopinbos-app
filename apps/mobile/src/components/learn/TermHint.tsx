import { useState, type ReactNode } from "react";
import { Pressable, Text, View, type StyleProp, type TextStyle } from "react-native";
import { glossaryTerm } from "@shared/glossary";
import { introByKey } from "@shared/feature-intros";
import { Sheet } from "@/components/Sheet";
import { T } from "@/components/ui";
import { translateTerm } from "@shared/i18n/learn";
import { useT } from "@/lib/i18n";
import { colors, fonts } from "@/theme";
import { openFeatureIntro } from "./events";
import { LC } from "./scenes";

// Tap-to-explain for a standard word: <TermHint k="segments">Segments</TermHint> shows the word with a dotted
// underline and a small mint dot; a tap opens a bottom sheet with what it means, an everyday example and, when
// there is one, the 60-second intro.

export function TermHint({ k, children, style }: { k: string; children?: ReactNode; style?: StyleProp<TextStyle> }) {
  const source = glossaryTerm(k);
  const [open, setOpen] = useState(false);
  const t = useT("learn");
  const tGlossary = useT("glossary");
  // The meaning and example in the app language; the word itself stays the standard one.
  const entry = source ? translateTerm(source, tGlossary) : null;
  if (!entry) return <Text style={style}>{children}</Text>;
  const intro = introByKey(entry.introKey);
  return (
    <>
      <Text
        accessibilityRole="button"
        accessibilityHint={t("explains", { term: entry.term })}
        onPress={() => setOpen(true)}
        suppressHighlighting
        style={[{ textDecorationLine: "underline", textDecorationStyle: "dotted", textDecorationColor: colors.inkFaint }, style]}
      >
        {children ?? entry.term}
        <Text style={{ color: LC.teal, fontSize: 10 }}> ●</Text>
      </Text>
      <Sheet visible={open} onClose={() => setOpen(false)} title={entry.term} testID="term-hint">
        <T style={{ fontSize: 17, lineHeight: 25 }}>{entry.short}</T>
        <View style={{ borderRadius: 18, backgroundColor: colors.mintTint, padding: 14 }}>
          <T weight="bold" style={{ fontSize: 13, color: colors.forest }}>{t("forExampleLabel")}</T>
          <T style={{ fontSize: 15.5, lineHeight: 22, marginTop: 2 }}>{entry.example}</T>
        </View>
        {intro ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setOpen(false);
              setTimeout(() => openFeatureIntro(intro.key), 350);
            }}
            style={({ pressed }) => ({ minHeight: 52, borderRadius: 999, backgroundColor: LC.navy, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, opacity: pressed ? 0.85 : 1, marginTop: 4 })}
          >
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: LC.mint, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: LC.navy, fontSize: 12 }}>▶</Text>
            </View>
            <Text style={{ fontFamily: fonts.extrabold, fontSize: 16, color: LC.cream }}>{t("watchIntroLong")}</Text>
          </Pressable>
        ) : null}
      </Sheet>
    </>
  );
}
