import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon } from "@/components/icons";
import { KeyboardShift } from "@/components/KeyboardShift";
import { Mascot, Notice, PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { BUILD_STEPS, stepName } from "@/lib/seller-onboarding";
import { colors, fonts, radii, surfaceCard } from "@/theme";

// The guided build's one layout (design RB-02…RB-15): back (or ✕ on the first screens), "Step 2 of 5 · Style", Save
// (leave and come back later), the 5-part bar; Rex's chat head with one question; big visual choices; the main
// button and "✨ Let Rex choose for me" at the bottom. Rex's pick flashes "✓ Rex chose: …" for a second, then the
// screen moves on (the screen does that: onRexChoose).

export function RexHead({ size = 48 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 3, borderColor: colors.forestFill, backgroundColor: colors.mintTint, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <Mascot name="rex" size={size - 8} label="" />
    </View>
  );
}

/** Rex's question: his face, then a white bubble with the question (and one line under it). */
export function RexSays({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
      <RexHead />
      <View style={{ flex: 1, ...surfaceCard(22), borderTopLeftRadius: 8, paddingHorizontal: 16, paddingVertical: 14, gap: 4 }}>
        <T accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 22, lineHeight: 26, letterSpacing: -0.4 }}>{title}</T>
        {sub ? <T style={{ fontSize: 15.5, lineHeight: 22, color: colors.ink }}>{sub}</T> : null}
        {children}
      </View>
    </View>
  );
}

/** The 5-part bar: steps done in green, the current one orange. `current` 0 shows the plan (first part orange). */
export function StepBar({ current, total = BUILD_STEPS.length }: { current: number; total?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 6, paddingHorizontal: 18 }}>
      {Array.from({ length: total }, (_, index) => {
        const step = index + 1;
        const at = Math.max(1, current);
        const bg = step < at ? colors.successFill : step === at ? colors.accent : colors.track;
        return <View key={index} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: bg }} />;
      })}
    </View>
  );
}

export interface FrameProps {
  /** 1-5: "Step X of 5 · Name"; 0: the plan ("Build with Rex"); null: shop basics (small "2 of 3"). */
  step: number | null;
  basics?: { current: number; total: number };
  children: ReactNode;
  /** ✕ instead of the back arrow (the first screens of the build). */
  close?: boolean;
  onBack: () => void;
  onSave?: (() => void) | null;
  primary?: { title: string; onPress: () => void; busy?: boolean; disabled?: boolean; icon?: "check" | "sparkle" | "share" | "camera"; testID?: string } | null;
  /** A second button beside the main one ("Show me another"). */
  secondary?: { title: string; onPress: () => void; disabled?: boolean } | null;
  /** "✨ Let Rex choose for me" (or another link under the button: "I'll add more later", "Rewrite it"). */
  link?: { title: string; onPress: () => void; icon?: "sparkle" | "image"; testID?: string } | null;
  onRexChoose?: (() => void) | null;
  /** "✓ Rex chose: Soft and calm", shown for a second before the next screen. */
  flash?: string | null;
  error?: string | null;
  /** "Welcome back, Ada…" on the screen the app reopened on. */
  notice?: string | null;
  footerExtra?: ReactNode;
  scroll?: boolean;
}

export function RexFrame({ step, basics, children, close, onBack, onSave, primary, secondary, link, onRexChoose, flash, error, notice, footerExtra, scroll = true }: FrameProps) {
  const t = useT("m_rexBuild");
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!flash) return;
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [flash, fade]);

  const title = step === null ? (basics ? t("frame.basics", basics) : "") : step === 0 ? t("frame.build") : t("frame.step", { current: step, total: BUILD_STEPS.length, name: t(`step.${stepName(step)}`) });
  const body = (
    <View style={{ gap: 18 }}>
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {children}
    </View>
  );
  const chooser = onRexChoose ? { title: t("frame.rexChoose"), onPress: onRexChoose, icon: "sparkle" as const, testID: "rex-choose" } : null;
  const under = link ?? chooser;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "bottom"]}>
      <KeyboardShift>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingTop: 4, minHeight: 52 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={close ? t("frame.close") : t("frame.back")} onPress={onBack} hitSlop={6} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }} testID="rex-back">
            <AppIcon name={close ? "x" : "arrowLeft"} size={24} color={colors.ink} />
          </Pressable>
          <T weight="semibold" numberOfLines={1} style={{ flex: 1, textAlign: "center", fontSize: 15, color: colors.inkSoft }}>{title}</T>
          {onSave ? (
            <Pressable accessibilityRole="button" onPress={onSave} hitSlop={8} style={{ minWidth: 48, minHeight: 48, alignItems: "flex-end", justifyContent: "center", paddingHorizontal: 8 }} testID="rex-save">
              <T weight="bold" style={{ fontSize: 15, color: colors.inkSoft }}>{t("frame.save")}</T>
            </Pressable>
          ) : (
            <View style={{ width: 48 }} />
          )}
        </View>
        {step !== null ? <StepBar current={step} /> : basics ? <StepBar current={basics.current} total={basics.total} /> : null}
        {scroll ? (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 20, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
            {body}
          </ScrollView>
        ) : (
          <View style={{ flex: 1, paddingHorizontal: 18, paddingTop: 20 }}>{body}</View>
        )}
        <View style={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: 8, gap: 6, backgroundColor: colors.canvas }}>
          {flash ? (
            <Animated.View accessibilityLiveRegion="polite" style={{ opacity: fade, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.forestFill, borderRadius: radii.pill, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 6 }}>
              <AppIcon name="check" size={16} color="#FFFFFF" strokeWidth={2.6} />
              <T weight="bold" style={{ color: "#FFFFFF", fontSize: 15 }}>{t("frame.rexChose", { choice: flash })}</T>
            </Animated.View>
          ) : null}
          {error ? <Notice>{error}</Notice> : null}
          {footerExtra}
          {secondary || primary ? (
            <View style={{ flexDirection: "row", gap: 10 }}>
              {secondary ? <PillButton tone="white" title={secondary.title} disabled={secondary.disabled || Boolean(flash)} onPress={secondary.onPress} style={{ flex: 1 }} /> : null}
              {primary ? <PillButton tone="accent" title={primary.title} icon={primary.icon} busy={primary.busy} disabled={primary.disabled || Boolean(flash)} onPress={primary.onPress} style={{ flex: 1 }} testID={primary.testID ?? "rex-primary"} /> : null}
            </View>
          ) : null}
          {under ? (
            <Pressable accessibilityRole="button" onPress={under.onPress} disabled={Boolean(flash)} testID={under.testID} hitSlop={6} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <AppIcon name={under.icon ?? "sparkle"} size={17} color={colors.forest} />
              <T weight="bold" style={{ color: colors.forest, fontSize: 16 }}>{under.title}</T>
            </Pressable>
          ) : null}
        </View>
      </KeyboardShift>
    </SafeAreaView>
  );
}
