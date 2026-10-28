import { useState } from "react";
import { TextInput, View } from "react-native";
import { naira } from "@shared/onboarding";
import { MARKUP_PERCENT_CHOICES, markupExample, readMarkup, type Markup } from "@shared/supplier-markup";
import { Sheet } from "@/components/Sheet";
import { Choice } from "@/components/design";
import { PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { colors, fonts } from "@/theme";

// "How much do you add to supplier prices?" (shared/supplier-markup.ts): 20%, 30% or 50%, or a ₦ amount, with
// what a ₦10,000 product would sell at. Asked once, the first time the seller adds a supplier product (MarkupSheet),
// and changed later in Settings (app/find/markup.tsx), which shows the same picker.

type Pick = { kind: "percent"; value: number } | { kind: "amount"; text: string };

const pickOf = (markup: Markup | null): Pick => (markup?.kind === "amount" ? { kind: "amount", text: String(markup.value) } : { kind: "percent", value: markup?.value ?? 30 });

export function markupOfPick(pick: Pick): Markup | null {
  return pick.kind === "percent" ? readMarkup({ kind: "percent", value: pick.value }) : readMarkup({ kind: "amount", value: pick.text });
}

export function MarkupPicker({ value, onChange }: { value: Pick; onChange: (next: Pick) => void }) {
  const t = useT("m_find");
  const markup = markupOfPick(value);
  const example = markup ? markupExample(markup) : null;
  const percents = (MARKUP_PERCENT_CHOICES as readonly number[]).includes(value.kind === "percent" ? value.value : -1) || value.kind === "amount" ? [...MARKUP_PERCENT_CHOICES] : [...MARKUP_PERCENT_CHOICES, value.value];
  return (
    <View style={{ gap: 10 }}>
      {percents.map((percent) => (
        <Choice key={percent} title={t("markup.percent", { percent })} sub={percent === 30 ? t("markup.popular") : undefined} on={value.kind === "percent" && value.value === percent} onPress={() => onChange({ kind: "percent", value: percent })} />
      ))}
      <Choice title={t("markup.amount")} sub={t("markup.amountSub")} on={value.kind === "amount"} onPress={() => onChange({ kind: "amount", text: value.kind === "amount" ? value.text : "2000" })} />
      {value.kind === "amount" ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 2, borderColor: colors.ink, borderRadius: 16, paddingHorizontal: 14, height: 54, backgroundColor: colors.surface }}>
          <T style={{ fontFamily: fonts.display, fontSize: 20 }}>₦</T>
          <TextInput
            value={value.text}
            onChangeText={(text) => onChange({ kind: "amount", text: text.replace(/[^\d]/g, "").slice(0, 7) })}
            keyboardType="number-pad"
            accessibilityLabel={t("markup.amountLabel")}
            style={{ flex: 1, fontFamily: fonts.display, fontSize: 20, color: colors.ink, paddingVertical: 0 }}
          />
        </View>
      ) : null}
      <View style={{ backgroundColor: colors.mintTint, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11 }}>
        <T weight="bold" style={{ fontSize: 14, lineHeight: 20, color: colors.forest }}>
          {example ? t("markup.example", { cost: naira(example.cost), price: naira(example.price) }) : t("markup.amountMin")}
        </T>
        <T style={{ fontSize: 13, lineHeight: 18, color: colors.forest, marginTop: 2 }}>{t("markup.rounding")}</T>
      </View>
    </View>
  );
}

/** The question asked the first time: pick, then "Add with this price" runs the add. */
export function MarkupSheet({ visible, initial, onClose, onSave, busy }: { visible: boolean; initial: Markup | null; onClose: () => void; onSave: (markup: Markup) => void; busy?: boolean }) {
  const t = useT("m_find");
  const [pick, setPick] = useState<Pick>(() => pickOf(initial));
  const markup = markupOfPick(pick);
  return (
    <Sheet visible={visible} onClose={onClose} title={t("markup.question")} testID="markup-sheet">
      <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21, marginTop: -4 }}>{t("markup.questionSub")}</T>
      <MarkupPicker value={pick} onChange={setPick} />
      <PillButton testID="markup-save" title={t("markup.saveAdd")} busy={busy} disabled={!markup} onPress={() => markup && onSave(markup)} />
      <T style={{ color: colors.inkSoft, fontSize: 13, textAlign: "center" }}>{t("markup.later")}</T>
    </Sheet>
  );
}

export type { Pick as MarkupPick };
export { pickOf as markupPickOf };
