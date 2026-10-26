import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Modal, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, Path, Pattern, Rect } from "react-native-svg";
import * as WebBrowser from "expo-web-browser";
import { glossaryTerm } from "@shared/glossary";
import { introDurationMs, type FeatureIntro } from "@shared/feature-intros";
import { HelpVideoPlayer } from "@/components/HelpVideoPlayer";
import { api } from "@/lib/api";
import { helpVideoLanguage, type HelpVideoItem } from "@/lib/help-videos";
import { translateIntro, translateTerm } from "@shared/i18n/learn";
import { useLocale, useT } from "@/lib/i18n";
import { VOICE_GRACE_MS, isNarrationLocale } from "@shared/intro-narration";
import { fonts } from "@/theme";
import { ANIM_MS, LC, MONO, SceneBoard } from "./scenes";
import { useIntroSound } from "./useIntroSound";

// The 60-second feature intro on the phone: a full-screen navy sheet that plays five short animated scenes from
// shared/feature-intros.ts (same scripts as the web), then a recap of the word it taught. Segmented progress,
// play/pause, back/next, replay, skip. With Reduce Motion on, scenes are still frames and you tap Next.
// "Watch the video" appears when a one-minute help video is published for the same topic. A narrator reads each
// scene over soft music (useIntroSound.ts); a scene waits for the narrator, and both can be switched off.

const SERIF = Platform.select({ ios: "Georgia", android: "serif", default: "Georgia, serif" });
const TICK_MS = 100;

function Glyph({ name, color = LC.cream, size = 18 }: { name: "play" | "pause" | "next" | "prev" | "replay" | "x" | "volume" | "mute" | "music"; color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      {name === "play" && <Path d="M7 4.5 L19 12 L7 19.5 Z" fill={color} />}
      {name === "pause" && <><Rect x={6} y={5} width={4} height={14} rx={1} fill={color} stroke="none" /><Rect x={14} y={5} width={4} height={14} rx={1} fill={color} stroke="none" /></>}
      {name === "next" && <Path d="M9 5 L16 12 L9 19" />}
      {name === "prev" && <Path d="M15 5 L8 12 L15 19" />}
      {name === "replay" && <><Path d="M4 12 a8 8 0 1 0 2.4 -5.7" /><Path d="M4 4 V9 H9" /></>}
      {name === "x" && <Path d="M6 6 L18 18 M18 6 L6 18" />}
      {(name === "volume" || name === "mute") && <Path d="M4 9v6h4l5 4V5L8 9z" />}
      {name === "volume" && <Path d="M16 9a4 4 0 010 6M18.5 6.5a7.5 7.5 0 010 11" />}
      {name === "mute" && <Path d="M17 9l5 6M22 9l-5 6" />}
      {name === "music" && <><Path d="M9 18V5l11-2v13" /><Circle cx={6.5} cy={18} r={2.5} /><Circle cx={17.5} cy={16} r={2.5} /></>}
    </Svg>
  );
}

function RoundButton({ label, onPress, filled = false, disabled = false, size = 46, children }: { label: string; onPress: () => void; filled?: boolean; disabled?: boolean; size?: number; children: React.ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", backgroundColor: filled ? LC.mint : "transparent", borderWidth: filled ? 0 : 1, borderColor: "rgba(244,241,234,0.22)", opacity: disabled ? 0.35 : pressed ? 0.75 : 1 })}
    >
      {children}
    </Pressable>
  );
}

function useReduceMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => alive && setReduced(value));
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

function useTopicVideo(topic: string | undefined, role: string | null, path: string) {
  const [video, setVideo] = useState<HelpVideoItem | null>(null);
  useEffect(() => {
    if (!topic) return;
    let alive = true;
    const params = new URLSearchParams({ topic, lang: helpVideoLanguage(path) });
    if (role === "seller" || role === "supplier" || role === "logistics_partner") params.set("role", role);
    api<{ current: HelpVideoItem | null }>(`/api/help-videos?${params.toString()}`)
      .then((data) => alive && setVideo(data?.current ?? null))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [topic, role, path]);
  return video;
}

export function FeatureIntroSheet({ intro: source, role, path, onClose }: { intro: FeatureIntro; role: string | null; path: string; onClose: (reason: "done" | "skip" | "close") => void }) {
  // Captions, title and recap in the app language; the scene art keeps its sample labels.
  const tl = useT("learn");
  const tIntros = useT("intros");
  const tGlossary = useT("glossary");
  const intro = translateIntro(source, tIntros);
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const still = useReduceMotion();
  const video = useTopicVideo(intro.helpTopic, role, path);
  // One clock for where we are: the scene, time into it, and whether the recap is showing.
  const [clock, setClock] = useState({ index: 0, elapsed: 0, finished: false });
  const { index, elapsed, finished } = clock;
  const [paused, setPaused] = useState(false);
  const [tab, setTab] = useState<"intro" | "video">("intro");
  const [run, setRun] = useState(0);
  const [t] = useState(() => new Animated.Value(0));
  const [loop] = useState(() => new Animated.Value(0));
  const scenes = intro.scenes;
  const scene = scenes[index]!;
  const glossaryEntry = glossaryTerm(intro.term);
  const term = glossaryEntry ? translateTerm(glossaryEntry, tGlossary) : null;
  const playing = !paused && !finished && !still && tab === "intro";
  const boardWidth = Math.min(screenWidth - 32, 560);
  const locale = useLocale();
  // The app going to the background or a Peggy call stops the sound (lib/intro-audio.ts): the intro shows as paused.
  const sound = useIntroSound({ introKey: intro.key, sceneCount: scenes.length, locale: isNarrationLocale(locale) ? locale : "en", onInterrupt: () => setPaused(true) });
  const { playScene, finish: finishSound, stopVoice, pause: pauseSound, resume: resumeSound, stopAll: stopSound } = sound;
  // Every way out stops and frees the narrator and the music first, then closes.
  const close = (reason: "done" | "skip" | "close") => {
    stopSound();
    onClose(reason);
  };
  const voiceBusy = useRef(false);
  voiceBusy.current = sound.voiceBusy;

  // The narrator follows the scenes: each new scene (or a replay) reads its line; the recap and the video stop it.
  useEffect(() => {
    if (tab !== "intro") {
      stopVoice();
      pauseSound();
    } else if (finished) finishSound();
    else void playScene(index);
    // A scene change while paused reads nothing until Play (playScene checks the pause).
  }, [tab, finished, index, run, playScene, finishSound, stopVoice, pauseSound]);

  useEffect(() => {
    if (tab !== "intro") return;
    if (paused) pauseSound();
    else resumeSound();
  }, [paused, tab, pauseSound, resumeSound]);

  // Build each scene from the start; with Reduce Motion show it finished.
  useEffect(() => {
    t.setValue(still ? 1 : 0);
    loop.setValue(0);
  }, [index, run, still, t, loop]);

  // Drive the scene while playing; stopping keeps where it was, so pause resumes in place.
  useEffect(() => {
    if (!playing) {
      t.stopAnimation();
      loop.stopAnimation();
      return;
    }
    let build: Animated.CompositeAnimation | null = null;
    t.stopAnimation((value) => {
      build = Animated.timing(t, { toValue: 1, duration: Math.max(0, ANIM_MS * (1 - value)), easing: Easing.linear, useNativeDriver: true });
      build.start();
    });
    const moving = Animated.loop(Animated.timing(loop, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }));
    moving.start();
    return () => {
      build?.stop();
      moving.stop();
    };
  }, [playing, index, run, t, loop]);

  // The scene clock: on to the next scene when one ends, then the recap.
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () =>
        setClock((current) => {
          const next = current.elapsed + TICK_MS;
          const length = scenes[current.index]!.durationMs;
          // Time's up but the narrator is still reading: wait for them (up to a grace period).
          if (next < length || (voiceBusy.current && next < length + VOICE_GRACE_MS)) return { ...current, elapsed: next };
          return current.index < scenes.length - 1 ? { index: current.index + 1, elapsed: 0, finished: false } : { ...current, finished: true };
        }),
      TICK_MS,
    );
    return () => clearInterval(timer);
  }, [playing, scenes]);

  const go = (next: number) => {
    setTab("intro");
    setClock(next >= scenes.length ? { ...clock, finished: true } : { index: Math.max(0, next), elapsed: 0, finished: false });
  };
  const replay = () => {
    setClock({ index: 0, elapsed: 0, finished: false });
    setPaused(false);
    setRun((count) => count + 1);
    setTab("intro");
  };
  const progress = (i: number) => (finished || i < index ? 1 : i > index ? 0 : still ? 1 : Math.min(1, elapsed / scenes[i]!.durationMs));
  const seconds = Math.round(introDurationMs(intro) / 1000);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => close(finished ? "done" : "close")} statusBarTranslucent>
      <View testID="feature-intro" accessibilityViewIsModal style={{ flex: 1, backgroundColor: LC.navy, paddingTop: insets.top + 10, paddingBottom: Math.max(insets.bottom, 12) }}>
        <Svg style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} width="100%" height="100%" pointerEvents="none">
          <Defs>
            <Pattern id="introDots" width={22} height={22} patternUnits="userSpaceOnUse">
              <Circle cx={1} cy={1} r={1} fill="rgba(115,216,200,0.14)" />
            </Pattern>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#introDots)" />
          <Circle cx="100%" cy={0} r={180} fill={LC.teal} opacity={0.22} />
        </Svg>

        <View style={{ paddingHorizontal: 16 }}>
          <View style={{ flexDirection: "row", gap: 6 }} accessibilityRole="progressbar" accessibilityLabel={tl("sceneProgress", { n: index + 1, total: scenes.length })}>
            {scenes.map((item, i) => (
              <Pressable key={i} onPress={() => go(i)} accessibilityRole="button" accessibilityLabel={tl("sceneOf", { n: i + 1, total: scenes.length, caption: item.caption })} hitSlop={{ top: 10, bottom: 10 }} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: "rgba(244,241,234,0.16)", overflow: "hidden" }}>
                <View style={{ width: `${progress(i) * 100}%`, height: 4, borderRadius: 2, backgroundColor: LC.mint }} />
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12, gap: 8 }}>
            <Text style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 1.8, color: LC.mint, flex: 1 }}>{tl("eyebrow", { seconds }).toUpperCase()}</Text>
            <Pressable testID="feature-intro-voice" accessibilityRole="switch" accessibilityState={{ checked: sound.prefs.voice }} accessibilityLabel={sound.prefs.voice ? tl("voiceOff") : tl("voiceOn")} onPress={() => sound.setVoice(!sound.prefs.voice)} hitSlop={6} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(244,241,234,0.1)", alignItems: "center", justifyContent: "center" }}>
              <Glyph name={sound.prefs.voice ? "volume" : "mute"} size={17} />
            </Pressable>
            <Pressable testID="feature-intro-music" accessibilityRole="switch" accessibilityState={{ checked: sound.prefs.music }} accessibilityLabel={sound.prefs.music ? tl("musicOff") : tl("musicOn")} onPress={() => sound.setMusic(!sound.prefs.music)} hitSlop={6} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(244,241,234,0.1)", alignItems: "center", justifyContent: "center", opacity: sound.prefs.music ? 1 : 0.45 }}>
              <Glyph name="music" size={17} color={sound.prefs.music ? LC.mint : LC.cream} />
            </Pressable>
            {!finished && (
              <Pressable accessibilityRole="button" onPress={() => close("skip")} hitSlop={8} style={{ minHeight: 40, paddingHorizontal: 12, justifyContent: "center" }}>
                <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: "rgba(244,241,234,0.75)" }}>{tl("skip")}</Text>
              </Pressable>
            )}
            <Pressable accessibilityRole="button" accessibilityLabel={tl("close")} onPress={() => close(finished ? "done" : "close")} hitSlop={6} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(244,241,234,0.1)", alignItems: "center", justifyContent: "center" }}>
              <Glyph name="x" size={16} />
            </Pressable>
          </View>
          <Text accessibilityRole="header" style={{ fontFamily: fonts.extrabold, fontSize: 28, lineHeight: 33, color: LC.cream, marginTop: 6, letterSpacing: -0.6 }}>
            {intro.title}
            <Text style={{ fontFamily: SERIF, fontStyle: "italic", fontWeight: "400", color: LC.mint }}> {tl("in60")}</Text>
          </Text>
          {video && (
            <View style={{ flexDirection: "row", alignSelf: "flex-start", marginTop: 12, padding: 4, borderRadius: 999, backgroundColor: "rgba(244,241,234,0.08)" }} accessibilityRole="tablist">
              {(["intro", "video"] as const).map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === value }}
                  onPress={() => {
                    setTab(value);
                    if (value === "video") setPaused(true);
                  }}
                  style={{ minHeight: 36, paddingHorizontal: 14, borderRadius: 999, justifyContent: "center", backgroundColor: tab === value ? LC.mint : "transparent" }}
                >
                  <Text style={{ fontFamily: fonts.bold, fontSize: 13.5, color: tab === value ? LC.navy : "rgba(244,241,234,0.8)" }}>{value === "intro" ? tl("animated") : tl("watchVideo")}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 16, paddingVertical: 16 }}>
          {tab === "video" && video ? (
            video.source.kind === "file" ? (
              <View style={{ backgroundColor: LC.cream, borderRadius: 22, padding: 10 }}>
                <HelpVideoPlayer video={video} url={video.source.url} />
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  if (video.source.kind !== "file") void WebBrowser.openBrowserAsync(video.source.watchUrl);
                }}
                style={{ borderRadius: 22, backgroundColor: LC.deep, aspectRatio: 16 / 9, alignItems: "center", justifyContent: "center", gap: 12 }}
              >
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: LC.mint, alignItems: "center", justifyContent: "center" }}>
                  <Glyph name="play" color={LC.navy} size={24} />
                </View>
                <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: LC.cream }}>{video.title}</Text>
              </Pressable>
            )
          ) : (
            <>
              <View style={{ alignSelf: "center", borderRadius: 22, overflow: "hidden", backgroundColor: LC.deep, borderWidth: 1, borderColor: "rgba(115,216,200,0.12)" }}>
                <SceneBoard key={`${run}-${index}`} scene={scene} width={boardWidth} t={t} loop={loop} paused={!playing} still={still} />
                {finished && term && (
                  <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(10,34,48,0.95)", justifyContent: "center", paddingHorizontal: 20, gap: 6 }}>
                    <Text style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: 1.8, color: LC.mint }}>{tl("wordToKnow").toUpperCase()}</Text>
                    <Text style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 34, color: LC.cream }}>{term.term}</Text>
                    <Text style={{ fontFamily: fonts.medium, fontSize: 15, lineHeight: 21, color: LC.cream }}>{term.short}</Text>
                  </View>
                )}
              </View>
              <View style={{ minHeight: 110, paddingTop: 18 }} accessibilityLiveRegion="polite">
                <Text style={{ fontFamily: fonts.extrabold, fontSize: 21, lineHeight: 27, color: LC.cream }}>{finished ? tl("thatsIt", { term: term?.term ?? intro.title }) : scene.caption}</Text>
                <Text style={{ fontFamily: fonts.regular, fontSize: 16, lineHeight: 23, color: "rgba(244,241,234,0.74)", marginTop: 6 }}>
                  {finished ? tl("forExample", { example: term?.example ?? "" }) : scene.sub}
                </Text>
              </View>
            </>
          )}
        </ScrollView>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(244,241,234,0.08)" }}>
          {finished ? (
            <>
              <Pressable accessibilityRole="button" onPress={replay} style={{ minHeight: 48, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1, borderColor: "rgba(244,241,234,0.22)", flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Glyph name="replay" size={16} />
                <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: LC.cream }}>{tl("replay")}</Text>
              </Pressable>
              <View style={{ flex: 1 }} />
              <Pressable testID="feature-intro-done" accessibilityRole="button" onPress={() => close("done")} style={{ minHeight: 48, paddingHorizontal: 26, borderRadius: 999, backgroundColor: LC.mint, justifyContent: "center" }}>
                <Text style={{ fontFamily: fonts.extrabold, fontSize: 16, color: LC.navy }}>{tl("gotIt")}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <RoundButton label={tl("previousScene")} onPress={() => go(index - 1)} disabled={index === 0}>
                <Glyph name="prev" />
              </RoundButton>
              {!still && (
                <RoundButton label={paused ? tl("play") : tl("pause")} filled size={52} onPress={() => { setTab("intro"); setPaused(!paused); }}>
                  <Glyph name={paused ? "play" : "pause"} color={LC.navy} size={20} />
                </RoundButton>
              )}
              {still ? (
                <Pressable accessibilityRole="button" onPress={() => go(index + 1)} style={{ minHeight: 48, paddingHorizontal: 22, borderRadius: 999, backgroundColor: LC.mint, flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ fontFamily: fonts.extrabold, fontSize: 16, color: LC.navy }}>{tl("next")}</Text>
                  <Glyph name="next" color={LC.navy} size={16} />
                </Pressable>
              ) : (
                <RoundButton label={tl("nextScene")} onPress={() => go(index + 1)}>
                  <Glyph name="next" />
                </RoundButton>
              )}
              <RoundButton label={tl("replayFromStart")} onPress={replay}>
                <Glyph name="replay" size={17} />
              </RoundButton>
              <View style={{ flex: 1 }} />
              <Text style={{ fontFamily: MONO, fontSize: 12, color: "rgba(244,241,234,0.6)" }}>{index + 1} / {scenes.length}</Text>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
