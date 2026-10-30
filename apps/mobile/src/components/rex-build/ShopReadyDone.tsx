import "expo-sqlite/localStorage/install";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Confetti } from "@/components/Celebrate";
import { AppIcon } from "@/components/icons";
import { T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { track, type ShopReady } from "@/lib/seller-onboarding";
import { colors, fonts } from "@/theme";

// Home's "Get your shop ready" (spec F4): when every item is done, confetti and "Your shop is fully set up", once
// per seller on this phone. Each item done since the last time Home looked is sent as checklist_item_done.

const key = (uid: string, what: string) => `shopinbos.shopReady.${what}.${uid}`;

function read(name: string) {
  try {
    return localStorage.getItem(name);
  } catch {
    return null;
  }
}

function write(name: string, value: string) {
  try {
    localStorage.setItem(name, value);
  } catch {
    // No storage: the moment may show again.
  }
}

export function useChecklistEvents(uid: string | undefined, ready: ShopReady | null) {
  useEffect(() => {
    if (!uid || !ready) return;
    const done = ready.rows.filter((row) => row.done).map((row) => row.key);
    const before = read(key(uid, "done"));
    if (before !== null) {
      const seen = new Set(before.split(",").filter(Boolean));
      for (const item of done) if (!seen.has(item)) track("checklist_item_done", { item });
    }
    write(key(uid, "done"), done.join(","));
  }, [uid, ready]);
}

export function ShopReadyDone({ uid }: { uid: string }) {
  const t = useT("m_rexBuild");
  const [show] = useState(() => read(key(uid, "celebrated")) !== "1");
  useEffect(() => {
    if (show) write(key(uid, "celebrated"), "1");
  }, [show, uid]);
  if (!show) return null;
  return (
    <View accessibilityLiveRegion="polite" style={{ backgroundColor: colors.successTint, borderRadius: 24, padding: 18, gap: 6, overflow: "hidden" }}>
      <Confetti count={40} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <AppIcon name="check" size={20} color={colors.success} strokeWidth={2.6} />
        <T style={{ flex: 1, fontFamily: fonts.display, fontSize: 20, color: colors.success }}>{t("ready.allDone")}</T>
      </View>
      <T style={{ fontSize: 15, color: colors.ink }}>{t("ready.allDoneSub")}</T>
    </View>
  );
}
