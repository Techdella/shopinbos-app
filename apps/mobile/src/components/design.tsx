import { Children, isValidElement, type ReactNode } from "react";
import { Pressable, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { AppIcon, type AppIconName } from "@/components/icons";
import { T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { colors, fonts, radii } from "@/theme";

// Building blocks of the "Simple app, end to end (iOS + Android)" prototype: big Bricolage titles, lists as rows in one
// white card, tinted icon tiles, pills, radio choice cards, a number keypad with digit boxes, steppers and a timeline.

/** Page title on a tab root or the first heading of a flow screen (`.big`: Bricolage 800, 32px). */
export function Title({ children, size = 32, style }: { children: ReactNode; size?: number; style?: StyleProp<TextStyle> }) {
  return <T accessibilityRole="header" style={[{ fontFamily: fonts.display, fontSize: size, lineHeight: Math.round(size * 1.08), letterSpacing: -0.025 * size }, style]}>{children}</T>;
}

/** Section or card heading (`.ttl`: Bricolage 800, 22px). */
export function Heading({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <T accessibilityRole="header" style={[{ fontFamily: fonts.display, fontSize: 22, lineHeight: 26, letterSpacing: -0.44 }, style]}>{children}</T>;
}

/** A big number (`.num`: Bricolage 800, 44px), e.g. money on a dark card. */
export function BigNumber({ children, color = colors.ink, size = 44 }: { children: ReactNode; color?: string; size?: number }) {
  return <T style={{ fontFamily: fonts.display, fontSize: size, lineHeight: size, letterSpacing: -0.03 * size, color }}>{children}</T>;
}

/** Grey line under a title (`.sub`). */
export function Sub({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <T style={[{ fontSize: 16, lineHeight: 24, color: colors.inkSoft }, style]}>{children}</T>;
}

/** Small grey print (`.small`). */
export function Small({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <T weight="semibold" style={[{ fontSize: 13, lineHeight: 19, color: colors.inkSoft }, style]}>{children}</T>;
}

/** Uppercase section label above a card (`.eyebrow`). */
export function Eyebrow({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <T weight="extrabold" style={[{ fontSize: 13, letterSpacing: 0.8, textTransform: "uppercase", color: colors.inkSoft }, style]}>{children}</T>;
}

export type TileTone = "peach" | "mint" | "warn" | "gray" | "blue" | "ok" | "ink" | "lime" | "butter" | "lilac" | "sky";
export const TILE: Record<TileTone, { bg: string; fg: string }> = {
  peach: { bg: colors.peach, fg: colors.accentInk },
  mint: { bg: colors.mintTint, fg: colors.forest },
  warn: { bg: colors.warnTint, fg: colors.warnInk },
  gray: { bg: colors.grayTint, fg: colors.ink },
  blue: { bg: colors.blueTint, fg: colors.blueInk },
  ok: { bg: colors.successTint, fg: colors.success },
  ink: { bg: colors.ink, fg: "#FFFFFF" },
  // Quick-action tints ("Familiar app" prototype `.c-lime` / `.c-butter` / `.c-lilac` / `.c-sky`), ink icons on them.
  lime: { bg: "#E2F5A0", fg: colors.ink },
  butter: { bg: "#FFEBA3", fg: colors.ink },
  lilac: { bg: "#E4DDFF", fg: colors.ink },
  sky: { bg: "#CFE7F7", fg: colors.ink },
};

/** A tinted rounded square holding an icon (`.tile`, 44px, radius 14). */
export function Tile({ icon, tone = "gray", size = 44 }: { icon: AppIconName; tone?: TileTone; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: TILE[tone].bg, alignItems: "center", justifyContent: "center" }}>
      <AppIcon name={icon} size={Math.round(size / 2)} color={TILE[tone].fg} />
    </View>
  );
}

/** White card holding rows separated by hairlines (`.card` + `.row`). Rows get their top border from their position. */
export function List({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <View style={[{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, overflow: "hidden" }, style]}>
      {items.map((child, index) => (
        <View key={child.key ?? index} style={index ? { borderTopWidth: 1, borderTopColor: colors.line } : undefined}>{child}</View>
      ))}
    </View>
  );
}

/** One row in a List: a leading tile, avatar or picture, a bold title, a grey line, and something on the right
 * (a pill, an amount, a toggle). Tappable rows end in a chevron unless `right` replaces it. */
export function Row({
  title,
  sub,
  lead,
  right,
  onPress,
  chevron,
  accessibilityLabel,
  testID,
  titleStyle,
}: {
  title: ReactNode;
  sub?: ReactNode;
  lead?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  titleStyle?: StyleProp<TextStyle>;
}) {
  const body = (
    <>
      {lead}
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        {typeof title === "string" ? <T weight="bold" style={[{ fontSize: 16, lineHeight: 21 }, titleStyle]} numberOfLines={2}>{title}</T> : title}
        {sub == null ? null : typeof sub === "string" ? <T style={{ fontSize: 14, lineHeight: 19, color: colors.inkSoft }} numberOfLines={3}>{sub}</T> : sub}
      </View>
      {right}
      {onPress && (chevron ?? !right) ? <AppIcon name="chevron" size={18} color={colors.inkFaint} /> : null}
    </>
  );
  const style: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 68, paddingHorizontal: 16, paddingVertical: 12 };
  if (!onPress) return <View testID={testID} style={style}>{body}</View>;
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [style, pressed && { backgroundColor: colors.canvas }]}>
      {body}
    </Pressable>
  );
}

export type PillTone = "ok" | "warn" | "teal" | "org" | "gray";
const PILL: Record<PillTone, { bg: string; fg: string }> = {
  ok: { bg: colors.successTint, fg: colors.success },
  warn: { bg: colors.warnTint, fg: colors.warnInk },
  teal: { bg: colors.mintTint, fg: colors.forest },
  org: { bg: colors.peach, fg: colors.accentInk },
  gray: { bg: colors.grayTint, fg: colors.grayInk },
};

/** A small status pill (`.pill`). */
export function Pill({ label, tone = "gray", icon, style }: { label: string; tone?: PillTone; icon?: AppIconName; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radii.pill, paddingHorizontal: 11, paddingVertical: 5, backgroundColor: PILL[tone].bg, alignSelf: "flex-start" }, style]}>
      {icon ? <AppIcon name={icon} size={13} color={PILL[tone].fg} strokeWidth={2.4} /> : null}
      <T weight="bold" style={{ fontSize: 13, color: PILL[tone].fg }}>{label}</T>
    </View>
  );
}

/** Chip buttons in a row (`.segb`): segments with counts, or a multi-select. */
export function Seg({ label, on, onPress, count, accessibilityLabel }: { label: string; on: boolean; onPress: () => void; count?: number; accessibilityLabel?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={accessibilityLabel ?? (count == null ? label : `${label}, ${count}`)}
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 13, borderRadius: radii.pill, borderWidth: 1.5, borderColor: on ? colors.ink : colors.line, backgroundColor: on ? colors.ink : colors.surface, flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed ? 0.85 : 1 })}
    >
      <T weight="bold" style={{ fontSize: 15, color: on ? "#FFFFFF" : colors.ink }}>{label}</T>
      {count == null ? null : <T weight="extrabold" style={{ fontSize: 13, color: on ? "#FFFFFF" : colors.inkSoft }}>{count}</T>}
    </Pressable>
  );
}

/** A radio choice card (`.choice`): title, a grey line, and a filled circle when picked. */
export function Choice({ title, sub, on, onPress, lead, multi }: { title: string; sub?: string; on: boolean; onPress: () => void; lead?: ReactNode; multi?: boolean }) {
  return (
    <Pressable
      accessibilityRole={multi ? "checkbox" : "radio"}
      accessibilityState={{ checked: on }}
      accessibilityLabel={sub ? `${title}. ${sub}` : title}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 64, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 20, borderWidth: on ? 2.5 : 1.5, borderColor: on ? colors.ink : colors.line, backgroundColor: colors.surface, opacity: pressed ? 0.9 : 1 })}
    >
      {lead}
      <View style={{ flex: 1, gap: 3 }}>
        <T weight="bold" style={{ fontSize: 16 }}>{title}</T>
        {sub ? <T style={{ fontSize: 14, lineHeight: 19, color: colors.inkSoft }}>{sub}</T> : null}
      </View>
      <View style={{ width: 24, height: 24, borderRadius: multi ? 7 : 12, borderWidth: 2, borderColor: on ? colors.ink : colors.lineStrong, backgroundColor: on ? colors.ink : "transparent", alignItems: "center", justifyContent: "center" }}>
        {on ? <AppIcon name="check" size={14} color="#FFFFFF" strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}

/** Digit boxes over a number keypad (the WhatsApp code, delivery codes, pickup codes). */
export function Keypad({ value, length, onChange }: { value: string; length: number; onChange: (next: string) => void }) {
  const t = useT("m_ui");
  const press = (key: string) => {
    if (key === "del") onChange(value.slice(0, -1));
    else if (key === "clr") onChange("");
    else if (value.length < length) onChange(value + key);
  };
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clr", "0", "del"];
  return (
    <View style={{ gap: 18 }}>
      <View accessible accessibilityLabel={t("keypad.entered", { count: value.length, total: length })} style={{ flexDirection: "row", gap: length > 4 ? 8 : 10, justifyContent: "center" }}>
        {Array.from({ length }, (_, index) => (
          <View key={index} style={{ width: length > 4 ? 46 : 56, height: 64, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: index === value.length ? colors.ink : colors.line, alignItems: "center", justifyContent: "center" }}>
            <T style={{ fontFamily: fonts.display, fontSize: 30 }}>{value[index] ?? ""}</T>
          </View>
        ))}
      </View>
      {/* Rows of three equal keys (a percentage width plus gaps can tip over 100% and wrap to two columns). */}
      {[0, 3, 6, 9].map((start) => (
        <View key={start} style={{ flexDirection: "row", gap: 10, marginTop: start ? -8 : 0 }}>
          {keys.slice(start, start + 3).map((key) => (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={key === "del" ? t("keypad.delete") : key === "clr" ? t("keypad.clear") : key}
              onPress={() => press(key)}
              style={({ pressed }) => ({ flex: 1, minHeight: 58, borderRadius: 18, backgroundColor: pressed ? colors.grayTint : colors.surface, alignItems: "center", justifyContent: "center" })}
            >
              {key === "del" ? (
                <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M9 5h11v14H9l-6-7z" />
                  <Path d="M13 9.5l5 5M18 9.5l-5 5" />
                </Svg>
              ) : (
                <T weight="bold" style={{ fontSize: key === "clr" ? 16 : 24 }}>{key === "clr" ? t("keypad.clear") : key}</T>
              )}
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

/** − n + (`.stepper`). */
export function Stepper({ value, onChange, min = 0, max = 99999, label }: { value: number; onChange: (next: number) => void; min?: number; max?: number; label: string }) {
  const t = useT("m_ui");
  const button = (delta: number) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={delta < 0 ? t("stepper.less", { label }) : t("stepper.more", { label })}
      disabled={delta < 0 ? value <= min : value >= max}
      onPress={() => onChange(Math.min(max, Math.max(min, value + delta)))}
      hitSlop={4}
      style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 })}
    >
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={2.4} strokeLinecap="round">
        <Path d={delta < 0 ? "M5 12h14" : "M12 5v14M5 12h14"} />
      </Svg>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      {button(-1)}
      <T weight="extrabold" style={{ minWidth: 30, textAlign: "center", fontSize: 17 }} accessibilityLabel={`${label}: ${value}`}>{value}</T>
      {button(1)}
    </View>
  );
}

export type TimelineStep = { label: string; at?: string | null; state: "done" | "now" | "todo" };

/** A vertical timeline (`.timeline`): green dots for done steps, an orange ring for the current one. */
export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <View>
      {steps.map((step, index) => (
        <View key={`${step.label}-${index}`} style={{ flexDirection: "row", gap: 14, minHeight: 52 }} accessible accessibilityLabel={`${step.label}${step.at ? `, ${step.at}` : ""}`}>
          <View style={{ alignItems: "center" }}>
            <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: step.state === "now" ? 7 : 2, borderColor: step.state === "done" ? colors.success : step.state === "now" ? colors.accent : colors.lineStrong, backgroundColor: step.state === "done" ? colors.success : colors.surface, alignItems: "center", justifyContent: "center" }}>
              {step.state === "done" ? <AppIcon name="check" size={14} color="#FFFFFF" strokeWidth={3} /> : null}
            </View>
            {index < steps.length - 1 ? <View style={{ width: 2, flex: 1, backgroundColor: step.state === "done" ? colors.success : colors.line }} /> : null}
          </View>
          <View style={{ flex: 1, paddingTop: 2, paddingBottom: 14 }}>
            <T weight={step.state === "todo" ? "semibold" : "bold"} style={{ fontSize: 16, color: step.state === "todo" ? colors.inkSoft : colors.ink }}>{step.label}</T>
            {step.at ? <T style={{ fontSize: 13, color: colors.inkSoft, marginTop: 2 }}>{step.at}</T> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

/** A dark ink card with a big number (money coming, sales today). */
export function DarkCard({ eyebrow, amount, line, onPress, children }: { eyebrow: string; amount: string; line?: string; onPress?: () => void; children?: ReactNode }) {
  const body = (
    <View style={{ gap: 8 }}>
      <T weight="bold" style={{ color: "rgba(255,255,255,0.72)", fontSize: 14 }}>{eyebrow}</T>
      <BigNumber color="#FFFFFF">{amount}</BigNumber>
      {line ? <T weight="bold" style={{ color: "#73D8C8", fontSize: 14, lineHeight: 20 }}>{line}</T> : null}
      {children}
    </View>
  );
  const style: ViewStyle = { backgroundColor: colors.ink, borderRadius: 24, padding: 20 };
  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${eyebrow} ${amount}${line ? `. ${line}` : ""}`} onPress={onPress} style={({ pressed }) => [style, pressed && { opacity: 0.92 }]}>
      {body}
    </Pressable>
  );
}

/** A coloured note card: amber when something needs the person, mint for good news, peach for Peggy or Rex. */
export function Banner({ title, children, tone = "warn", icon }: { title: string; children?: ReactNode; tone?: "warn" | "mint" | "peach" | "ok"; icon?: AppIconName }) {
  const palette = tone === "warn" ? TILE.warn : tone === "mint" ? TILE.mint : tone === "ok" ? TILE.ok : TILE.peach;
  return (
    <View style={{ backgroundColor: palette.bg, borderRadius: 20, padding: 16, flexDirection: "row", gap: 12 }} accessibilityRole={tone === "warn" ? "alert" : undefined}>
      {icon ? <AppIcon name={icon} size={20} color={palette.fg} /> : null}
      <View style={{ flex: 1, gap: 4 }}>
        <T weight="bold" style={{ fontSize: 16, color: tone === "warn" ? colors.ink : palette.fg }}>{title}</T>
        {typeof children === "string" ? <T style={{ fontSize: 14, lineHeight: 20, color: colors.ink }}>{children}</T> : children}
      </View>
    </View>
  );
}
