import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { Sheet } from "@/components/Sheet";
import { List, Row, Seg } from "@/components/design";
import { Notice, PillButton, T, Toggle } from "@/components/ui";
import { canSchedule, firstSlot, joinNames, needsConnecting, sameDay, scheduleAt, scheduleDays, scheduleSplit, SCHEDULE_HOURS } from "@/lib/familiar-pure";
import { fetchPostAccounts, type PostAccount, type PostPlatform } from "@/lib/familiar";
import { openPath } from "@/lib/web";
import { formatDate } from "@shared/i18n";
import { useLocale, useT } from "@/lib/i18n";
import { colors, radii } from "@/theme";

// "When should it go out?" ("Familiar app" prototype sheet `stSched`): day chips, time chips and the apps it's for.
// A seller's post goes on their Social posts calendar: Facebook and Instagram post by themselves when their Page is
// connected there (else "Connect" opens Social posts → Accounts on the website); WhatsApp and TikTok get a reminder.
// Suppliers and delivery partners: every app gets a reminder that opens the post with Share.

export const PLATFORMS: PostPlatform[] = ["whatsapp", "instagram", "facebook", "tiktok"];
export const PLATFORM_KEY = { whatsapp: "plat.whatsapp", instagram: "plat.instagram", facebook: "plat.facebook", tiktok: "plat.tiktok", x: "plat.x" } as const;

/** "We'll post it on Facebook for you, and remind you for WhatsApp" for the picked apps, honest per app. */
export function useScheduleNote() {
  const t = useT("m_familiar");
  const names = (keys: readonly PostPlatform[]) => joinNames(keys.map((key) => t(PLATFORM_KEY[key])), (a, b) => t("and", { a, b }));
  return (platforms: readonly PostPlatform[], accounts: ReadonlyArray<{ key: string; auto?: boolean }> | null | undefined) => {
    const split = scheduleSplit(platforms, accounts);
    if (split.auto.length && split.remind.length) return t("sched.autoAndRemind", { auto: names(split.auto), remind: names(split.remind) });
    if (split.auto.length) return t("sched.autoOnly", { auto: names(split.auto) });
    return t("sched.remind");
  };
}

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
  const note = useScheduleNote();
  const [now] = useState(() => new Date());
  const first = firstSlot(now);
  const [day, setDay] = useState<Date>(first.day);
  const [hour, setHour] = useState<number>(first.hour);
  const [platforms, setPlatforms] = useState<PostPlatform[]>(initialPlatforms);
  const [accounts, setAccounts] = useState<PostAccount[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchPostAccounts()
      .then((list) => {
        if (!alive || !list) return;
        setAccounts(list);
        // A seller's Facebook or Instagram without the Page connected can't go out: leave it unpicked.
        setPlatforms((current) => current.filter((platform) => !needsConnecting(platform, list)));
      })
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, []);

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
      await onSave({ scheduledAt: scheduleAt(day, hour), platforms: PLATFORMS.filter((platform) => platforms.includes(platform)) });
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
          const name = t(PLATFORM_KEY[platform]);
          if (needsConnecting(platform, accounts)) {
            return (
              <Row
                key={platform}
                title={name}
                sub={t("sched.connectFirst")}
                right={<PillButton title={t("posts.connect")} tone="white" size="sm" accessibilityLabel={t("posts.connectLabel", { name })} onPress={() => void openPath("/home/marketing/social/accounts")} style={{ borderRadius: radii.pill }} />}
              />
            );
          }
          const on = platforms.includes(platform);
          const auto = accounts?.find((account) => account.key === platform)?.auto;
          return <Row key={platform} title={name} sub={auto ? t("posts.auto") : undefined} right={<Toggle on={on} onChange={(next) => toggle(platform, next)} label={name} />} />;
        })}
      </List>
      <T style={{ fontSize: 14, lineHeight: 20, color: colors.inkSoft }}>{note(platforms, accounts)}</T>
      {error ? <Notice>{error}</Notice> : null}
      <PillButton title={t("sched.save")} busy={busy} disabled={!platforms.length || !okTime} onPress={() => void save()} />
    </Sheet>
  );
}
