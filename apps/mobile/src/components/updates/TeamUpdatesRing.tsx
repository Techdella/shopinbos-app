import { useCallback, useMemo, useState } from "react";
import { Image, Pressable, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { T } from "@/components/ui";
import type { StatusAuthor } from "@/lib/familiar";
import { useShopinbosHere } from "@/lib/shopinbos";
import { fetchTeamUpdates, markTeamUpdateSeen, withTeamUpdates, type TeamUpdate } from "@/lib/updates";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";
import { TeamUpdatesViewer } from "./TeamUpdatesViewer";

// The Shopinbos team's ring in the Status row (StatusRow `leading`): shows when there are weekly updates for this
// role, orange-ringed while some are unseen. Tapping plays them from the first unseen one.

const RING = 64;
const MARK = require("../../../assets/brand/mark-white.png") as number;

/** The team's weekly updates for this role, refreshed when the screen comes back into view. */
export function useTeamUpdates() {
  const [updates, setUpdates] = useState<TeamUpdate[]>([]);
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
  return { updates, markSeen };
}

/**
 * One Shopinbos ring in the Status row: when Shopinbos's getting-started ring is there, the weekly updates join it
 * (lib/updates withTeamUpdates) and `leading` is empty; otherwise the updates keep their own ring. Pass `authors`
 * to both StatusRow and StoryViewer.
 */
export function useShopinbosRings(feed: StatusAuthor[] | null | undefined) {
  const team = useTeamUpdates();
  const here = useShopinbosHere();
  const merged = useMemo(() => withTeamUpdates(feed ?? [], team.updates, here.hidden), [feed, team.updates, here.hidden]);
  return { authors: merged.authors, leading: merged.merged ? null : <TeamUpdatesRingView team={team} /> };
}

export function TeamUpdatesRing() {
  return <TeamUpdatesRingView team={useTeamUpdates()} />;
}

function TeamUpdatesRingView({ team }: { team: ReturnType<typeof useTeamUpdates> }) {
  const t = useT("nav");
  const { updates, markSeen } = team;
  const [open, setOpen] = useState<number | null>(null);

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
