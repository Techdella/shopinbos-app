import { Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { AppIcon } from "@/components/icons";
import { T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// The lime "Get your shop ready · 2 of 4 done" card on Home for the first days ("Familiar app" prototype `.c-lime`
// checklist): a progress bar and one row per step, ticked when done. Hidden once everything is done or dismissed.

export type ChecklistItem = { key: string; label: string; done: boolean; onPress: () => void };

export function Checklist({ title, items, onDismiss }: { title: string; items: ChecklistItem[]; onDismiss?: () => void }) {
  const t = useT("m_familiar");
  const done = items.filter((item) => item.done).length;
  if (!items.length || done === items.length) return null;
  return (
    <View style={{ backgroundColor: "#E2F5A0", borderRadius: 24, padding: 18, gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <T weight="extrabold" style={{ fontSize: 16, flex: 1 }}>{title}</T>
        <T weight="semibold" style={{ fontSize: 13, color: colors.inkSoft }}>{t("check.count", { done, total: items.length })}</T>
        {onDismiss ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t("check.hide")} onPress={onDismiss} hitSlop={8} style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}>
            <AppIcon name="x" size={18} color={colors.inkSoft} />
          </Pressable>
        ) : null}
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: "rgba(22,20,31,0.12)", overflow: "hidden" }}>
        <View style={{ width: `${(done / items.length) * 100}%`, height: 6, backgroundColor: colors.ink }} />
      </View>
      {items.map((item) => (
        <Pressable key={item.key} accessibilityRole="button" accessibilityState={{ checked: item.done }} accessibilityLabel={item.label} onPress={item.onPress} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.ink, backgroundColor: item.done ? colors.ink : "transparent", alignItems: "center", justifyContent: "center" }}>
            {item.done ? (
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#E2F5A0" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M5 12.5l4.5 4.5L19 7" />
              </Svg>
            ) : null}
          </View>
          <T weight="semibold" style={{ flex: 1, fontSize: 14.5, color: colors.ink, textDecorationLine: item.done ? "line-through" : "none", opacity: item.done ? 0.6 : 1 }}>{item.label}</T>
          {!item.done ? <AppIcon name="chevron" size={16} color={colors.inkSoft} /> : null}
        </Pressable>
      ))}
    </View>
  );
}
