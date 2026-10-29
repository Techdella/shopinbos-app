import { useState } from "react";
import { Pressable, View } from "react-native";
import { Row, Tile } from "@/components/design";
import { AppIcon, type AppIconName } from "@/components/icons";
import { LinkRow } from "@/components/kit";
import { Sheet } from "@/components/Sheet";
import { T } from "@/components/ui";
import { setAppearance, useAppearance } from "@/lib/appearance";
import { APPEARANCE_PREFS, type AppearancePref } from "@/lib/appearance-pure";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Settings > Appearance: Auto (the default: the phone's light or dark setting), Light or Dark (lib/appearance.tsx).
//  - <AppearanceRow />       a row for Settings and the profile menus ("Appearance · Auto: matches your phone");
//  - <AppearanceRow tile />  drawn like the other rows of a design-kit List, as on the seller's Menu.

export const APPEARANCE_ICON: Record<AppearancePref, AppIconName> = { auto: "contrast", light: "sun", dark: "moon" };

const TITLE = { auto: "set.appearanceAuto", light: "set.appearanceLight", dark: "set.appearanceDark" } as const;
const SUB = { auto: "set.appearanceAutoSub", light: "set.appearanceLightSub", dark: "set.appearanceDarkSub" } as const;

export function AppearanceSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const pref = useAppearance();
  const t = useT("m_settings");
  return (
    <Sheet visible={visible} onClose={onClose} title={t("set.appearanceChoose")} testID="appearance-sheet">
      <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
        {APPEARANCE_PREFS.map((option) => {
          const on = option === pref;
          return (
            <Pressable
              key={option}
              testID={`appearance-${option}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${t(TITLE[option])}. ${t(SUB[option])}`}
              onPress={() => {
                onClose();
                // The app redraws in the new colours (this sheet closes with it).
                setAppearance(option);
              }}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 68, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: on ? 2 : 1, borderColor: on ? colors.ink : colors.line, backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 })}
            >
              <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: colors.grayTint, alignItems: "center", justifyContent: "center" }}>
                <AppIcon name={APPEARANCE_ICON[option]} size={20} />
              </View>
              <View style={{ flex: 1 }}>
                <T weight="extrabold" style={{ fontSize: 17 }}>{t(TITLE[option])}</T>
                <T style={{ fontSize: 14, lineHeight: 19, color: colors.inkSoft, marginTop: 1 }}>{t(SUB[option])}</T>
              </View>
              <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: on ? colors.inkFill : "transparent", borderWidth: on ? 0 : 1, borderColor: colors.line }}>
                {on ? <AppIcon name="check" size={16} color="#FFFFFF" strokeWidth={2.6} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

/** A menu row: "Appearance" with the current choice under it; opens the sheet. `first`: no line above it. */
export function AppearanceRow({ first, tile = false }: { first?: boolean; tile?: boolean }) {
  const [open, setOpen] = useState(false);
  const pref = useAppearance();
  const t = useT("m_settings");
  const hint = pref === "auto" ? t("set.appearanceAutoHint") : t(TITLE[pref]);
  return (
    <>
      {tile ? (
        <Row testID="appearance-row" lead={<Tile icon={APPEARANCE_ICON[pref]} tone="gray" />} title={t("set.appearance")} sub={hint} onPress={() => setOpen(true)} />
      ) : (
        <LinkRow first={first} icon={APPEARANCE_ICON[pref]} label={t("set.appearance")} hint={hint} onPress={() => setOpen(true)} />
      )}
      <AppearanceSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
