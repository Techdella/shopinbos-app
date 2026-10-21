import { useState } from "react";
import { ScrollView, View } from "react-native";
import { Sheet } from "@/components/Sheet";
import { List, Row, Seg } from "@/components/design";
import { Notice, PillButton, T, Toggle } from "@/components/ui";
import { canSchedule, firstSlot, sameDay, scheduleAt, scheduleDays, SCHEDULE_HOURS } from "@/lib/familiar-pure";
import type { PostPlatform } from "@/lib/familiar";
import { formatDate } from "@shared/i18n";
import { useLocale, useT } from "@/lib/i18n";
import { colors } from "@/theme";

// "When should it go out?" ("Familiar app" prototype sheet `stSched`): day chips, time chips and the apps it's for.
// We don't post for anyone (decision 3): at that time the phone gets a reminder that opens the post with Share.

export const PLATFORMS: PostPlatform[] = ["whatsapp", "instagram", "facebook", "tiktok"];
export const PLATFORM_KEY = { whatsapp: "plat.whatsapp", instagram: "plat.instagram", facebook: "plat.facebook", tiktok: "plat.tiktok" } as const;

export function ScheduleSheet({
  visible,
  onClose,
  onSave,
  initialPlatforms = ["whatsapp"],
}: {
  visible: boolean;
  onClose: () => void;
  /** Saves the post; throws with a readable message when it can't. */
  onSave: (input: { scheduledAt: Date; platforms: PostPlatform[] }) => Promise<void>;
  initialPlatforms?: PostPlatform[];
}) {
  const t = useT("m_familiar");
  const locale = useLocale();
  const [now] = useState(() => new Date());
  const first = firstSlot(now);
  const [day, setDay] = useState<Date>(first.day);
  const [hour, setHour] = useState<number>(first.hour);
  const [platforms, setPlatforms] = useState<PostPlatform[]>(initialPlatforms);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const days = scheduleDays(now);
  const dayLabel = (date: Date, index: number) => (index === 0 ? t("sched.today") : index === 1 ? t("sched.tomorrow") : formatDate(date, locale, { weekday: "short", day: "numeric", timeZone: undefined }));
  const timeLabel = (h: number) => formatDate(scheduleAt(now, h), locale, { hour: "numeric", minute: "2-digit", timeZone: undefined });
  const okTime = canSchedule(day, hour, new Date());

  const pickDay = (date: Date) => {
    setDay(date);
    if (!canSchedule(date, hour, new Date())) {
      const next = SCHEDULE_HOURS.find((h) => canSchedule(date, h, new Date()));
      if (next !== undefined) setHour(next);
    }
  };

  const toggle = (platform: PostPlatform, on: boolean) => setPlatforms((current) => (on ? [...current.filter((p) => p !== platform), platform] : current.filter((p) => p !== platform)));

  const save = async () => {
    if (!platforms.length || !okTime) return;
    setBusy(true);
    setError(null);
    try {
      await onSave({ scheduledAt: scheduleAt(day, hour), platforms });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("sched.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t("sched.title")}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityLabel={t("sched.dayLabel")}>
        {days.map((date, index) => <Seg key={date.toISOString()} label={dayLabel(date, index)} on={sameDay(date, day)} onPress={() => pickDay(date)} />)}
      </ScrollView>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }} accessibilityLabel={t("sched.timeLabel")}>
        {SCHEDULE_HOURS.filter((h) => canSchedule(day, h, now)).map((h) => <Seg key={h} label={timeLabel(h)} on={hour === h} onPress={() => setHour(h)} />)}
      </View>
      <List>
        {PLATFORMS.map((platform) => {
          const on = platforms.includes(platform);
          return <Row key={platform} title={t(PLATFORM_KEY[platform])} right={<Toggle on={on} onChange={(next) => toggle(platform, next)} label={t(PLATFORM_KEY[platform])} />} />;
        })}
      </List>
      <T style={{ fontSize: 14, lineHeight: 20, color: colors.inkSoft }}>{t("sched.remind")}</T>
      {error ? <Notice>{error}</Notice> : null}
      <PillButton title={t("sched.save")} busy={busy} disabled={!platforms.length || !okTime} onPress={() => void save()} />
    </Sheet>
  );
}
