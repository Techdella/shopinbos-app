import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, type StyleProp, type ViewStyle } from "react-native";
import { router, usePathname } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { AppIcon } from "@/components/icons";
import { HelpVideoPlayer } from "@/components/HelpVideoPlayer";
import { ChoiceRow, Sheet } from "@/components/Sheet";
import { LinkButton, T } from "@/components/ui";
import { loadHelpVideos, type HelpVideoItem, type HelpVideos } from "@/lib/help-videos";
import { useRole } from "@/lib/role";
import { durationLabel, normaliseHelpPath, type HelpVideoRole } from "@shared/help-videos";
import { openSupportWhatsApp, SUPPORT_EMAIL, SUPPORT_WHATSAPP } from "@/lib/support";
import { colors } from "@/theme";

// "Help" on every screen (build spec 8A): chat with a person on WhatsApp, ask Peggy, or watch a one-minute video
// for this screen. Without a support WhatsApp number set (see SUPPORT_WHATSAPP), "Chat with a person" opens the
// in-app chat with the team. The video option only shows when one is published for this screen.

export function HelpSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { role, signedIn } = useRole();
  // Peggy works on a seller's shop; suppliers and delivery partners get a person.
  const peggy = !role || role === "seller";
  const [videos, setVideos] = useState<HelpVideos | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [playing, setPlaying] = useState<HelpVideoItem | null>(null);
  const videoRole: HelpVideoRole | null = normaliseHelpPath(pathname).startsWith("/rider") ? "rider" : role === "admin" ? null : role ?? null;

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    loadHelpVideos(pathname, videoRole)
      .then((found) => alive && setVideos(found))
      .catch(() => alive && setVideos(null));
    return () => {
      alive = false;
    };
  }, [visible, pathname, videoRole]);

  // Closing resets the sheet to its choices for next time.
  function close() {
    setPlaying(null);
    setShowAll(false);
    onClose();
  }

  function watch(video: HelpVideoItem) {
    if (video.source.kind === "file") return setPlaying(video);
    // YouTube and Vimeo play in the in-app browser.
    close();
    void WebBrowser.openBrowserAsync(video.source.watchUrl);
  }

  async function person() {
    onClose();
    if (await openSupportWhatsApp(`Hello Shopinbos, I need help in the app (${pathname}).`)) return;
    // The in-app chat needs an account; before logging in, email the team.
    if (!signedIn) return void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Help with the Shopinbos app")}`);
    router.push({ pathname: "/help/chat", params: { from: pathname } });
  }

  function go(path: "/peggy" | "/help" | "/ask-us") {
    onClose();
    router.push(path);
  }

  return (
    <Sheet visible={visible} onClose={close} title={playing ? playing.title : "How can we help?"} testID="help-sheet">
      {playing && playing.source.kind === "file" ? (
        <>
          <HelpVideoPlayer video={playing} url={playing.source.url} />
          <LinkButton title="Back to help" color={colors.inkSoft} onPress={() => setPlaying(null)} />
        </>
      ) : (
      <>
      <ChoiceRow
        testID="help-person"
        icon="chat"
        tint={colors.successTint}
        iconColor={colors.success}
        title={SUPPORT_WHATSAPP ? "Chat with a person on WhatsApp" : "Chat with a person"}
        sub={SUPPORT_WHATSAPP ? "Our team answers on WhatsApp. English or Pidgin." : signedIn ? "Our team answers you here in the app." : `Email our team at ${SUPPORT_EMAIL}.`}
        onPress={() => void person()}
      />
      {peggy && signedIn ? <ChoiceRow testID="help-peggy" icon="sparkle" tint={colors.mintTint} iconColor={colors.forest} title="Ask Peggy" sub="Say what you need. She'll do it or show you how." onPress={() => go("/peggy")} /> : null}
      {signedIn ? <ChoiceRow icon="settings" tint={colors.peach} iconColor={colors.accentInk} title="Ask us to set something up" sub="We do the hard parts for you." onPress={() => go("/ask-us")} /> : null}
      {videos?.current ? (
        <ChoiceRow testID="help-video" icon="play" tint={colors.peach} iconColor={colors.accentInk} title="Watch a 1-minute video" sub={videos.current.title} onPress={() => watch(videos.current!)} />
      ) : null}
      {videos && videos.all.length > 0 ? (
        <>
          <LinkButton testID="help-all-videos" title={showAll ? "Hide videos" : `All videos (${videos.all.length})`} color={colors.inkSoft} onPress={() => setShowAll(!showAll)} />
          {showAll ? (
            <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ gap: 4 }}>
              {videos.all.map((video) => (
                <Pressable key={video.id} accessibilityRole="button" accessibilityLabel={`Play ${video.title}`} onPress={() => watch(video)} style={({ pressed }) => ({ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 8, borderRadius: 14, backgroundColor: pressed ? colors.canvas : "transparent" })}>
                  <AppIcon name="play" size={16} color={colors.accentInk} />
                  <T weight="bold" style={{ flex: 1, fontSize: 15 }}>{video.title}</T>
                  <T style={{ fontSize: 13, color: colors.inkSoft }}>{durationLabel(video.durationSeconds)}</T>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </>
      ) : null}
      {signedIn ? <LinkButton title="See my chats with the team" color={colors.inkSoft} onPress={() => go("/help")} /> : null}
      </>
      )}
    </Sheet>
  );
}

/** The Help pill for screen headers: an icon with the word, as the prototype has it. */
export function HelpButton({ style, testID = "help-button" }: { style?: StyleProp<ViewStyle>; testID?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel="Help"
        onPress={() => setOpen(true)}
        hitSlop={4}
        style={({ pressed }) => [{ minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed ? 0.8 : 1 }, style]}
      >
        <AppIcon name="help" size={18} />
        <T weight="bold" style={{ fontSize: 15 }}>Help</T>
      </Pressable>
      <HelpSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
