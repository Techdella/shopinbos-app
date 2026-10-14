import { useState } from "react";
import { View } from "react-native";
import { AppIcon } from "@/components/icons";
import { T, Toggle } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";
import { saveTipsOn, useTipsOnPhone } from "./prefs";

// Settings row: tips and tooltips on or off (word explanations and intros that open by themselves). Same switch
// as the web's Customise your menu → Tips and tooltips.
export function TipsRow() {
  const t = useT("m_settings");
  const on = useTipsOnPhone();
  const [failed, setFailed] = useState(false);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.line }}>
      <AppIcon name="help" size={20} />
      <View style={{ flex: 1 }}>
        <T weight="semibold" style={{ fontSize: 16 }}>{t("set.tips")}</T>
        <T style={{ color: failed ? colors.danger : colors.inkSoft, fontSize: 14, marginTop: 2 }}>{failed ? t("set.saveFailed") : t("set.tipsHint")}</T>
      </View>
      <Toggle
        on={on}
        label={t("set.tips")}
        onChange={(value) => {
          setFailed(false);
          void saveTipsOn(value).catch(() => setFailed(true));
        }}
      />
    </View>
  );
}
