import { forwardRef, useEffect, useRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Image } from "expo-image";
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import { OTP_LENGTH, type DialCountry } from "@shared/phone";
import { washStops } from "@shared/tokens";
import { colors, fonts, radii } from "@/theme";
import { AppIcon, type AppIconName } from "@/components/icons";
import { Mascot as SharedMascot, type MascotMood, type MascotWho } from "@/components/Mascot";
import { useT } from "@/lib/i18n";

// Building blocks for the 2026 app redesign, matching the web app's src/components/app-ui.

export const images = {
  wordmark: require("../../assets/brand/wordmark-dark.png"),
  wordmarkLight: require("../../assets/brand/wordmark-light.png"),
  markWhite: require("../../assets/brand/mark-white.png"),
};

export function T({ style, weight = "regular", children, ...props }: { style?: StyleProp<TextStyle>; weight?: keyof typeof fonts; children: ReactNode } & Omit<React.ComponentProps<typeof Text>, "style">) {
  return (
    <Text style={[{ fontFamily: fonts[weight], color: colors.ink, fontSize: 15 }, style]} {...props}>
      {children}
    </Text>
  );
}

/** The pastel wash behind the welcome and "shop is live" screens. */
export function Wash() {
  return (
    <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id="peach" cx="0" cy="0" rx="120" ry="80" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={washStops.peach} stopOpacity="1" />
          <Stop offset="0.55" stopColor={washStops.peach} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="lilac" cx="100" cy="0" rx="90" ry="70" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={washStops.lilac} stopOpacity="1" />
          <Stop offset="0.6" stopColor={washStops.lilac} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="mint" cx="60" cy="40" rx="80" ry="60" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={washStops.mint} stopOpacity="1" />
          <Stop offset="0.7" stopColor={washStops.mint} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect width="100" height="100" fill={colors.canvas} />
      <Rect width="100" height="100" fill="url(#mint)" />
      <Rect width="100" height="100" fill="url(#lilac)" />
      <Rect width="100" height="100" fill="url(#peach)" />
    </Svg>
  );
}

export function Wordmark({ height = 18, light = false }: { height?: number; light?: boolean }) {
  return <Image source={light ? images.wordmarkLight : images.wordmark} style={{ height, width: height * (660 / 63) }} contentFit="contain" accessibilityLabel="Shopinbos" />;
}

/** Rex or Peggy: wraps the shared <Mascot> (components/Mascot.tsx) for older call sites. `peggyWave` is Peggy's wave
 * mood; an empty `label` makes it decorative. */
export function Mascot({ name, who, mood, size, label, style }: { name?: "rex" | "peggy" | "peggyWave"; who?: MascotWho; mood?: MascotMood; size: number; label?: string; style?: StyleProp<ViewStyle> }) {
  const mascot: MascotWho = who ?? (name === "rex" ? "rex" : "peggy");
  return <SharedMascot who={mascot} mood={mood ?? (name === "peggyWave" ? "wave" : "idle")} size={size} decorative={label === ""} label={label || undefined} style={style} />;
}

type Tone = "ink" | "white" | "accent" | "forest";
type PillSize = "lg" | "md" | "sm";

// One type style for every button label on the phone, like the web's PILL_BASE (src/components/app-ui): bold (700),
// one line, a small size scale. A label too long for its row shrinks a little (to 80%) and then ends in "…"; it never
// wraps onto a second line or pushes the button (or its neighbours) off the screen, and the icon stays whole.
export const BUTTON_TEXT: Record<PillSize, number> = { lg: 16, md: 15, sm: 14 };
/** lg is the one main button per screen: full width, 56 tall (build spec 8A). Nothing is under 48. */
export const BUTTON_HEIGHT: Record<PillSize, number> = { lg: 56, md: 50, sm: 48 };
const BUTTON_ICON: Record<PillSize, number> = { lg: 20, md: 18, sm: 16 };

/** The ink or white a label takes on a button of this tone (orange buttons carry ink text: white on orange fails contrast). */
export function buttonInk(tone: Tone = "ink") {
  return tone === "white" || tone === "accent" ? colors.ink : "#FFFFFF";
}

/** A one-line button label: bold, shrinks a little instead of wrapping on small phones, then ends in "…". */
export function OneLine({ text, color = colors.ink, size = BUTTON_TEXT.lg, style }: { text: string; color?: string; size?: number; style?: StyleProp<TextStyle> }) {
  return (
    <T weight="bold" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[{ fontSize: size, color, flexShrink: 1, textAlign: "center" }, style]}>
      {text}
    </T>
  );
}

/** A pill button. Give it a `title` (and an `icon`) so the label keeps the one style; `children` replace both. */
export function PillButton({
  title,
  icon,
  tone = "ink",
  size = "lg",
  busy = false,
  disabled,
  style,
  children,
  ...props
}: { title?: string; icon?: AppIconName; tone?: Tone; size?: PillSize; busy?: boolean; style?: StyleProp<ViewStyle>; children?: ReactNode } & Omit<PressableProps, "style" | "children">) {
  const bg = tone === "ink" ? colors.ink : tone === "accent" ? colors.accent : tone === "forest" ? colors.forest : colors.surface;
  const fg = buttonInk(tone);
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(off), busy }}
      disabled={off}
      style={({ pressed }) => [
        { minHeight: BUTTON_HEIGHT[size], maxWidth: "100%", flexShrink: 1, borderRadius: radii.pill, backgroundColor: bg, alignItems: "center", justifyContent: "center", paddingHorizontal: size === "sm" ? 16 : 20, flexDirection: "row", gap: 8 },
        tone === "white" && { borderWidth: 1.5, borderColor: colors.line },
        (pressed || off) && { opacity: off ? 0.55 : 0.85 },
        style,
      ]}
      {...props}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        children ?? (
          <>
            {icon ? <View style={{ flexShrink: 0 }}><AppIcon name={icon} size={BUTTON_ICON[size]} color={fg} /></View> : null}
            {title ? <OneLine text={title} color={fg} size={BUTTON_TEXT[size]} /> : null}
          </>
        )
      )}
    </Pressable>
  );
}

/**
 * Buttons side by side while every label fits at that width, else one under the other at full width (Yoruba, often
 * the longest, usually stacks). Pass the labels shown; each button sets style={{ flex: 1 }}. `primaryLast`: the main
 * button is the last in the row, so it goes on top when they stack.
 */
export function ButtonRow({ labels, size = "md", icons = false, primaryLast = false, gap = 10, style, children }: { labels: string[]; size?: PillSize; icons?: boolean; primaryLast?: boolean; gap?: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const { width } = useWindowDimensions();
  const count = Math.max(1, labels.length);
  // The screen's 20px sides and a card's padding, then each button's own padding (and icon).
  const room = (Math.min(width, 600) - 72 - gap * (count - 1)) / count - (size === "sm" ? 32 : 40) - (icons ? BUTTON_ICON[size] + 8 : 0);
  const fits = labels.every((label) => label.length * BUTTON_TEXT[size] * 0.6 <= room);
  return <View style={[fits ? { flexDirection: "row", gap } : { flexDirection: primaryLast ? "column-reverse" : "column", gap }, style]}>{children}</View>;
}

export function LinkButton({ title, onPress, style, color = colors.ink, testID }: { title: string; onPress: () => void; style?: StyleProp<ViewStyle>; color?: string; testID?: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" onPress={onPress} hitSlop={8} style={[{ minHeight: 44, alignItems: "center", justifyContent: "center" }, style]}>
      <T weight="bold" style={{ fontSize: 15, color, textAlign: "center" }}>{title}</T>
    </Pressable>
  );
}

export function BackButton({ onPress }: { onPress: () => void }) {
  const t = useT("common");
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t("back")} onPress={onPress} hitSlop={6} style={styles.round}>
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M15 6l-6 6 6 6" />
      </Svg>
    </Pressable>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <T weight="bold" style={{ fontSize: 15, marginBottom: 8 }}>{children}</T>;
}

export const Field = forwardRef<TextInput, TextInputProps>(function Field({ style, ...props }, ref) {
  return <TextInput ref={ref} placeholderTextColor={colors.inkFaint} style={[styles.field, style]} {...props} />;
});

export function PhoneField({ country, onCountryPress, value, onChangeText }: { country: DialCountry; onCountryPress: () => void; value: string; onChangeText: (value: string) => void }) {
  const t = useT("m_ui");
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={t("phone.countryCode", { dial: country.dial })} onPress={onCountryPress} style={[styles.field, { minWidth: 70, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", flex: 0 }]}>
        <T weight="bold" style={{ fontSize: 15 }}>{country.dial}</T>
      </Pressable>
      <Field style={{ flex: 1, minWidth: 0 }} keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" placeholder={country.example} value={value} onChangeText={onChangeText} />
    </View>
  );
}

export function Segmented<V extends string>({ options, value, onChange }: { options: { value: V; label: string }[]; value: V; onChange: (value: V) => void }) {
  return (
    <View style={{ flexDirection: "row", backgroundColor: colors.surface, borderRadius: radii.pill, padding: 4 }} accessibilityRole="tablist">
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(option.value)}
            style={{ flex: 1, minHeight: 42, borderRadius: radii.pill, backgroundColor: on ? colors.ink : "transparent", alignItems: "center", justifyContent: "center" }}
          >
            <T weight="bold" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ color: on ? "#FFFFFF" : colors.ink, paddingHorizontal: 8 }}>{option.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, on, onPress, disabled }: { label: string; on: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on, disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={{ maxWidth: "100%", borderRadius: radii.pill, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: on ? colors.ink : colors.surface, borderWidth: 1, borderColor: on ? colors.ink : colors.line, borderStyle: disabled ? "dashed" : "solid", opacity: disabled ? 0.45 : 1 }}
    >
      <T weight="bold" numberOfLines={1} style={{ color: on ? "#FFFFFF" : colors.ink, fontSize: 15 }}>{label}</T>
    </Pressable>
  );
}

/** One hidden input drives six boxes, so paste and SMS autofill work. */
export function CodeInput({ value, onChange, onComplete }: { value: string; onChange: (value: string) => void; onComplete?: (value: string) => void }) {
  const t = useT("m_ui");
  const input = useRef<TextInput>(null);
  useEffect(() => {
    const timer = setTimeout(() => input.current?.focus(), 300);
    return () => clearTimeout(timer);
  }, []);
  return (
    <Pressable onPress={() => input.current?.focus()} accessibilityLabel={t("code.label")}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        {Array.from({ length: OTP_LENGTH }, (_, index) => {
          const digit = value[index] ?? "";
          const active = index === Math.min(value.length, OTP_LENGTH - 1);
          return (
            <View key={index} style={[styles.codeBox, { borderColor: active ? colors.ink : digit ? colors.lineStrong : colors.line }]}>
              <T weight="extrabold" style={{ fontSize: 24 }}>{digit}</T>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={input}
        value={value}
        onChangeText={(text) => {
          const clean = text.replace(/\D/g, "").slice(0, OTP_LENGTH);
          onChange(clean);
          if (clean.length === OTP_LENGTH) onComplete?.(clean);
        }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={OTP_LENGTH}
        style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
      />
    </Pressable>
  );
}

export function Notice({ tone = "error", children }: { tone?: "error" | "info" | "success"; children: ReactNode }) {
  const bg = tone === "error" ? colors.dangerTint : tone === "success" ? colors.successTint : colors.mintTint;
  const fg = tone === "error" ? colors.danger : tone === "success" ? colors.success : colors.forest;
  return (
    <View accessibilityRole={tone === "error" ? "alert" : undefined} style={{ backgroundColor: bg, borderRadius: radii.field, paddingHorizontal: 16, paddingVertical: 12 }}>
      <T weight="medium" style={{ color: fg, fontSize: 15, lineHeight: 22 }}>{children}</T>
    </View>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: on }} onPress={() => onChange(!on)} hitSlop={6} style={{ width: 52, height: 32, borderRadius: 16, backgroundColor: on ? colors.success : colors.toggleOff, justifyContent: "center" }}>
      <View style={{ position: "absolute", left: on ? 23 : 3, width: 26, height: 26, borderRadius: 13, backgroundColor: "#FFFFFF" }} />
    </Pressable>
  );
}

export function ProgressBars({ total, current }: { total: number; current: number }) {
  const t = useT("m_ui");
  return (
    <View style={{ flex: 1, flexDirection: "row", gap: 6 }} accessibilityLabel={t("progress.step", { current: current + 1, total })}>
      {Array.from({ length: total }, (_, index) => (
        <View key={index} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: index <= current ? colors.ink : colors.track }} />
      ))}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 16 }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  field: { height: 54, borderRadius: radii.field, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 16, fontSize: 16, fontFamily: fonts.regular, color: colors.ink },
  codeBox: { flex: 1, maxWidth: 56, height: 64, borderRadius: radii.field, borderWidth: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
});
