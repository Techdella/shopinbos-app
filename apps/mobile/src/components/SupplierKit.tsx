import type { ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import Svg, { Path } from "react-native-svg";
import { Small, Sub, Title } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { colors, themed } from "@/theme";
import { KeyboardShift } from "@/components/KeyboardShift";

// Supplier-only pieces of the "Simple app, end to end" supplier prototype (E2E-Supplier) that the shared
// components/design.tsx doesn't have: the set-up frame ("‹" and "1 of 4"), the big green tick screen, the two
// round −/+ buttons on a product row, and the tinted note cards on an order.

/** A set-up step (`.scr.flow` with `.hdr`): a round back button and "1 of 4", a big title, the body, a pinned footer. */
export function FlowFrame({ step, onBack, title, sub, children, footer, aside }: { step?: string; onBack?: () => void; title?: string; sub?: string; children?: ReactNode; footer?: ReactNode; aside?: ReactNode }) {
  const t = useT("common");
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <KeyboardShift>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32, gap: 20, flexGrow: 1 }}>
          {onBack || step ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 46 }}>
              {onBack ? (
                <Pressable accessibilityRole="button" accessibilityLabel={t("back")} onPress={onBack} hitSlop={6} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1 })}>
                  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M15 5l-7 7 7 7" />
                  </Svg>
                </Pressable>
              ) : null}
              {step ? <Small style={{ flex: 1 }}>{step}</Small> : null}
              {aside ? <View style={{ marginLeft: "auto" }}>{aside}</View> : null}
            </View>
          ) : null}
          {title || sub ? (
            <View style={{ gap: 8 }}>
              {title ? <Title>{title}</Title> : null}
              {sub ? <Sub>{sub}</Sub> : null}
            </View>
          ) : null}
          {children}
        </ScrollView>
        {footer ? <View style={{ paddingHorizontal: 20, paddingBottom: 12, paddingTop: 10, gap: 10, backgroundColor: colors.canvas }}>{footer}</View> : null}
      </KeyboardShift>
    </SafeAreaView>
  );
}

/** The green tick, a big title and one line (`.center` + `.check`): "Price sent", "You're in!". */
export function DoneView({ title, sub, footer }: { title: string; sub?: string; footer?: ReactNode }) {
  return (
    <FlowFrame footer={footer}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingTop: 60 }}>
        <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: colors.successFill, alignItems: "center", justifyContent: "center" }}>
          <AppIcon name="check" size={44} color="#FFFFFF" strokeWidth={3} />
        </View>
        <Title style={{ textAlign: "center" }}>{title}</Title>
        {sub ? <Sub style={{ textAlign: "center" }}>{sub}</Sub> : null}
      </View>
    </FlowFrame>
  );
}

function RoundButton({ minus, label, onPress, disabled }: { minus?: boolean; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : pressed ? 0.7 : 1 })}
    >
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={2.4} strokeLinecap="round">
        <Path d={minus ? "M5 12h14" : "M12 5v14M5 12h14"} />
      </Svg>
    </Pressable>
  );
}

/** One less / one more (`.stepper` on a product row): just the two buttons, the number is in the row's grey line. */
export function PlusMinus({ value, onChange, lessLabel, moreLabel }: { value: number; onChange: (next: number) => void; lessLabel: string; moreLabel: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      <RoundButton minus label={lessLabel} disabled={value <= 0} onPress={() => onChange(Math.max(0, value - 1))} />
      <RoundButton label={moreLabel} onPress={() => onChange(value + 1)} />
    </View>
  );
}

const NOTE = themed(() => ({
  mint: { bg: colors.mintTint, title: colors.ink, body: colors.forest },
  peach: { bg: colors.peach, title: colors.ink, body: colors.accentInk },
  ok: { bg: colors.successTint, title: colors.success, body: colors.inkSoft },
  gray: { bg: colors.grayTint, title: colors.ink, body: colors.ink },
  warn: { bg: colors.warnTint, title: colors.ink, body: colors.warnInk },
} as const));

/** A tinted card with a bold line and a sentence ("Musa is coming to pick up", "On its way"). */
export function NoteCard({ tone, title, children }: { tone: keyof typeof NOTE; title?: string; children?: ReactNode }) {
  const palette = NOTE[tone];
  return (
    <View style={{ backgroundColor: palette.bg, borderRadius: 24, padding: 18, gap: 6 }}>
      {title ? <T weight="extrabold" style={{ fontSize: 17, color: palette.title }}>{title}</T> : null}
      {typeof children === "string" ? <T style={{ fontSize: 16, lineHeight: 24, color: palette.body }}>{children}</T> : children}
    </View>
  );
}

/** The prototype's lilac chat tile (design.tsx's Tile has no lilac tone). */
export function ChatTile() {
  return (
    <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: "#E7E1FF", alignItems: "center", justifyContent: "center" }}>
      <AppIcon name="chat" size={22} color="#5B3FD6" />
    </View>
  );
}

/** A product or parcel picture with the prototype's rounder corners (`.thumb`), or a soft box. */
export function Pic({ uri, size = 52, radius = 14 }: { uri?: string | null; size?: number; radius?: number }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: radius, backgroundColor: colors.grayTint }} contentFit="cover" accessibilityIgnoresInvertColors />;
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: colors.grayTint, alignItems: "center", justifyContent: "center" }}>
      <AppIcon name="box" size={Math.round(size * 0.42)} color={colors.inkSoft} />
    </View>
  );
}

/** Form label above a field or chips (`.lbl`). */
export function FieldLabel({ children }: { children: ReactNode }) {
  return <T weight="bold" style={{ fontSize: 15, marginBottom: 8 }}>{children}</T>;
}
