import { useState } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { LANGUAGES, languageOf, type Locale } from "@shared/i18n";
import { Row, Tile } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { LinkRow } from "@/components/kit";
import { Sheet } from "@/components/Sheet";
import { T } from "@/components/ui";
import { useLocale, useSetLocale, useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Choose the app language (shared/i18n). The sheet lists each language by the name its speakers use (Yorùbá)
// with the English name under it and a tick on the current one. Open it from:
//  - <LanguageRow />   a row for Settings / profile menus ("Language · Yorùbá");
//  - <LanguageButton /> a small globe pill for the welcome and sign-in screens.

export function LanguageSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const locale = useLocale();
  const setLocale = useSetLocale();
  const t = useT("settings");
  const [note, setNote] = useState<string | null>(null);

  async function choose(code: Locale) {
    setNote(null);
    if (code === locale) return onClose();
    const synced = await setLocale(code);
    if (synced) onClose();
    else setNote(t("language.offline"));
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={t("language.choose")} testID="language-sheet">
      <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
        {LANGUAGES.map((language) => {
          const on = language.code === locale;
          return (
            <Pressable
              key={language.code}
              testID={`language-${language.code}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={language.name === language.nativeName ? language.nativeName : `${language.nativeName}, ${language.name}`}
              onPress={() => void choose(language.code)}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: on ? 2 : 1, borderColor: on ? colors.ink : colors.line, backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 })}
            >
              <View style={{ flex: 1 }}>
                <T weight="extrabold" style={{ fontSize: 17 }}>{language.nativeName}</T>
                {language.name !== language.nativeName ? <T style={{ fontSize: 14, color: colors.inkSoft, marginTop: 1 }}>{language.name}</T> : null}
              </View>
              <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: on ? colors.ink : "transparent", borderWidth: on ? 0 : 1, borderColor: colors.line }}>
                {on ? <AppIcon name="check" size={16} color="#FFFFFF" strokeWidth={2.6} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      {locale !== "en" ? <T style={{ fontSize: 14, lineHeight: 20, color: colors.inkSoft }}>{t("language.draftNote")}</T> : null}
      {note ? <T style={{ fontSize: 14, lineHeight: 20, color: colors.inkSoft }}>{note}</T> : null}
    </Sheet>
  );
}

/** A menu row: "Language" with the current language on the right; opens the sheet. `tile` draws it like the other
 * rows of a design-kit List (a tinted icon tile), as on My shop. */
export function LanguageRow({ first, tile = false }: { first?: boolean; tile?: boolean }) {
  const [open, setOpen] = useState(false);
  const locale = useLocale();
  const t = useT("settings");
  if (tile) {
    return (
      <>
        <Row testID="language-row" lead={<Tile icon="globe" tone="gray" />} title={t("language.title")} sub={languageOf(locale).nativeName} onPress={() => setOpen(true)} />
        <LanguageSheet visible={open} onClose={() => setOpen(false)} />
      </>
    );
  }
  return (
    <>
      <LinkRow
        first={first}
        icon="globe"
        label={t("language.title")}
        hint={languageOf(locale).nativeName}
        onPress={() => setOpen(true)}
      />
      <LanguageSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** A small globe pill showing the current language code, for the corner of welcome and sign-in screens. */
export function LanguageButton({ style }: { style?: StyleProp<ViewStyle> }) {
  const [open, setOpen] = useState(false);
  const locale = useLocale();
  const t = useT("settings");
  return (
    <>
      <Pressable
        testID="language-button"
        accessibilityRole="button"
        accessibilityLabel={t("language.button", { language: languageOf(locale).nativeName })}
        onPress={() => setOpen(true)}
        hitSlop={4}
        style={({ pressed }) => [{ minHeight: 44, paddingHorizontal: 12, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed ? 0.8 : 1 }, style]}
      >
        <AppIcon name="globe" size={18} />
        <T weight="bold" numberOfLines={1} style={{ flexShrink: 1, fontSize: 14, textTransform: "uppercase" }}>{locale}</T>
      </Pressable>
      <LanguageSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
