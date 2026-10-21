import { useEffect, useState, type RefObject } from "react";
import { Modal, Pressable, useWindowDimensions, View } from "react-native";
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
      {/* Four dim panels round the cut-out (no native mask needed). */}
      {rect ? (
        <>
          <View style={{ position: "absolute", left: 0, right: 0, top: 0, height: Math.max(0, rect.y), backgroundColor: DIM }} />
          <View style={{ position: "absolute", left: 0, right: 0, top: rect.y + rect.height, bottom: 0, backgroundColor: DIM }} />
          <View style={{ position: "absolute", left: 0, width: Math.max(0, rect.x), top: rect.y, height: rect.height, backgroundColor: DIM }} />
          <View style={{ position: "absolute", left: rect.x + rect.width, right: 0, top: rect.y, height: rect.height, backgroundColor: DIM }} />
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
