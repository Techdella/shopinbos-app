import { useCallback, useState } from "react";
import { Image, Pressable, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { T } from "@/components/ui";
import { fetchTeamUpdates, markTeamUpdateSeen, type TeamUpdate } from "@/lib/updates";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";
import { TeamUpdatesViewer } from "./TeamUpdatesViewer";

// The Shopinbos team's ring in the Status row (StatusRow `leading`): shows when there are weekly updates for this
// role, orange-ringed while some are unseen. Tapping plays them from the first unseen one.

const RING = 64;
const MARK = require("../../../assets/brand/mark-white.png") as number;

export function TeamUpdatesRing() {
  const t = useT("nav");
  const [updates, setUpdates] = useState<TeamUpdate[]>([]);
  const [open, setOpen] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void fetchTeamUpdates().then((list) => alive && setUpdates(list));
      return () => {
        alive = false;
      };
    }, []),
  );

  const markSeen = useCallback((id: string) => {
    setUpdates((current) => current.map((update) => (update.id === id ? { ...update, seen: true } : update)));
    void markTeamUpdateSeen(id);
  }, []);

  if (!updates.length) return null;
  const unseen = updates.filter((update) => !update.seen).length;
  const start = Math.max(0, updates.findIndex((update) => !update.seen));

  return (
    <>
      <Pressable
        testID="team-updates-ring"
        accessibilityRole="button"
        accessibilityLabel={unseen ? t("updates.ringNew", { count: unseen }) : t("updates.ring")}
        onPress={() => setOpen(start)}
        style={{ width: 68, alignItems: "center", gap: 6 }}
      >
        <View style={{ width: RING, height: RING, borderRadius: RING / 2, padding: 2.5, borderWidth: 2.5, borderColor: unseen ? colors.accent : "#D3D0DB", alignItems: "center", justifyContent: "center" }}>
          <View style={{ width: RING - 13, height: RING - 13, borderRadius: (RING - 13) / 2, backgroundColor: "#0E2A38", alignItems: "center", justifyContent: "center" }}>
            <Image source={MARK} style={{ width: 24, height: 27 }} resizeMode="contain" />
          </View>
        </View>
        <T weight="semibold" numberOfLines={1} style={{ fontSize: 12, color: colors.inkSoft, maxWidth: 68 }}>Shopinbos</T>
      </Pressable>
      {open !== null ? <TeamUpdatesViewer updates={updates} startAt={open} onSeen={markSeen} onClose={() => setOpen(null)} /> : null}
    </>
  );
}
