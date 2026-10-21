import { useEffect, useState, type RefObject } from "react";
import { Modal, Pressable, useWindowDimensions, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Mascot, PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// The three-step first-login tour on Home ("Familiar app" prototype tour1–3): the screen dims except a cut-out round
// the thing being explained (the + button, the money card and shortcuts, the Rex and Peggy cards), with a white tip
// from Rex: title, one line, dots, Skip and Next / Got it. Targets are measured on screen when each step shows; a
// step whose target isn't on screen just shows its tip in the middle.

export type TourStep = { key: string; title: string; body: string; target?: RefObject<View | null> };
type Rect = { x: number; y: number; width: number; height: number };

const DIM = "rgba(22,20,31,0.66)";

/** An SVG path for a rounded rectangle (the tour's cut-out). */
function roundedRect({ x, y, width: w, height: h }: Rect, radius: number) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}
const PAD = 8;

export function Tour({ steps, visible, onDone }: { steps: TourStep[]; visible: boolean; onDone: () => void }) {
  const t = useT("m_familiar");
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const step = steps[index];

  useEffect(() => {
    if (!visible || !step) return;
    setRect(null);
    const node = step.target?.current;
    if (!node) return;
    // Wait a frame so the layout under the modal has settled.
    const id = setTimeout(() => node.measureInWindow((x, y, w, h) => (w && h ? setRect({ x: x - PAD, y: y - PAD, width: w + PAD * 2, height: h + PAD * 2 }) : setRect(null))), 60);
    return () => clearTimeout(id);
  }, [visible, step]);

  if (!step) return null;
  const last = index === steps.length - 1;
  const finish = () => {
    setIndex(0);
    onDone();
  };
  // The tip sits below the cut-out when there's room, else above it.
  const below = rect ? rect.y + rect.height + 220 < height : true;
  const tipTop = rect ? (below ? rect.y + rect.height + 14 : undefined) : height * 0.32;
  const tipBottom = rect && !below ? height - rect.y + 14 : undefined;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={finish} statusBarTranslucent>
      {/* One dim layer with a rounded hole round the target (even-odd fill), plus a white ring on its edge. */}
      {rect ? (
        <>
          <Svg width={width} height={height} style={{ position: "absolute", left: 0, top: 0 }} pointerEvents="none">
            <Path fill={DIM} fillRule="evenodd" d={`M0 0H${width}V${height}H0Z ${roundedRect(rect, Math.min(30, rect.height / 2))}`} />
          </Svg>
          <View pointerEvents="none" style={{ position: "absolute", left: rect.x, top: rect.y, width: rect.width, height: rect.height, borderRadius: Math.min(30, rect.height / 2), borderWidth: 2, borderColor: "#FFFFFF" }} />
        </>
      ) : (
        <View style={{ position: "absolute", inset: 0, backgroundColor: DIM }} />
      )}
      <View accessibilityViewIsModal style={{ position: "absolute", left: 18, right: 18, top: tipTop, bottom: tipBottom, maxWidth: width - 36, backgroundColor: colors.surface, borderRadius: 22, padding: 16, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Mascot name="rex" size={36} label="Rex" />
          <T weight="extrabold" style={{ fontSize: 16, flex: 1 }} accessibilityRole="header">{step.title}</T>
        </View>
        <T style={{ fontSize: 14.5, lineHeight: 21, color: colors.inkSoft }}>{step.body}</T>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View accessible accessibilityLabel={t("tour.step", { step: index + 1, total: steps.length })} style={{ flexDirection: "row", gap: 6, flex: 1 }}>
            {steps.map((entry, i) => (
              <View key={entry.key} style={{ width: i === index ? 18 : 7, height: 7, borderRadius: 4, backgroundColor: i === index ? colors.accent : "#D3D0DB" }} />
            ))}
          </View>
          {!last ? (
            <Pressable accessibilityRole="button" onPress={finish} hitSlop={6} style={{ paddingHorizontal: 8, minHeight: 44, justifyContent: "center" }}>
              <T weight="bold" style={{ color: colors.inkSoft }}>{t("tour.skip")}</T>
            </Pressable>
          ) : null}
          <PillButton tone="accent" size="sm" title={last ? t("tour.done") : t("tour.next")} onPress={() => (last ? finish() : setIndex(index + 1))} style={{ minWidth: 110 }} />
        </View>
      </View>
    </Modal>
  );
}
