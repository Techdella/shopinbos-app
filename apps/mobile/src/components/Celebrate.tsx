import { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, useWindowDimensions, View } from "react-native";
import { confettiPieces } from "@shared/celebrate";
import { Mascot } from "@/components/ui";

// "Your shop is live!": confetti falls once over the screen and Rex dances (mirrors the web's
// src/components/brand/Celebrate.tsx; the pieces come from @shared/celebrate). Nothing moves with Reduce Motion on.

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (alive) setReduce(value);
    }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);
  return reduce;
}

/** Confetti over the whole screen, once. Decorative and never in the way of a tap. */
export function Confetti({ count = 60, seed = 1 }: { count?: number; seed?: number }) {
  const { width, height } = useWindowDimensions();
  const reduce = useReduceMotion();
  const pieces = useMemo(() => confettiPieces(count, seed), [count, seed]);
  const [progress] = useState(() => pieces.map(() => new Animated.Value(0)));
  useEffect(() => {
    if (reduce) return;
    const fall = Animated.parallel(
      pieces.map((piece, index) =>
        Animated.timing(progress[index], { toValue: 1, duration: piece.duration * 1000, delay: piece.delay * 1000, easing: Easing.bezier(0.25, 0.6, 0.45, 1), useNativeDriver: true }),
      ),
    );
    fall.start();
    return () => fall.stop();
  }, [pieces, progress, reduce]);
  if (reduce) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {pieces.map((piece, index) => {
        const value = progress[index];
        return (
          <Animated.View
            key={index}
            style={{
              position: "absolute",
              top: 0,
              left: piece.x * width,
              width: piece.width,
              height: piece.height,
              borderRadius: piece.round ? piece.width / 2 : 2,
              backgroundColor: piece.color,
              opacity: value.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [-40, height + 40] }) },
                { translateX: value.interpolate({ inputRange: [0, 1], outputRange: [0, piece.drift] }) },
                { rotate: value.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${piece.spin}deg`] }) },
              ],
            }}
          />
        );
      })}
    </View>
  );
}

/** Rex celebrating, hopping and swaying side to side. */
export function DancingRex({ size = 150 }: { size?: number }) {
  const reduce = useReduceMotion();
  const [beat] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduce) return;
    const dance = Animated.loop(Animated.timing(beat, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }));
    dance.start();
    return () => dance.stop();
  }, [beat, reduce]);
  return (
    <Animated.View
      style={{
        transform: [
          { translateY: beat.interpolate({ inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1], outputRange: [0, -14, 0, -14, 0, 0] }) },
          { rotate: beat.interpolate({ inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1], outputRange: ["0deg", "-8deg", "0deg", "8deg", "0deg", "0deg"] }) },
        ],
      }}
    >
      <Mascot who="rex" mood="celebrate" size={size} label="" />
    </Animated.View>
  );
}
