import { Pressable, View } from "react-native";
import { AppIcon } from "@/components/icons";
import { Card, Field, Label, LinkButton, T, Toggle } from "@/components/ui";
import type { AutoReplyRules } from "@/lib/inbox";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// In-app editors for what used to open the web: opening hours per day and keyword replies (Auto-replies), and the
// chatbot's questions and answers. The server normalises everything on save (src/lib/inbox/assistant.ts): times
// are "HH:MM", keyword replies need a word and a reply, FAQs a question and an answer.

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
/** m_ui "day.short.<n>" counts from Sunday. */
const DAY_INDEX: Record<(typeof WEEKDAYS)[number], number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };

export const isClock = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim());

/** "9" → "09:00", "930" → "09:30", "9:5" stays as typed (and is flagged). */
export function tidyClock(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  if (/^\d{1,2}$/.test(digits) && Number(digits) < 24) return `${digits.padStart(2, "0")}:00`;
  if (/^\d{3,4}$/.test(digits)) {
    const padded = digits.padStart(4, "0");
    return `${padded.slice(0, 2)}:${padded.slice(2)}`;
  }
  return value.trim();
}

function RemoveButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 })}>
      <AppIcon name="x" size={16} />
    </Pressable>
  );
}

export function HoursEditor({ days, onChange }: { days: AutoReplyRules["hours"]["days"]; onChange: (days: AutoReplyRules["hours"]["days"]) => void }) {
  const t = useT("m_chats", "m_ui");
  return (
    <Card style={{ paddingVertical: 4 }}>
      {WEEKDAYS.map((day, index) => {
        const hours = days[day] ?? { open: false, from: "09:00", to: "18:00" };
        const name = t.dynamic(`day.short.${DAY_INDEX[day]}`, day);
        const set = (patch: Partial<typeof hours>) => onChange({ ...days, [day]: { ...hours, ...patch } });
        const timeField = (key: "from" | "to") => (
          <Field
            value={hours[key]}
            onChangeText={(value) => set({ [key]: value })}
            onBlur={() => set({ [key]: tidyClock(hours[key]) })}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            accessibilityLabel={t(key === "from" ? "hours.opensLabel" : "hours.closesLabel", { day: name })}
            style={{ flex: 1, minWidth: 0, height: 44, paddingHorizontal: 10, textAlign: "center", borderColor: isClock(hours[key]) ? colors.line : colors.danger }}
          />
        );
        return (
          <View key={day} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
            <T weight="bold" style={{ width: 42, fontSize: 15 }}>{name}</T>
            {hours.open ? (
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
                {timeField("from")}
                <T style={{ color: colors.inkSoft }}>–</T>
                {timeField("to")}
              </View>
            ) : (
              <T style={{ flex: 1, color: colors.inkSoft, fontSize: 15 }}>{t("hours.closed")}</T>
            )}
            <Toggle on={hours.open} onChange={(open) => set({ open })} label={t("hours.openLabel", { day: name })} />
          </View>
        );
      })}
    </Card>
  );
}

/** Pairs of texts: keyword replies (words → reply) or FAQs (question → answer). */
export function PairsEditor({
  items,
  onChange,
  first,
  second,
  addLabel,
  max,
}: {
  items: Array<{ a: string; b: string }>;
  onChange: (items: Array<{ a: string; b: string }>) => void;
  first: { label: string; placeholder: string; maxLength: number };
  second: { label: string; placeholder: string; maxLength: number };
  addLabel: string;
  max: number;
}) {
  const t = useT("m_chats");
  const set = (index: number, patch: Partial<{ a: string; b: string }>) => onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  return (
    <View style={{ gap: 10 }}>
      {items.map((item, index) => (
        <Card key={index} style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Label>{first.label}</Label>
            </View>
            <RemoveButton label={t("pairs.remove")} onPress={() => onChange(items.filter((_, i) => i !== index))} />
          </View>
          <Field value={item.a} onChangeText={(a) => set(index, { a })} placeholder={first.placeholder} maxLength={first.maxLength} />
          <Label>{second.label}</Label>
          <Field value={item.b} onChangeText={(b) => set(index, { b })} placeholder={second.placeholder} maxLength={second.maxLength} multiline style={{ height: 88, paddingTop: 14, textAlignVertical: "top" }} />
        </Card>
      ))}
      {items.length < max ? <LinkButton title={addLabel} onPress={() => onChange([...items, { a: "", b: "" }])} /> : null}
    </View>
  );
}
