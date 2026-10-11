import { forwardRef, useEffect, useRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
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

// Building blocks for the 2026 app redesign, matching the web app's src/components/app-ui.

export const images = {
  wordmark: require("../../assets/brand/wordmark-dark.png"),
  wordmarkLight: require("../../assets/brand/wordmark-light.png"),
  markWhite: require("../../assets/brand/mark-white.png"),
  rex: require("../../assets/brand/rex.png"),
  peggy: require("../../assets/brand/peggy.png"),
  peggyWave: require("../../assets/brand/peggy-wave.png"),
};

export function T({ style, weight = "regular", children, ...props }: { style?: StyleProp<TextStyle>; weight?: keyof typeof fonts; children: ReactNode } & Omit<React.ComponentProps<typeof Text>, "style">) {
  return (
    <Text style={[{ fontFamily: fonts[weight], color: colors.ink, fontSize: 14 }, style]} {...props}>
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

export function Mascot({ name, size, label }: { name: "rex" | "peggy" | "peggyWave"; size: number; label?: string }) {
  return <Image source={images[name]} style={{ width: size, height: size }} contentFit="contain" accessibilityLabel={label ?? (name === "rex" ? "Rex" : "Peggy")} />;
}

type Tone = "ink" | "white" | "accent" | "forest";

export function PillButton({
  title,
  tone = "ink",
  size = "lg",
  busy = false,
  disabled,
  style,
  children,
  ...props
}: { title?: string; tone?: Tone; size?: "lg" | "md" | "sm"; busy?: boolean; style?: StyleProp<ViewStyle>; children?: ReactNode } & Omit<PressableProps, "style" | "children">) {
  const bg = tone === "ink" ? colors.ink : tone === "accent" ? colors.accent : tone === "forest" ? colors.forest : colors.surface;
  const fg = tone === "white" ? colors.ink : "#FFFFFF";
  const height = size === "lg" ? 58 : size === "md" ? 50 : 38;
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(off), busy }}
      disabled={off}
      style={({ pressed }) => [
        { minHeight: height, borderRadius: radii.pill, backgroundColor: bg, alignItems: "center", justifyContent: "center", paddingHorizontal: size === "sm" ? 16 : 22, flexDirection: "row", gap: 8 },
        tone === "white" && { borderWidth: 1, borderColor: colors.line },
        (pressed || off) && { opacity: off ? 0.55 : 0.85 },
        style,
      ]}
      {...props}
    >
      {busy ? <ActivityIndicator color={fg} /> : children ?? <T weight={size === "lg" ? "extrabold" : "bold"} style={{ color: fg, fontSize: size === "lg" ? 16 : size === "md" ? 15 : 13 }}>{title}</T>}
    </Pressable>
  );
}

export function LinkButton({ title, onPress, style, color = colors.ink }: { title: string; onPress: () => void; style?: StyleProp<ViewStyle>; color?: string }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} style={[{ minHeight: 44, alignItems: "center", justifyContent: "center" }, style]}>
      <T weight="bold" style={{ fontSize: 15, color }}>{title}</T>
    </Pressable>
  );
}

export function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onPress} hitSlop={6} style={styles.round}>
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M15 6l-6 6 6 6" />
      </Svg>
    </Pressable>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <T weight="bold" style={{ fontSize: 14, marginBottom: 8 }}>{children}</T>;
}

export const Field = forwardRef<TextInput, TextInputProps>(function Field({ style, ...props }, ref) {
  return <TextInput ref={ref} placeholderTextColor={colors.inkFaint} style={[styles.field, style]} {...props} />;
});

export function PhoneField({ country, onCountryPress, value, onChangeText }: { country: DialCountry; onCountryPress: () => void; value: string; onChangeText: (value: string) => void }) {
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Country code ${country.dial}, change`} onPress={onCountryPress} style={[styles.field, { minWidth: 70, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", flex: 0 }]}>
        <T weight="bold" style={{ fontSize: 15 }}>{country.dial}</T>
      </Pressable>
      <Field style={{ flex: 1 }} keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" placeholder={country.example} value={value} onChangeText={onChangeText} />
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
            <T weight="bold" style={{ color: on ? "#FFFFFF" : colors.ink }}>{option.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={{ borderRadius: radii.pill, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: on ? colors.ink : colors.surface, borderWidth: 1, borderColor: on ? colors.ink : colors.line }}
    >
      <T weight="bold" style={{ color: on ? "#FFFFFF" : colors.ink }}>{label}</T>
    </Pressable>
  );
}

/** One hidden input drives six boxes, so paste and SMS autofill work. */
export function CodeInput({ value, onChange, onComplete }: { value: string; onChange: (value: string) => void; onComplete?: (value: string) => void }) {
  const input = useRef<TextInput>(null);
  useEffect(() => {
    const timer = setTimeout(() => input.current?.focus(), 300);
    return () => clearTimeout(timer);
  }, []);
  return (
    <Pressable onPress={() => input.current?.focus()} accessibilityLabel="Verification code">
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
      <T weight="medium" style={{ color: fg, lineHeight: 21 }}>{children}</T>
    </View>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: on }} onPress={() => onChange(!on)} hitSlop={6} style={{ width: 52, height: 30, borderRadius: 15, backgroundColor: on ? colors.ink : colors.toggleOff, justifyContent: "center" }}>
      <View style={{ position: "absolute", left: on ? 25 : 3, width: 24, height: 24, borderRadius: 12, backgroundColor: "#FFFFFF" }} />
    </Pressable>
  );
}

export function ProgressBars({ total, current }: { total: number; current: number }) {
  return (
    <View style={{ flex: 1, flexDirection: "row", gap: 6 }} accessibilityLabel={`Step ${current + 1} of ${total}`}>
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
