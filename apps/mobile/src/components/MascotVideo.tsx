// <MascotVideo clip="peggy-hello|rex-hello|rex-thumbs" size={…} />: a short studio clip of Rex or Peggy in a soft
// round "spotlight" (mirrors the web src/components/brand/MascotVideo.tsx; clip list and colours in @shared/mascots).
//
// The clips have a light grey studio background, so they sit in a circle of that same grey, and a radial gradient
// (react-native-svg) softens the frame's edge into it. Pass `fadeTo` with the colour behind the circle and the rim
// fades into the page instead, so the circle disappears and only the mascot stands out.
//
// - The poster (first frame) shows first, and is all that shows with Reduce Motion on or on low-end Android phones.
// - The video is muted, loops, has no controls, is only loaded when motion is allowed, and pauses when the screen
//   loses focus or the app goes to the background.

import { useCallback, useEffect, useId, useState } from "react";
import { AppState, Platform, View, type StyleProp, type ViewStyle } from "react-native";
import { useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import * as Device from "expo-device";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { isLowEndAndroid, MASCOT_CLIP_INFO, mascotClipLabel, type MascotClip } from "@shared/mascots";
import { useReduceMotion } from "@/components/Mascot";

export type { MascotClip } from "@shared/mascots";

const CLIPS: Record<MascotClip, { video: number; poster: number }> = {
  "peggy-hello": { video: require("../../assets/mascots/video/peggy-hello.mp4"), poster: require("../../assets/mascots/video/peggy-hello-poster.jpg") },
  "rex-hello": { video: require("../../assets/mascots/video/rex-hello.mp4"), poster: require("../../assets/mascots/video/rex-hello-poster.jpg") },
  "rex-thumbs": { video: require("../../assets/mascots/video/rex-thumbs.mp4"), poster: require("../../assets/mascots/video/rex-thumbs-poster.jpg") },
};

const LOW_END = isLowEndAndroid(Platform.OS, Device.totalMemory);

export interface MascotVideoProps {
  clip: MascotClip;
  /** Square size in px. */
  size: number;
  /** Hidden from screen readers (the text next to it already says hello). */
  decorative?: boolean;
  /** Overrides the default "Rex" / "Peggy". */
  label?: string;
  /** The colour behind the spotlight: the rim fades into it. Leave out to keep a soft grey circle. */
  fadeTo?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function MascotVideo({ clip, size, decorative = false, label, fadeTo, style, testID }: MascotVideoProps) {
  const reduceMotion = useReduceMotion();
  const still = reduceMotion || LOW_END;
  const files = CLIPS[clip];
  const backdrop = MASCOT_CLIP_INFO[clip].backdrop;
  const gradientId = `spot${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  // No source (nothing loads) until motion is allowed.
  const player = useVideoPlayer(still ? null : files.video, (created) => {
    created.loop = true;
    created.muted = true;
    created.audioMixingMode = "mixWithOthers";
  });

  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const [active, setActive] = useState(AppState.currentState !== "background");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => setActive(state === "active"));
    return () => sub.remove();
  }, []);

  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (still) return;
    if (focused && active) player.play();
    else player.pause();
  }, [player, still, focused, active]);

  const a11y = decorative
    ? { accessible: false, importantForAccessibility: "no-hide-descendants" as const, accessibilityElementsHidden: true }
    : { accessible: true, accessibilityRole: "image" as const, accessibilityLabel: label ?? mascotClipLabel(clip) };

  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", backgroundColor: fadeTo ?? backdrop }, style]} testID={testID} {...a11y}>
      <Image source={files.poster} style={{ position: "absolute", width: size, height: size }} contentFit="cover" accessible={false} />
      {!still ? (
        <VideoView
          player={player}
          nativeControls={false}
          contentFit="cover"
          surfaceType="textureView"
          allowsPictureInPicture={false}
          onFirstFrameRender={() => setShown(true)}
          style={{ position: "absolute", width: size, height: size, opacity: shown ? 1 : 0 }}
          pointerEvents="none"
        />
      ) : null}
      <Svg width={size} height={size} style={{ position: "absolute" }} pointerEvents="none">
        <Defs>
          <RadialGradient id={gradientId} cx="50%" cy="50%" r="50%">
            <Stop offset="0.62" stopColor={fadeTo ?? backdrop} stopOpacity="0" />
            <Stop offset="0.86" stopColor={fadeTo ?? backdrop} stopOpacity={fadeTo ? "0.7" : "0.45"} />
            <Stop offset="1" stopColor={fadeTo ?? backdrop} stopOpacity="1" />
          </RadialGradient>
        </Defs>
        <Rect width={size} height={size} fill={`url(#${gradientId})`} />
      </Svg>
    </View>
  );
}

export default MascotVideo;
