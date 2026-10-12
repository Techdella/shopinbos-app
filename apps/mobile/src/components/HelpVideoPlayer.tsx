import { View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { T } from "@/components/ui";
import { durationLabel } from "@shared/help-videos";
import type { HelpVideoItem } from "@/lib/help-videos";

// Plays a help video stored in our media bucket, inside the Help sheet. YouTube and Vimeo links open in the
// in-app browser instead (see Help.tsx), so no web view is needed here.

export function HelpVideoPlayer({ video, url }: { video: HelpVideoItem; url: string }) {
  const player = useVideoPlayer(url, (created) => {
    created.play();
  });
  return (
    <View style={{ gap: 10 }} testID="help-video-player">
      <VideoView
        player={player}
        nativeControls
        contentFit="contain"
        fullscreenOptions={{ enable: true }}
        style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 18, backgroundColor: "#000000", overflow: "hidden" }}
      />
      <T style={{ fontSize: 14 }}>{durationLabel(video.durationSeconds)} · Tap the video for sound and full screen.</T>
    </View>
  );
}
