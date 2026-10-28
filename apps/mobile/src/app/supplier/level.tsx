import { View } from "react-native";
import { router } from "expo-router";
import { SUPPLIER_LEVELS, SUPPLIER_LEVEL_LABELS, type SupplierPerks } from "@shared/dropship-rules";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { GoalList, Ladder, levelName, useWords } from "@/components/supplier/DropshipKit";
import { T } from "@/components/ui";
import type { wordsOf } from "@/lib/dropship-pure";
import { fetchSupplierLevel } from "@/lib/supplier";
import { useLoad } from "@/lib/useLoad";
import { colors, fonts, radii } from "@/theme";

// Your level (P-Tier; the web's /supplier/level): New → Trusted → Established, worked out fresh from the delivery
// record (GET /api/supplier/level). The ladder, "You're Trusted", the goals left to the next level with meters
// ("62 / 100" delivered orders, reviews, days on Shopinbos; rating and problems as values), and what the next level
// unlocks. Pre-orders open at Established. Opened from Account, Home and the locked Pre-order card.

/** What the next level unlocks, from the perks of each level (shared/dropship-rules.ts supplierPerks). */
function unlockLines(now: SupplierPerks, next: SupplierPerks, words: ReturnType<typeof wordsOf>): string[] {
  const lines: string[] = [];
  if (next.preorders && !now.preorders) lines.push(words("unlock.preorders", "Pre-orders, with up to {pct}% advance for materials", { pct: next.preorderAdvancePct }));
  if (next.openOrderLimit === null && now.openOrderLimit !== null) lines.push(words("unlock.noLimit", "No limit on open orders (now {limit})", { limit: now.openOrderLimit }));
  if (next.branding && !now.branding) lines.push(words("unlock.branding", "Offer packing slips and stickers to sellers"));
  if (next.payoutDelayDays < now.payoutDelayDays) lines.push(words("unlock.payout", "Paid {next} day after delivery, not {now}", { next: next.payoutDelayDays, now: now.payoutDelayDays }));
  if (next.preorders && !now.preorders) lines.push(words("unlock.featured", "Apply to be featured to sellers"));
  return lines;
}

export default function SupplierLevelScreen() {
  const words = useWords();
  const level = useLoad(fetchSupplierLevel);
  const data = level.data;

  return (
    <Screen title={words("level.title", "Your level")} refreshing={level.refreshing} onRefresh={() => void level.refresh()}>
      {level.loading && !data ? <LoadingBlock /> : null}
      {level.error && !data ? <ErrorState message={level.error} onRetry={() => void level.reload()} /> : null}
      {data ? (
        <>
          <View style={{ backgroundColor: colors.peach, borderRadius: radii.card, padding: 16, gap: 12 }}>
            <Ladder levels={SUPPLIER_LEVELS.map((key) => ({ key, label: words(`level.${key}`, SUPPLIER_LEVEL_LABELS[key]) }))} current={data.level} />
            <T style={{ fontFamily: fonts.display, fontSize: 26, lineHeight: 30 }}>{words("level.youre", "You're {level}", { level: levelName(data.level, words) })}</T>
            <T style={{ fontSize: 14, lineHeight: 20, color: colors.accentInk }}>
              {data.next === "established"
                ? words("level.toEstablished", "Keep delivering well to reach Established and unlock pre-orders.")
                : data.next === "trusted"
                  ? words("level.toTrusted", "Deliver well to reach Trusted: no open-order limit, branding for sellers and faster pay.")
                  : words("level.top", "You're at the top level. Pre-orders are open to you.")}
            </T>
          </View>

          {data.goals.length && data.next ? (
            <GoalList
              goals={data.goals}
              action={(goal) =>
                goal.key === "verified" ? { label: words("goal.verify", "Verify"), onPress: () => router.push("/supplier/verification") } : goal.key === "address" ? { label: words("goal.addPin", "Add"), onPress: () => router.push({ pathname: "/supplier/setup", params: { edit: "pickup" } }) } : null
              }
            />
          ) : null}

          {data.nextPerks && data.next ? (
            <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 16, gap: 8 }}>
              <T weight="extrabold" style={{ fontSize: 15 }}>{words("level.unlocks", "{level} unlocks", { level: levelName(data.next, words) })}</T>
              {unlockLines(data.perks, data.nextPerks, words).map((line) => (
                <View key={line} style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent, marginTop: 7 }} />
                  <T style={{ flex: 1, fontSize: 14, lineHeight: 20, color: colors.inkSoft }}>{line}</T>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
