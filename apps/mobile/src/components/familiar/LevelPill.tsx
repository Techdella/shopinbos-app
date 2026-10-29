import { Pressable, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Picture } from "@/components/kit";
import { T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// The picture in the Home header with a ring that fills towards the next level and a small "Lv 3" tag under it
// ("Familiar app" prototype `.lvl`). Tapping it opens Rewards. With no rewards yet it's just the picture.

export function LevelPill({ level, progress, uri, name, onPress, size = 50 }: { level: number | null; progress: number; uri: string | null; name: string; onPress: () => void; size?: number }) {
  const t = useT("m_familiar");
  const stroke = 3;
  const r = (size - stroke) / 2;
  const length = 2 * Math.PI * r;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={level ? t("level.open", { level }) : t("level.openPlain")} onPress={onPress} hitSlop={6} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
      <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        {level ? (
          <Svg width={size} height={size} style={{ position: "absolute" }}>
            <Circle cx={size / 2} cy={size / 2} r={r} stroke="#E6E3EC" strokeWidth={stroke} fill="none" />
            <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.accent} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${length * progress} ${length}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
          </Svg>
        ) : null}
        <Picture uri={uri} name={name} size={size - 10} />
      </View>
      {level ? (
        <View style={{ position: "absolute", bottom: -6, alignSelf: "center", backgroundColor: colors.inkFill, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 }}>
          <T weight="extrabold" style={{ color: "#E2F5A0", fontSize: 10 }}>{t("level.short", { level })}</T>
        </View>
      ) : null}
    </Pressable>
  );
}
