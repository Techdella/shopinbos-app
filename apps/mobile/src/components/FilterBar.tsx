import type { ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Eyebrow } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { ChipRow } from "@/components/kit";
import { Sheet } from "@/components/Sheet";
import { LinkButton, PillButton, T } from "@/components/ui";
import { colors, radii } from "@/theme";

// Filters on the phone's lists (Find products, Products, Orders, Customers, Shop looks): one row of chips that
// scrolls sideways, with a "Filters" button first that opens a sheet holding the rest. The words come from each
// screen's own namespace.

/** The sideways chip row. Put `Seg` or `Chip` children in it; `onMore` adds the Filters button (with a count of
 * the filters picked in the sheet). It bleeds to the screen edges so the chips scroll under the gutter. */
export function FilterBar({ children, onMore, moreLabel, moreCount = 0, testID }: { children?: ReactNode; onMore?: () => void; moreLabel?: string; moreCount?: number; testID?: string }) {
  return (
    <ScrollView
      testID={testID}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={{ marginHorizontal: -20, flexGrow: 0 }}
      contentContainerStyle={{ gap: 8, paddingHorizontal: 20, alignItems: "center" }}
    >
      {onMore && moreLabel ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={moreCount ? `${moreLabel}, ${moreCount}` : moreLabel}
          onPress={onMore}
          style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 13, borderRadius: radii.pill, borderWidth: 1.5, borderColor: moreCount ? colors.ink : colors.line, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed ? 0.85 : 1 })}
        >
          <AppIcon name="filter" size={17} />
          <T weight="bold" style={{ fontSize: 15 }}>{moreLabel}</T>
          {moreCount ? (
            <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" }}>
              <T weight="extrabold" style={{ fontSize: 12, color: "#FFFFFF" }}>{String(moreCount)}</T>
            </View>
          ) : null}
        </Pressable>
      ) : null}
      {children}
    </ScrollView>
  );
}

/** One question in the Filters sheet: a small label over wrapping chips. */
export function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Eyebrow>{label}</Eyebrow>
      <ChipRow>{children}</ChipRow>
    </View>
  );
}

/** The Filters sheet: the groups, then "Show results" and "Clear". */
export function FilterSheet({ visible, onClose, title, doneLabel, clearLabel, onClear, children }: { visible: boolean; onClose: () => void; title: string; doneLabel: string; clearLabel?: string; onClear?: () => void; children: ReactNode }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ gap: 18, paddingBottom: 4 }} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      <PillButton title={doneLabel} onPress={onClose} />
      {onClear && clearLabel ? <LinkButton title={clearLabel} onPress={onClear} /> : null}
    </Sheet>
  );
}
