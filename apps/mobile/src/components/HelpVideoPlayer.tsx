import { useEffect } from "react";
import { View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { T } from "@/components/ui";
import { durationLabel } from "@shared/help-videos";
import type { HelpVideoItem } from "@/lib/help-videos";
import { useT } from "@/lib/i18n";
import { useIntroAudioStop } from "@/lib/intro-audio";

// Plays a help video stored in our media bucket, inside the Help sheet. YouTube and Vimeo links open in the
// in-app browser instead (see Help.tsx), so no web view is needed here.

export function HelpVideoPlayer({ video, url }: { video: HelpVideoItem; url: string }) {
  const t = useT("m_help");
  const player = useVideoPlayer(url, (created) => {
    created.staysActiveInBackground = false;
    created.play();
  });
  // The app going to the background or a Peggy call starting pauses it (lib/intro-audio.ts); closing frees it.
  useIntroAudioStop(() => {
    try {
      player.pause();
    } catch {
      // Already released.
    }
  });
  // The web build only starts once the view is on screen; native starts from the setup above.
  useEffect(() => {
    const timer = setTimeout(() => player.play(), 300);
    return () => clearTimeout(timer);
  }, [player]);
  return (
    <View style={{ gap: 10 }} testID="help-video-player">
      <VideoView
        player={player}
        nativeControls
        contentFit="contain"
        fullscreenOptions={{ enable: true }}
        style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 18, backgroundColor: "#000000", overflow: "hidden" }}
      />
      <T style={{ fontSize: 14 }}>{t("video.tapHint", { duration: durationLabel(video.durationSeconds) })}</T>
    </View>
  );
}
