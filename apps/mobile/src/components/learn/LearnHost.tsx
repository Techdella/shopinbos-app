import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { usePathname } from "expo-router";
import { introByKey, introForPath, normaliseIntroPath, type FeatureIntro } from "@shared/feature-intros";
import { useRole } from "@/lib/role";
import { fonts } from "@/theme";
import { onOpenFeatureIntro, openFeatureIntro } from "./events";
import { FeatureIntroSheet } from "./FeatureIntroSheet";
import { introsSeenOnPhone, loadIntrosSeen, markIntroSeen } from "./prefs";
import { LC, MONO } from "./scenes";

// Mounted once in app/_layout.tsx. Shows a screen's 60-second intro by itself the first time the person opens
// that screen (once per person per intro, the same list the web app keeps), a moment after it settles. The list
// comes from the server; if that can't be reached, the phone's own list decides. Marked seen as it opens.
// TermHint and LearnButton open any intro again.

const AUTO_DELAY_MS = 1500;

export function LearnHost() {
  const pathname = usePathname();
  const path = normaliseIntroPath(pathname);
  const { role, uid } = useRole();
  const [seen, setSeen] = useState<string[] | null>(null);
  const [open, setOpen] = useState<FeatureIntro | null>(null);
  const shown = useRef(new Set<string>());

  // The server's list for this account (or the phone's when offline).
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    void loadIntrosSeen().then((server) => {
      if (alive) setSeen([...new Set([...(server ?? []), ...introsSeenOnPhone(uid)])]);
    });
    return () => {
      alive = false;
    };
  }, [uid]);

  useEffect(
    () =>
      onOpenFeatureIntro((key) => {
        const intro = key ? introByKey(key) : introForPath(path, role);
        if (intro) setOpen(intro);
      }),
    [path, role],
  );

  const current = role ? introForPath(path, role) : null;
  const key = current?.key ?? null;
  useEffect(() => {
    if (!key || !uid || !seen || open || seen.includes(key) || shown.current.has(key)) return;
    const timer = setTimeout(() => {
      shown.current.add(key);
      setOpen(introByKey(key));
      void markIntroSeen(uid, key);
      setSeen((list) => [...(list ?? []), key]);
    }, AUTO_DELAY_MS);
    return () => clearTimeout(timer);
  }, [key, uid, seen, open]);

  if (!open) return null;
  return (
    <FeatureIntroSheet
      key={open.key}
      intro={open}
      role={role}
      path={path}
      onClose={() => {
        if (uid) void markIntroSeen(uid, open.key);
        setOpen(null);
      }}
    />
  );
}

/** "Learn · 60s" pill for a screen header: replays this screen's intro (or `introKey`). Hidden when there's none. */
export function LearnButton({ introKey }: { introKey?: string }) {
  const pathname = usePathname();
  const { role } = useRole();
  const intro = introKey ? introByKey(introKey) : role ? introForPath(pathname, role) : null;
  if (!intro) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${intro.title} in 60 seconds`}
      onPress={() => openFeatureIntro(intro.key)}
      style={({ pressed }) => ({ minHeight: 44, borderRadius: 999, backgroundColor: LC.navy, flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 6, paddingRight: 14, opacity: pressed ? 0.85 : 1 })}
    >
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: LC.mint, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: LC.navy, fontSize: 11 }}>▶</Text>
      </View>
      <Text style={{ fontFamily: fonts.extrabold, fontSize: 14, color: LC.cream }}>Learn</Text>
      <Text style={{ fontFamily: MONO, fontSize: 11, color: LC.mint }}>60s</Text>
    </Pressable>
  );
}
