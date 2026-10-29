import { useMemo, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { AppIcon } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { Field, PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { colors, radii } from "@/theme";

// A state (or any long list) as one field that opens a searchable list, instead of 37 chips: "Choose states" →
// a sheet with a search box ("og" finds Ogun), A–Z by the name people say (Abuja (FCT) under A), a tick on each
// chosen one. Multi-select by default; `single` closes on the first tap.

export type PickOption = { value: string; label: string };

/** Lower-case, accents dropped: "ọ̀yọ́" and "Oyo" match. */
export function plainText(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** The options sorted by label and filtered by the query (matching the start of any word first). */
export function filterOptions(options: readonly PickOption[], query: string) {
  const sorted = [...options].sort((a, b) => a.label.localeCompare(b.label));
  const q = plainText(query);
  if (!q) return sorted;
  const starts = sorted.filter((option) => plainText(option.label).split(/[\s()/-]+/).some((word) => word.startsWith(q)));
  const contains = sorted.filter((option) => !starts.includes(option) && plainText(option.label).includes(q));
  return [...starts, ...contains];
}

/** What the closed field says: nothing, one name, or "Lagos, Ogun +2". */
export function pickedSummary(options: readonly PickOption[], selected: readonly string[]) {
  const labels = selected.map((value) => options.find((option) => option.value === value)?.label ?? value);
  if (labels.length <= 2) return labels.join(", ");
  return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
}

export function StatePicker({
  options,
  selected,
  onToggle,
  single = false,
  title,
  placeholder,
  testID,
}: {
  options: readonly PickOption[];
  selected: readonly string[];
  onToggle: (value: string) => void;
  single?: boolean;
  /** The sheet's title, e.g. "Which states?". */
  title?: string;
  /** What the field says when nothing is picked. */
  placeholder?: string;
  testID?: string;
}) {
  const t = useT("m_ui");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const shown = useMemo(() => filterOptions(options, query), [options, query]);
  const summary = pickedSummary(options, selected);
  const close = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={summary || placeholder || t("pick.states")}
        onPress={() => setOpen(true)}
        style={{ minHeight: 52, borderRadius: radii.field, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 }}
      >
        <AppIcon name="pin" size={18} color={colors.inkSoft} />
        <T weight={summary ? "bold" : "regular"} numberOfLines={1} style={{ flex: 1, fontSize: 16, color: summary ? colors.ink : colors.inkFaint }}>
          {summary || placeholder || t("pick.states")}
        </T>
        <AppIcon name="chevron" size={16} color={colors.inkSoft} />
      </Pressable>

      <Sheet visible={open} onClose={close} title={title ?? t("pick.states")} testID={testID ? `${testID}-sheet` : undefined}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Field value={query} onChangeText={setQuery} placeholder={t("pick.search")} accessibilityLabel={t("pick.search")} autoCorrect={false} autoCapitalize="none" returnKeyType="search" />
          </View>
        </View>
        <FlatList
          data={shown}
          keyExtractor={(item) => item.value}
          keyboardShouldPersistTaps="handled"
          style={{ maxHeight: 360, marginTop: 8 }}
          ListEmptyComponent={<T style={{ color: colors.inkSoft, paddingVertical: 16, textAlign: "center" }}>{t("pick.none")}</T>}
          renderItem={({ item }) => {
            const on = selected.includes(item.value);
            return (
              <Pressable
                accessibilityRole={single ? "radio" : "checkbox"}
                accessibilityState={single ? { selected: on } : { checked: on }}
                onPress={() => {
                  onToggle(item.value);
                  if (single) close();
                }}
                style={({ pressed }) => ({ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: colors.line, opacity: pressed ? 0.7 : 1 })}
              >
                <T weight={on ? "bold" : "regular"} style={{ flex: 1, fontSize: 16 }}>{item.label}</T>
                <View style={{ width: 24, height: 24, borderRadius: single ? 12 : 7, borderWidth: 2, borderColor: on ? colors.ink : colors.line, backgroundColor: on ? colors.inkFill : "transparent", alignItems: "center", justifyContent: "center" }}>
                  {on ? <AppIcon name="check" size={14} color="#FFFFFF" strokeWidth={3} /> : null}
                </View>
              </Pressable>
            );
          }}
        />
        {single ? null : (
          <PillButton title={selected.length ? t("pick.done", { count: selected.length }) : t("pick.close")} tone="accent" style={{ marginTop: 12 }} onPress={close} />
        )}
      </Sheet>
    </>
  );
}
