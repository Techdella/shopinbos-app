import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import type { TFunction } from "@shared/i18n";
import { AppIcon } from "@/components/icons";
import { Badge } from "@/components/kit";
import { Sheet } from "@/components/Sheet";
import { Chip, PillButton, T } from "@/components/ui";
import { campaignTimer, clockText, countdownParts, fromWall, monthGrid, shiftMonth, TIME_CHOICES, toWall, type CampaignStatus, type CampaignTiming } from "@/lib/campaigns-pure";
import { useT } from "@/lib/i18n";
import { colors, radii } from "@/theme";

// Pieces the campaign screens and the Home card share: the ticking server clock, the countdown pill, status
// badges, dates in the campaign's time zone and the date-and-time sheet.

type Words = Pick<TFunction, "dynamic">;

/** Server time that ticks every `everyMs` (offset = the server clock's lead, from lib/campaigns). */
export function useServerNow(offset: number, everyMs = 1000) {
  const [phoneNow, setPhoneNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setPhoneNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return phoneNow + offset;
}

/** "27 Nov, 12:00am" in the campaign's time zone (with the year when it isn't this year's). */
export function whenText(value: string | number | null | undefined, zone: string, now: number, t: Words) {
  if (value === null || value === undefined || value === "") return "";
  const ms = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(ms)) return "";
  const wall = toWall(ms, zone);
  const month = t.dynamic(`day.month.${wall.month - 1}`);
  const year = toWall(now, zone).year === wall.year ? "" : ` ${wall.year}`;
  return `${wall.day} ${month}${year}, ${clockText(wall.hour, wall.minute)}`;
}

/** "2d 04:13:22" in the app language. */
export function countdownText(ms: number, t: Words) {
  const { days, clock } = countdownParts(ms);
  return days > 0 ? t.dynamic("timer.days", `${days}d ${clock}`, { days, clock }) : clock;
}

/** The line a countdown shows: "Ends in 2d 04:13:22", "Starts in …", "Paused", "Ended 27 Nov, 11:59pm". */
export function timerLine(campaign: CampaignTiming & { timezone?: string }, now: number, t: Words) {
  const timer = campaignTimer(campaign, now);
  if (timer.kind === "ends") return t.dynamic("timer.endsIn", "", { time: countdownText(timer.msLeft, t) });
  if (timer.kind === "starts") return t.dynamic("timer.startsIn", "", { time: countdownText(timer.msLeft, t) });
  if (timer.kind === "paused") return t.dynamic("timer.paused");
  if (timer.kind === "ended") return t.dynamic("timer.ended", "", { date: whenText(timer.target, campaign.timezone ?? "Africa/Lagos", now, t) });
  return t.dynamic("timer.noDates");
}

const STATUS_TONE: Record<CampaignStatus, { bg: string; fg: string }> = {
  live: { bg: colors.successTint, fg: colors.success },
  ending_soon: { bg: "#FDF0D5", fg: "#8A5A00" },
  scheduled: { bg: colors.mintTint, fg: colors.forest },
  paused: { bg: colors.canvas, fg: colors.inkSoft },
  draft: { bg: colors.canvas, fg: colors.inkSoft },
  ended: { bg: colors.canvas, fg: colors.inkSoft },
  archived: { bg: colors.canvas, fg: colors.inkSoft },
};

export function StatusBadge({ status }: { status: CampaignStatus }) {
  const t = useT("m_campaigns");
  const tone = STATUS_TONE[status];
  return <Badge label={t.dynamic(`status.${status}`, status)} bg={tone.bg} fg={tone.fg} />;
}

/** The ticking countdown in a rounded pill (amber when it is about to end). */
export function CountdownPill({ campaign, now, big = false }: { campaign: CampaignTiming & { timezone?: string }; now: number; big?: boolean }) {
  const t = useT("m_campaigns", "m_ui");
  const timer = campaignTimer(campaign, now);
  const urgent = timer.kind === "ends" && timer.msLeft < 24 * 3_600_000;
  const ticking = timer.kind === "ends" || timer.kind === "starts";
  return (
    <View
      accessibilityRole="timer"
      style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", maxWidth: "100%", paddingHorizontal: 12, minHeight: big ? 40 : 32, borderRadius: radii.pill, borderWidth: 1, borderColor: urgent ? "#F2A93B" : colors.line, backgroundColor: urgent ? "#FDF0D9" : ticking ? colors.surface : colors.canvas }}
    >
      <View style={{ flexShrink: 0 }}><AppIcon name="clock" size={big ? 18 : 15} color={urgent ? "#7A4D06" : colors.ink} /></View>
      <T weight="bold" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ flexShrink: 1, fontSize: big ? 16 : 14, color: urgent ? "#7A4D06" : colors.ink, fontVariant: ["tabular-nums"] }}>{timerLine(campaign, now, t)}</T>
    </View>
  );
}

/** A date button for the form: "Starts" with "27 Nov, 12:00am" under it. */
export function DateButton({ label, value, zone, now, onPress }: { label: string; value: number | null; zone: string; now: number; onPress: () => void }) {
  const t = useT("m_campaigns", "m_ui");
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}. ${value !== null ? whenText(value, zone, now, t) : t("form.pickDate")}`} onPress={onPress} style={({ pressed }) => ({ flex: 1, minHeight: 64, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 10, justifyContent: "center", opacity: pressed ? 0.85 : 1 })}>
      <T style={{ color: colors.inkSoft, fontSize: 13.5 }}>{label}</T>
      <T weight="extrabold" style={{ fontSize: 15.5, marginTop: 2 }}>{value !== null ? whenText(value, zone, now, t) : t("form.pickDate")}</T>
    </Pressable>
  );
}

// Monday first, as m_ui day.short.<0-6> (0 = Sunday).
const WEEK = [1, 2, 3, 4, 5, 6, 0];

/**
 * Pick a day on a little calendar and a time from a few common ones, in the campaign's time zone. Give it a new
 * `key` each time it opens, so it starts from the date it shows.
 */
export function DateTimeSheet({ visible, title, value, zone, now, onClose, onPick }: { visible: boolean; title: string; value: number | null; zone: string; now: number; onClose: () => void; onPick: (ms: number) => void }) {
  const t = useT("m_campaigns", "m_ui");
  const start = toWall(value ?? now, zone);
  const [month, setMonth] = useState({ year: start.year, month: start.month });
  const [day, setDay] = useState({ year: start.year, month: start.month, day: start.day });
  const [time, setTime] = useState<[number, number]>(value !== null ? [start.hour, start.minute] : [0, 0]);

  const cells = monthGrid(month.year, month.month);
  const times = TIME_CHOICES.some(([h, m]) => h === time[0] && m === time[1]) ? TIME_CHOICES : [...TIME_CHOICES, time].sort((a, b) => a[0] * 60 + a[1] - (b[0] * 60 + b[1]));
  const arrow = (by: number, label: string) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={6} onPress={() => setMonth(shiftMonth(month.year, month.month, by))} style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" }}>
      <View style={{ transform: [{ rotate: by < 0 ? "180deg" : "0deg" }] }}>
        <AppIcon name="chevron" size={18} />
      </View>
    </Pressable>
  );

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        {arrow(-1, t("cal.prev"))}
        <T weight="extrabold" style={{ fontSize: 17 }}>{`${t.dynamic(`day.month.${month.month - 1}`)} ${month.year}`}</T>
        {arrow(1, t("cal.next"))}
      </View>
      <View style={{ flexDirection: "row" }}>
        {WEEK.map((weekday) => (
          <T key={weekday} style={{ flex: 1, textAlign: "center", color: colors.inkSoft, fontSize: 12.5 }}>{t.dynamic(`day.short.${weekday}`)}</T>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {cells.map((cell, index) => {
          const on = cell !== null && day.year === month.year && day.month === month.month && day.day === cell;
          return (
            <View key={index} style={{ width: `${100 / 7}%`, alignItems: "center", paddingVertical: 2 }}>
              {cell !== null ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${cell} ${t.dynamic(`day.month.${month.month - 1}`)} ${month.year}`}
                  onPress={() => setDay({ year: month.year, month: month.month, day: cell })}
                  style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: on ? colors.ink : "transparent" }}
                >
                  <T weight={on ? "extrabold" : "regular"} style={{ fontSize: 15, color: on ? "#FFFFFF" : colors.ink }}>{String(cell)}</T>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>
      <T weight="bold" style={{ fontSize: 15 }}>{t("form.time")}</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {times.map(([hour, minute]) => <Chip key={`${hour}:${minute}`} label={clockText(hour, minute)} on={time[0] === hour && time[1] === minute} onPress={() => setTime([hour, minute])} />)}
      </View>
      <PillButton title={t("form.done")} style={{ marginTop: 6 }} onPress={() => onPick(fromWall({ ...day, hour: time[0], minute: time[1] }, zone))} />
    </Sheet>
  );
}
