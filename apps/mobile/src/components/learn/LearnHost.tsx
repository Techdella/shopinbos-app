import "expo-sqlite/localStorage/install";
import { useEffect, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { usePathname, useSegments } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { introByKey, introForPath, normaliseIntroPath, type FeatureIntro } from "@shared/feature-intros";
import { callOn, usePeggyCall } from "@/lib/peggy-call";
import { useRole } from "@/lib/role";
import { useTipsAllowed } from "@/lib/setup-gate";
import { withHidden } from "@/lib/setup-gate-pure";
import { useT } from "@/lib/i18n";
import { fonts } from "@/theme";
import { onOpenFeatureIntro, openFeatureIntro } from "./events";
import { FeatureIntroSheet } from "./FeatureIntroSheet";
import { loadIntrosSeen, markIntroSeen, useTipsOnPhone } from "./prefs";
import { LC, MONO } from "./scenes";

// Mounted once in app/_layout.tsx. Intros never open by themselves any more: a new person thought a tip that popped
// over a screen WAS the screen (also over screens Peggy opened on a call). Instead a screen that has a tip shows a
// small floating "Tips" button (a lightbulb, bottom-left, above the tab bar and clear of the "+"), but only once the
// person's setup is done, with tips switched on, never during a Peggy call and not right after she opened a screen
// (lib/setup-gate.ts). Tapping it opens that screen's 60-second intro; long-press or its little × hides it on that
// screen for good (on this phone). TermHint, LearnButton and Help's getting-started videos still open intros on
// request. An open intro closes when a Peggy call starts or the screen changes underneath it, and its sound stops
// with it (lib/intro-audio.ts).

const ANDROID = Platform.OS === "android";
const hiddenKey = (uid: string) => `shopinbos.tips-hidden.${uid}`;

function readHidden(uid: string | null): string[] {
  if (!uid) return [];
  try {
    const raw = JSON.parse(localStorage.getItem(hiddenKey(uid)) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function Bulb({ color, size = 20 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 18h6M10 21h4" />
      <Path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z" />
    </Svg>
  );
}

export function LearnHost() {
  const pathname = usePathname();
  const segments = useSegments() as string[];
  const path = normaliseIntroPath(pathname);
  const { role, uid } = useRole();
  const insets = useSafeAreaInsets();
  const t = useT("learn");
  const [open, setOpen] = useState<{ intro: FeatureIntro; path: string } | null>(null);
  const [hidden, setHidden] = useState<{ uid: string | null; keys: string[] }>({ uid: null, keys: [] });
  const tipsOn = useTipsOnPhone();
  const allowed = useTipsAllowed(tipsOn);
  const call = usePeggyCall();
  const calling = callOn(call) && call.phase !== "summary";

  // The account's tips switch (and the intros seen) from the server, once per sign-in.
  useEffect(() => {
    if (uid) void loadIntrosSeen();
  }, [uid]);
  if (hidden.uid !== uid) setHidden({ uid, keys: readHidden(uid) });

  useEffect(
    () =>
      onOpenFeatureIntro((key) => {
        const intro = key ? introByKey(key) : introForPath(path, role);
        if (intro) setOpen({ intro, path });
      }),
    [path, role],
  );

  // A Peggy call starting, or the screen changing underneath (she opened another one), closes the intro; the sheet
  // unmounting stops and frees its sound (useIntroSound's cleanup); the call itself also trips the audio guard.
  if (open && (calling || open.path !== path)) setOpen(null);

  const current = role ? introForPath(path, role) : null;
  const key = current?.key ?? null;
  const showButton = Boolean(key && uid && allowed && !open && !hidden.keys.includes(key));

  function hideHere() {
    if (!uid || !key) return;
    const keys = withHidden(hidden.keys, key);
    setHidden({ uid, keys });
    try {
      localStorage.setItem(hiddenKey(uid), JSON.stringify(keys));
    } catch {
      // No storage: hidden until the app closes.
    }
  }

  // Bottom-left, above the tab bar (the "+" floats bottom-right on Android and sits mid-bar on iPhone); on other
  // screens high enough to clear a bottom button.
  const onTabs = segments.some((segment) => segment === "(tabs)");
  const bottom = onTabs ? Math.max(insets.bottom, ANDROID ? 12 : 8) + 64 + 12 : insets.bottom + 88;

  return (
    <>
      {showButton && current ? (
        <View pointerEvents="box-none" style={{ position: "absolute", left: 16, bottom, zIndex: 40, elevation: 10 }}>
          <Pressable
            testID="tips-button"
            accessibilityRole="button"
            accessibilityLabel={t("tipsOpen")}
            accessibilityHint={t("tipsHideHint")}
            accessibilityActions={[{ name: "longpress", label: t("tipsHide") }]}
            onAccessibilityAction={(event) => event.nativeEvent.actionName === "longpress" && hideHere()}
            onPress={() => openFeatureIntro(current.key)}
            onLongPress={hideHere}
            delayLongPress={450}
            style={({ pressed }) => ({ minHeight: 44, borderRadius: 999, backgroundColor: LC.navy, flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 10, paddingRight: 14, opacity: pressed ? 0.85 : 1, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } })}
          >
            <Bulb color={LC.mint} />
            <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: LC.cream }}>{t("tipsButton")}</Text>
          </Pressable>
          <Pressable
            testID="tips-button-hide"
            accessibilityRole="button"
            accessibilityLabel={t("tipsHide")}
            onPress={hideHere}
            hitSlop={10}
            style={{ position: "absolute", top: -8, right: -8, width: 22, height: 22, borderRadius: 11, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "rgba(14,42,56,0.15)", alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontSize: 11, lineHeight: 13, color: LC.navy }}>✕</Text>
          </Pressable>
        </View>
      ) : null}
      {open ? (
        <FeatureIntroSheet
          key={open.intro.key}
          intro={open.intro}
          role={role}
          path={path}
          onClose={() => {
            if (uid) void markIntroSeen(uid, open.intro.key);
            setOpen(null);
          }}
        />
      ) : null}
    </>
  );
}

/** "Learn · 60s" pill for a screen header: replays this screen's intro (or `introKey`). Hidden when there's none. */
export function LearnButton({ introKey }: { introKey?: string }) {
  const pathname = usePathname();
  const { role } = useRole();
  const intro = introKey ? introByKey(introKey) : role ? introForPath(pathname, role) : null;
  const t = useT("learn");
  const tIntros = useT("intros");
  if (!intro) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("pillTitle", { title: tIntros.dynamic(`${intro.key}.title`, intro.title) })}
      onPress={() => openFeatureIntro(intro.key)}
      style={({ pressed }) => ({ minHeight: 44, borderRadius: 999, backgroundColor: LC.navy, flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 6, paddingRight: 14, opacity: pressed ? 0.85 : 1 })}
    >
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: LC.mint, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: LC.navy, fontSize: 11 }}>▶</Text>
      </View>
      <Text style={{ fontFamily: fonts.extrabold, fontSize: 14, color: LC.cream }}>{t("pill")}</Text>
      <Text style={{ fontFamily: MONO, fontSize: 11, color: LC.mint }}>60s</Text>
    </Pressable>
  );
}
