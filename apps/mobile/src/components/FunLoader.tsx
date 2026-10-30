import { useEffect, useState } from "react";
import { Animated, Easing, View, type StyleProp, type ViewStyle } from "react-native";
import { FUN_LOADING_STEP_MS, funLoadingIndex, funLoadingKeys, type FunLoadingKind } from "@shared/fun-loading";
import { Mascot, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// While Rex works on a logo, a video, a picture or a connection: Rex at work, a friendly line that changes every
// few seconds ("Rex is cooking your logo…", "Wait small…") and three bouncing dots (mirrors the web's
// src/components/brand/FunLoader.tsx; lines in @shared/fun-loading).

function Dot({ delay }: { delay: number }) {
  const [value] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const bounce = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(value, { toValue: 1, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(value, { toValue: 0, duration: 300, easing: Easing.in(Easing.ease), useNativeDriver: true }),
        Animated.delay(600 - delay),
      ]),
    );
    bounce.start();
    return () => bounce.stop();
  }, [delay, value]);
  return (
    <Animated.View
      style={{
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.forest,
        opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
        transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }],
      }}
    />
  );
}

export function FunLoader({ kind = "general", size = "md", style }: { kind?: FunLoadingKind; size?: "sm" | "md"; style?: StyleProp<ViewStyle> }) {
  const t = useT("common");
  const [ticks, setTicks] = useState(0);
  const [fade] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const timer = setInterval(() => setTicks((value) => value + 1), FUN_LOADING_STEP_MS);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  }, [fade, ticks]);
  const line = t(funLoadingKeys(kind)[funLoadingIndex(kind, ticks)] as Parameters<typeof t>[0]);
  const small = size === "sm";
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLiveRegion="polite"
      accessibilityLabel={line}
      style={[{ flexDirection: "row", alignItems: "center", gap: 12 }, small ? null : { backgroundColor: colors.surface, borderRadius: 20, padding: 14 }, style]}
    >
      <Mascot who="rex" mood="working" size={small ? 40 : 56} label="" />
      <View style={{ flex: 1 }}>
        <Animated.View style={{ opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }}>
          <T weight="bold" style={{ fontSize: small ? 14 : 15.5 }}>{line}</T>
        </Animated.View>
        <View style={{ flexDirection: "row", gap: 4, marginTop: 6 }}>
          {[0, 150, 300].map((delay) => <Dot key={delay} delay={delay} />)}
        </View>
      </View>
    </View>
  );
}
