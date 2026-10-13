// <Mascot who="rex|peggy" mood="…" size={…} />: the one way to show Rex or Peggy in the app (build spec 5.4).
// Mirrors the web component (src/components/brand/Mascot.tsx); the mood → still table is shared in @shared/mascots.
//
// What renders:
// - the still PNG for the mood, always first (while an animation loads, with Reduce Motion on, on Android phones
//   under 3 GB of RAM, and whenever no animation file exists);
// - a gentle Animated fallback motion on that still (breathing for idle, a bounce for celebrate, a shake for oops);
//   celebrate / wave / oops play once and settle back to idle;
// - the real animation, when assets/mascots/mascots.json lists a file and a renderer is registered (none yet, see
//   MASCOT_NATIVE_RENDERERS below).

import { useEffect, useRef, useState, type ComponentType } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import * as Device from "expo-device";
import {
  isLowEndAndroid,
  mascotAnimation,
  mascotLabel,
  mascotStill,
  playsOnce,
  shouldAnimate,
  shouldMoveStill,
  type MascotAnimationSource,
  type MascotManifest,
  type MascotMood,
  type MascotRenderers,
  type MascotSize,
  type MascotStillName,
  type MascotWho,
} from "@shared/mascots";
import manifestJson from "../../assets/mascots/mascots.json";
import { MASCOT_ANIMATION_FILES } from "../../assets/mascots";

export type { MascotMood, MascotSize, MascotWho } from "@shared/mascots";

const MANIFEST = manifestJson as MascotManifest;

export const MASCOT_STILL_SOURCES: Record<MascotStillName, number> = {
  rex: require("../../assets/brand/rex.png"),
  "rex-side": require("../../assets/brand/rex-side.png"),
  "rex-cheer": require("../../assets/brand/rex-cheer.png"),
  peggy: require("../../assets/brand/peggy.png"),
  "peggy-wave": require("../../assets/brand/peggy-wave.png"),
  "peggy-side": require("../../assets/brand/peggy-side.png"),
  "peggy-cheer": require("../../assets/brand/peggy-cheer.png"),
};

/** Props a native animation renderer receives. `asset` is the required file (from assets/mascots/index.ts). */
export interface MascotRendererProps {
  source: MascotAnimationSource;
  asset: unknown;
  mood: MascotMood;
  loop: boolean;
  size: number;
  onReady: () => void;
  onComplete?: () => void;
  onError: () => void;
}

/**
 * Animation renderers, registered when their package is added. None are installed yet: both need native code (a new
 * development / EAS build, not Expo Go), and lottie-react-native's web build also needs @lottiefiles/dotlottie-react.
 * When files arrive:
 *   Lottie: `npx expo install lottie-react-native @lottiefiles/dotlottie-react`, write MascotLottie.tsx rendering
 *           <LottieView source={asset} autoPlay loop={loop} onAnimationLoaded={onReady} onAnimationFinish={onComplete} />
 *           and register it here as `lottie: MascotLottie`.
 *   Rive:   `npx expo install rive-react-native` (plus its config plugin), add "riv" to resolver.assetExts in
 *           metro.config.js, render <Rive source={asset} stateMachineName={source.stateMachine} /> and set the `mood`
 *           input; register it as `rive: MascotRive`.
 */
export const MASCOT_NATIVE_RENDERERS: Partial<Record<"rive" | "lottie", ComponentType<MascotRendererProps>>> = {};
const AVAILABLE: MascotRenderers = {
  rive: Boolean(MASCOT_NATIVE_RENDERERS.rive),
  lottie: Boolean(MASCOT_NATIVE_RENDERERS.lottie),
};

/** Reduce Motion, kept live. Starts true (the still) until the system answers. */
export function useReduceMotion() {
  const [reduce, setReduce] = useState(true);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => live && setReduce(value))
      .catch(() => live && setReduce(false));
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

const LOW_END = isLowEndAndroid(Platform.OS, Device.totalMemory);

export function mascotStillSource(who: MascotWho, mood: MascotMood = "idle") {
  return MASCOT_STILL_SOURCES[mascotStill(who, mood)];
}

export interface MascotProps {
  who: MascotWho;
  mood?: MascotMood;
  /** Square size in px: 20, 30, 40, 56, 110 or 150 (other sizes work too). */
  size: MascotSize | number;
  /** Decorative mascots (next to text that already names them) are hidden from screen readers. */
  decorative?: boolean;
  /** Overrides the default "Rex" / "Peggy". */
  label?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Mascot({ who, mood = "idle", size, decorative = false, label, style, testID }: MascotProps) {
  const reducedMotion = useReduceMotion();
  // One-shot moods settle back to idle once played; a new mood prop starts over.
  const [shown, setShown] = useState({ mood, done: false });
  let current = shown;
  if (shown.mood !== mood) {
    current = { mood, done: false };
    setShown(current);
  }
  const playing: MascotMood = current.done && playsOnce(mood) ? "idle" : mood;
  const finish = () => setShown((prev) => (prev.mood === mood ? { ...prev, done: true } : prev));

  const source = mascotAnimation(who, playing, MANIFEST, AVAILABLE);
  const animate = shouldAnimate(source, { reducedMotion, lowEndDevice: LOW_END });
  const [readyFile, setReadyFile] = useState<string | null>(null);
  const ready = animate && source !== null && readyFile === source.file;
  const moveStill = shouldMoveStill({ reducedMotion }) && !ready;
  const Renderer = source ? MASCOT_NATIVE_RENDERERS[source.kind] : undefined;

  const a11y = decorative
    ? { accessible: false, importantForAccessibility: "no-hide-descendants" as const, accessibilityElementsHidden: true }
    : { accessible: true, accessibilityRole: "image" as const, accessibilityLabel: label ?? mascotLabel(who) };

  return (
    <View style={[{ width: size, height: size }, style]} testID={testID} {...a11y}>
      <StillWithMotion who={who} mood={playing} size={size} move={moveStill} hidden={ready} onDone={playsOnce(playing) ? finish : undefined} />
      {animate && source && Renderer ? (
        <View style={{ position: "absolute", top: 0, left: 0, width: size, height: size }} pointerEvents="none">
          <Renderer
            source={source}
            asset={MASCOT_ANIMATION_FILES[source.file]}
            mood={playing}
            loop={!playsOnce(playing)}
            size={size}
            onReady={() => setReadyFile(source.file)}
            onComplete={playsOnce(playing) ? finish : undefined}
            onError={() => setReadyFile(null)}
          />
        </View>
      ) : null}
    </View>
  );
}

/** The still with the gentle fallback motion (transforms only, native driver). */
function StillWithMotion({ who, mood, size, move, hidden, onDone }: { who: MascotWho; mood: MascotMood; size: number; move: boolean; hidden: boolean; onDone?: () => void }) {
  const [t] = useState(() => new Animated.Value(0));
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    t.setValue(0);
    if (!move) return;
    const native = Platform.OS !== "web";
    const once = playsOnce(mood);
    const duration = mood === "idle" ? 3800 : mood === "sleep" ? 6000 : mood === "thinking" ? 2800 : mood === "working" ? 900 : mood === "celebrate" ? 1000 : mood === "oops" ? 700 : 1100;
    const run = Animated.timing(t, { toValue: 1, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: native });
    const anim = once ? run : Animated.loop(run);
    anim.start(({ finished }) => {
      if (finished && once) doneRef.current?.();
    });
    return () => anim.stop();
  }, [t, mood, move]);

  const transform = motionTransform(mood, t, size);
  return (
    <Animated.View style={{ width: size, height: size, opacity: hidden ? 0 : 1, transform: move ? transform : [] }}>
      <Image source={mascotStillSource(who, mood)} style={{ width: size, height: size }} contentFit="contain" accessible={false} />
    </Animated.View>
  );
}

// Keyframes as interpolations of t (0 → 1). Scales grow from the feet: translate up by half the growth.
function motionTransform(mood: MascotMood, t: Animated.Value, size: number) {
  switch (mood) {
    case "idle":
    case "sleep": {
      const scale = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, mood === "sleep" ? 1.04 : 1.03, 1] });
      const lift = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -size * (mood === "sleep" ? 0.018 : 0.013), 0] });
      return [{ translateY: lift }, { scale }];
    }
    case "thinking":
      return [{ rotate: t.interpolate({ inputRange: [0, 0.3, 0.65, 1], outputRange: ["0deg", "-3.5deg", "2deg", "0deg"] }) }];
    case "working":
      return [{ translateY: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -size * 0.04, 0] }) }];
    case "wave":
      return [{ rotate: t.interpolate({ inputRange: [0, 0.2, 0.45, 0.7, 1], outputRange: ["0deg", "-6deg", "5deg", "-3deg", "0deg"] }) }];
    case "celebrate":
      return [{ translateY: t.interpolate({ inputRange: [0, 0.18, 0.4, 0.62, 0.78, 1], outputRange: [0, 0, -size * 0.14, 0, -size * 0.05, 0] }) }];
    case "oops":
      return [{ translateX: t.interpolate({ inputRange: [0, 0.15, 0.35, 0.55, 0.75, 1], outputRange: [0, -size * 0.05, size * 0.05, -size * 0.05, size * 0.05, 0] }) }];
    default:
      return [];
  }
}

export default Mascot;
