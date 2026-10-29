import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { AppIcon, type AppIconName } from "@/components/icons";
import { TILE, type TileTone } from "@/components/design";
import { OneLine, T } from "@/components/ui";
import { barHeights, pageAt, type RatingSummary } from "@/lib/visual-pure";
import { colors, CARD_RADIUS, currentScheme, fonts, surfaceCard } from "@/theme";

// Soft-card building blocks borrowed from the owner's UI boards (layout only; Shopinbos's own colours from the live
// `colors`, so every one follows light and dark mode): a big-number stat card with a mini bar chart, round icon
// buttons with a label under them, round category tiles, a promo carousel with dots, a ratings summary with star
// bars, and "before you start" check tiles. Pure maths in lib/visual-pure.ts.

/** The mint used for highlights on dark (ink) cards: the brand mint, readable on the navy/ink fill in both schemes. */
const MINT = "#73D8C8";

/**
 * A compact bar chart (react-native-svg): one rounded bar per value, the `highlight` bar (today) in the strong
 * colour, the rest soft, and a short label under each. `dark`: drawn on an ink/forest card. The whole chart is one
 * accessible element; pass what it says in `accessibilityLabel`.
 */
export function MiniBars({ values, labels, highlight = values.length - 1, height = 64, dark = false, accessibilityLabel }: { values: readonly number[]; labels?: readonly string[]; highlight?: number; height?: number; dark?: boolean; accessibilityLabel: string }) {
  const [width, setWidth] = useState(0);
  const count = Math.max(1, values.length);
  const gap = count > 10 ? 4 : 8;
  const barWidth = width > 0 ? Math.max(4, (width - gap * (count - 1)) / count) : 0;
  const heights = barHeights(values, height);
  const strong = dark ? MINT : colors.forestFill;
  const soft = dark ? "rgba(255,255,255,0.16)" : currentScheme() === "dark" ? colors.mintTint : "rgba(12,74,68,0.16)";
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={{ gap: 6 }}>
      <View style={{ height }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            {heights.map((h, index) => (
              <Rect key={index} x={index * (barWidth + gap)} y={height - h} width={barWidth} height={h} rx={Math.min(8, barWidth / 2)} fill={index === highlight ? strong : soft} />
            ))}
          </Svg>
        ) : null}
      </View>
      {labels ? (
        <View style={{ flexDirection: "row", gap }}>
          {labels.map((label, index) => (
            <T key={index} weight={index === highlight ? "extrabold" : "semibold"} numberOfLines={1} style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: 11, color: dark ? (index === highlight ? "#FFFFFF" : "rgba(255,255,255,0.62)") : index === highlight ? colors.ink : colors.inkSoft }}>
              {label}
            </T>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * A big-number card ("560 Steps"): a small label, the big figure, a grey (or mint, on dark) line, and an optional
 * chart under it. `tone="dark"` is the ink card for the one main number on a screen.
 */
export function StatCard({ label, value, line, chart, tone = "surface", icon, onPress, accessibilityLabel, testID, style }: { label: string; value: string; line?: string | null; chart?: ReactNode; tone?: "surface" | "dark" | "forest"; icon?: AppIconName; onPress?: () => void; accessibilityLabel?: string; testID?: string; style?: StyleProp<ViewStyle> }) {
  const dark = tone !== "surface";
  const box: ViewStyle = dark ? { backgroundColor: tone === "forest" ? colors.forestFill : colors.inkFill, borderRadius: CARD_RADIUS, padding: 20, gap: 14 } : { ...surfaceCard(), padding: 18, gap: 14 };
  const body = (
    <>
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {icon ? (
            <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: dark ? "rgba(255,255,255,0.14)" : colors.mintTint }}>
              <AppIcon name={icon} size={15} color={dark ? MINT : colors.forest} />
            </View>
          ) : null}
          <T weight="bold" numberOfLines={1} style={{ flex: 1, fontSize: 14, color: dark ? "rgba(255,255,255,0.74)" : colors.inkSoft }}>{label}</T>
          {onPress ? <AppIcon name="chevron" size={18} color={dark ? "rgba(255,255,255,0.6)" : colors.inkFaint} /> : null}
        </View>
        <T numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontFamily: fonts.display, fontSize: 40, lineHeight: 44, letterSpacing: -1.2, color: dark ? "#FFFFFF" : colors.ink }}>{value}</T>
        {line ? <T weight="bold" style={{ fontSize: 14, lineHeight: 20, color: dark ? MINT : colors.inkSoft }}>{line}</T> : null}
      </View>
      {chart}
    </>
  );
  if (!onPress) return <View testID={testID} style={[box, style]}>{body}</View>;
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? [label, value, line].filter(Boolean).join(". ")} onPress={onPress} style={({ pressed }) => [box, pressed && { opacity: 0.92 }, style]}>
      {body}
    </Pressable>
  );
}

/** A small tinted number card that sits two to a row (today / this month). */
export function MiniStat({ label, value, line, tone = "mint" }: { label: string; value: string; line?: string; tone?: TileTone }) {
  return (
    <View style={{ flex: 1, minWidth: 0, backgroundColor: TILE[tone].bg, borderRadius: 22, padding: 16, gap: 4 }} accessible accessibilityLabel={[label, value, line].filter(Boolean).join(", ")}>
      <T weight="semibold" numberOfLines={1} style={{ fontSize: 13, color: colors.inkSoft }}>{label}</T>
      <T numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontFamily: fonts.display, fontSize: 24, lineHeight: 28, color: colors.ink }}>{value}</T>
      {line ? <T weight="semibold" numberOfLines={1} style={{ fontSize: 12.5, color: colors.inkSoft }}>{line}</T> : null}
    </View>
  );
}

/** `glass` and `light` sit on a dark panel (the Peggy call screen): see-through white, or solid white when switched on. */
export type RoundTone = "primary" | "secondary" | "accept" | "decline" | "whatsapp" | "glass" | "light";

const ROUND: Record<RoundTone, () => { bg: string; fg: string; border?: string }> = {
  primary: () => ({ bg: colors.inkFill, fg: "#FFFFFF" }),
  secondary: () => ({ bg: colors.surface, fg: colors.ink, border: colors.line }),
  accept: () => ({ bg: colors.successFill, fg: "#FFFFFF" }),
  decline: () => ({ bg: colors.dangerFill, fg: "#FFFFFF" }),
  whatsapp: () => ({ bg: colors.whatsapp, fg: "#0B3B24" }),
  glass: () => ({ bg: "rgba(255,255,255,0.16)", fg: "#FFFFFF" }),
  light: () => ({ bg: "#FFFFFF", fg: "#0E2A38" }),
};

/**
 * A round icon button with its label under it (call / WhatsApp / message, accept / decline). The label is one line
 * and shrinks a little before it ends in "…"; the circle is at least 56 so it's easy to hit. `onDark`: white label
 * for a dark panel.
 */
export function RoundAction({ icon, label, tone = "secondary", size = 56, onPress, disabled, onDark = false, testID, accessibilityLabel }: { icon: AppIconName; label: string; tone?: RoundTone; size?: number; onPress: () => void; disabled?: boolean; onDark?: boolean; testID?: string; accessibilityLabel?: string }) {
  const look = ROUND[tone]();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({ flex: 1, minWidth: 0, alignItems: "center", gap: 8, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 })}
    >
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: look.bg, alignItems: "center", justifyContent: "center", borderWidth: look.border ? 1 : 0, borderColor: look.border, ...(tone === "secondary" ? surfaceCard(size / 2) : null) }}>
        <AppIcon name={icon} size={Math.round(size * 0.4)} color={look.fg} />
      </View>
      <OneLine text={label} size={13} color={onDark ? "#FFFFFF" : colors.ink} />
    </Pressable>
  );
}

/** A row of round actions, evenly spread. */
export function RoundActions({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: "row", justifyContent: "space-around", gap: 8 }, style]}>{children}</View>;
}

/** A round coloured icon tile with its label under it (Fashion / Electronics / Sports). `on`: picked. */
export function CategoryCircle({ icon, label, tone = "gray", on = false, onPress, size = 60, badge, testID }: { icon: AppIconName; label: string; tone?: TileTone; on?: boolean; onPress: () => void; size?: number; badge?: string | null; testID?: string }) {
  const tile = TILE[tone];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={badge ? `${label}, ${badge}` : label}
      onPress={onPress}
      style={({ pressed }) => ({ width: size + 24, alignItems: "center", gap: 8, opacity: pressed ? 0.8 : 1 })}
    >
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: on ? colors.inkFill : tile.bg, alignItems: "center", justifyContent: "center", borderWidth: on ? 0 : 0 }}>
        <AppIcon name={icon} size={Math.round(size * 0.4)} color={on ? "#FFFFFF" : tile.fg} />
        {badge ? (
          <View style={{ position: "absolute", top: -4, right: -10, borderRadius: 9, paddingHorizontal: 6, height: 18, justifyContent: "center", backgroundColor: colors.successTint, borderWidth: 2, borderColor: colors.canvas }}>
            <T weight="extrabold" numberOfLines={1} style={{ fontSize: 10, color: colors.success }}>{badge}</T>
          </View>
        ) : null}
      </View>
      <T weight={on ? "extrabold" : "bold"} numberOfLines={2} style={{ fontSize: 12.5, lineHeight: 16, textAlign: "center", color: colors.ink }}>{label}</T>
    </Pressable>
  );
}

export type PromoSlide = { key: string; testID?: string; eyebrow?: string; title: string; body?: string; cta?: string; icon?: AppIconName; tone?: "ink" | "forest" | "mint" | "peach"; onPress?: () => void; art?: ReactNode };

/** Promo banners that swipe sideways, one per page, with dots under them (the lit dot follows the swipe). */
export function PromoCarousel({ slides, label, testID }: { slides: readonly PromoSlide[]; label: string; testID?: string }) {
  const { width: screen } = useWindowDimensions();
  const pageWidth = Math.min(screen, 600) - 40;
  const [page, setPage] = useState(0);
  if (!slides.length) return null;
  return (
    <View style={{ gap: 10 }} testID={testID}>
      <ScrollView
        horizontal
        pagingEnabled={false}
        snapToInterval={pageWidth + 12}
        decelerationRate="fast"
        disableIntervalMomentum
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -20, flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
        scrollEventThrottle={32}
        onScroll={(event) => setPage(pageAt(event.nativeEvent.contentOffset.x, pageWidth + 12, slides.length))}
        accessibilityLabel={label}
      >
        {slides.map((slide) => <Promo key={slide.key} slide={slide} width={pageWidth} />)}
      </ScrollView>
      {slides.length > 1 ? (
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 6 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {slides.map((slide, index) => (
            <View key={slide.key} style={{ width: index === page ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: index === page ? colors.inkFill : colors.lineStrong }} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Promo({ slide, width }: { slide: PromoSlide; width: number }) {
  const tone = slide.tone ?? "ink";
  const dark = tone === "ink" || tone === "forest";
  const bg = tone === "ink" ? colors.inkFill : tone === "forest" ? colors.forestFill : tone === "mint" ? colors.mintTint : colors.peach;
  const ink = dark ? "#FFFFFF" : colors.ink;
  const body = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        {slide.eyebrow ? <T weight="extrabold" numberOfLines={1} style={{ fontSize: 12, letterSpacing: 0.8, textTransform: "uppercase", color: dark ? MINT : colors.forest }}>{slide.eyebrow}</T> : null}
        <T numberOfLines={3} style={{ fontFamily: fonts.display, fontSize: 18, lineHeight: 23, letterSpacing: -0.2, color: ink }}>{slide.title}</T>
        {slide.body ? <T numberOfLines={3} style={{ fontSize: 14, lineHeight: 19, color: dark ? "rgba(255,255,255,0.78)" : colors.inkSoft }}>{slide.body}</T> : null}
        {slide.cta ? (
          <View style={{ alignSelf: "flex-start", marginTop: 4, minHeight: 36, maxWidth: "100%", paddingHorizontal: 14, borderRadius: 999, backgroundColor: dark ? "#FFFFFF" : colors.inkFill, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <OneLine text={slide.cta} size={13.5} color={dark ? "#16141F" : "#FFFFFF"} />
          </View>
        ) : null}
      </View>
      {slide.art ?? (slide.icon ? (
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: dark ? "rgba(255,255,255,0.12)" : colors.surface, alignItems: "center", justifyContent: "center" }}>
          <AppIcon name={slide.icon} size={28} color={dark ? MINT : colors.forest} />
        </View>
      ) : null)}
    </View>
  );
  const box: ViewStyle = { width, minHeight: 132, borderRadius: CARD_RADIUS, padding: 18, backgroundColor: bg, justifyContent: "center" };
  if (!slide.onPress) return <View testID={slide.testID} style={box}>{body}</View>;
  return (
    <Pressable testID={slide.testID} accessibilityRole="button" accessibilityLabel={[slide.title, slide.body].filter(Boolean).join(". ")} onPress={slide.onPress} style={({ pressed }) => [box, pressed && { opacity: 0.92 }]}>
      {body}
    </Pressable>
  );
}

/** ★★★★☆ for a rating (whole stars, rounded). */
export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const whole = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <View style={{ flexDirection: "row", gap: 1 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[0, 1, 2, 3, 4].map((index) => (
        <T key={index} style={{ fontSize: size, lineHeight: size + 3, color: index < whole ? "#F2A93B" : colors.lineStrong }}>★</T>
      ))}
    </View>
  );
}

/** "4.4 ★ · 32 ratings" big, with the 5→1 star bars beside it when every rating is at hand. */
export function RatingSummaryCard({ title, summary, countLabel, accessibilityLabel, children }: { title: string; summary: RatingSummary; countLabel: string; accessibilityLabel: string; children?: ReactNode }) {
  if (!summary.average) return null;
  return (
    <View style={{ ...surfaceCard(), padding: 18, gap: 14 }}>
      <T weight="extrabold" style={{ fontSize: 15 }}>{title}</T>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }} accessible accessibilityLabel={accessibilityLabel}>
        {/* With bars: the number over its stars and count. Without: the stars and count beside the number. */}
        <View style={{ flexDirection: summary.bars ? "column" : "row", alignItems: summary.bars ? "flex-start" : "center", gap: summary.bars ? 4 : 14 }}>
          <T style={{ fontFamily: fonts.display, fontSize: 44, lineHeight: 46, letterSpacing: -1.2 }}>{summary.average}</T>
          <View style={{ gap: 4 }}>
            <Stars value={Number(summary.average)} size={summary.bars ? 14 : 18} />
            <T weight="semibold" numberOfLines={1} style={{ fontSize: 12.5, color: colors.inkSoft }}>{countLabel}</T>
          </View>
        </View>
        {summary.bars ? (
          <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
            {summary.bars.map((bar) => (
              <View key={bar.stars} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <T weight="bold" style={{ width: 12, fontSize: 12, color: colors.inkSoft, textAlign: "right" }}>{String(bar.stars)}</T>
                <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.track, overflow: "hidden" }}>
                  <View style={{ width: `${Math.round(bar.share * 100)}%`, height: 6, borderRadius: 3, backgroundColor: "#F2A93B" }} />
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** A "Before you start" tile: an icon, a label, and a tick when it's done (a ring when it isn't). Two to a row. */
export function CheckTile({ icon, label, sub, done, onPress, testID }: { icon: AppIconName; label: string; sub?: string; done: boolean; onPress?: () => void; testID?: string }) {
  const body = (
    <>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: done ? colors.successTint : colors.warnTint, alignItems: "center", justifyContent: "center" }}>
          <AppIcon name={icon} size={19} color={done ? colors.success : colors.warnInk} />
        </View>
        <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: done ? 0 : 2, borderColor: colors.lineStrong, backgroundColor: done ? colors.successFill : "transparent", alignItems: "center", justifyContent: "center" }}>
          {done ? <AppIcon name="check" size={14} color="#FFFFFF" strokeWidth={3} /> : null}
        </View>
      </View>
      <View style={{ gap: 2 }}>
        <T weight="bold" numberOfLines={2} style={{ fontSize: 14.5, lineHeight: 19 }}>{label}</T>
        {sub ? <T numberOfLines={2} style={{ fontSize: 12.5, lineHeight: 17, color: colors.inkSoft }}>{sub}</T> : null}
      </View>
    </>
  );
  const box: ViewStyle = { flex: 1, minWidth: 0, ...surfaceCard(22), padding: 16, gap: 12 };
  if (!onPress) return <View testID={testID} style={box} accessible accessibilityLabel={`${label}${sub ? `. ${sub}` : ""}`} accessibilityState={{ checked: done }}>{body}</View>;
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={`${label}${sub ? `. ${sub}` : ""}`} accessibilityState={{ checked: done }} onPress={onPress} style={({ pressed }) => [box, pressed && { opacity: 0.9 }]}>
      {body}
    </Pressable>
  );
}

/** Two tiles to a row (the last one alone keeps its half width). */
export function TileGrid({ children, gap = 12 }: { children: ReactNode[]; gap?: number }) {
  const items = children.filter(Boolean);
  const rows: ReactNode[][] = [];
  for (let index = 0; index < items.length; index += 2) rows.push(items.slice(index, index + 2));
  return (
    <View style={{ gap }}>
      {rows.map((row, index) => (
        <View key={index} style={{ flexDirection: "row", gap }}>
          {row}
          {row.length < 2 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}
