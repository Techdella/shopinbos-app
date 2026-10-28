import { useMemo, type ReactNode } from "react";
import { Pressable, TextInput, View } from "react-native";
import { router } from "expo-router";
import { HANDLING_DAYS, SUPPLIER_LEVEL_LABELS, type LevelGoal } from "@shared/dropship-rules";
import { Stepper } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { ChipRow } from "@/components/kit";
import { Chip, Segmented, T, Toggle } from "@/components/ui";
import {
  MAX_BREAKS,
  breakRange,
  formDropshipCost,
  goalShare,
  goalValue,
  naira,
  nextBreak,
  preorderMeter,
  wordsOf,
  type DropshipForm,
  type PricesForm,
} from "@/lib/dropship-pure";
import { useT } from "@/lib/i18n";
import type { SupplierLevelView } from "@/lib/supplier";
import { colors, fonts, radii } from "@/theme";

// The supplier's side of the Supplier & Dropship Rules on the phone (shared/dropship-rules.ts):
//   ChannelPrices      P-Pricing: "Same price for all" or "Different per channel" (dropship price, wholesale price
//                      and quantity breaks, the pre-order price, locked with a meter below Established), then what
//                      sellers charge (suggested, lowest allowed)
//   DropshipSettings   P-Dropship: single pieces or a minimum, how fast they pack, parcel size, samples
//   Meter, GoalList    the orange meters of the level screens (P-Tier, A-Rider-POD)
// Words: wordsOf(t) → t.dynamic("dropship.<key>", English), see lib/dropship-pure.ts.

/** The screen's words: the catalog's "dropship.*" entry when there is one, else the English given. */
export function useWords() {
  const t = useT("m_supplier", "common");
  return useMemo(() => wordsOf(t), [t]);
}

/** A white card (`.ch`) with an optional bold heading line, a coloured dot and a grey hint on the right. */
export function ChannelCard({ title, dot, hint, locked, children }: { title?: string; dot?: string; hint?: string; locked?: boolean; children?: ReactNode }) {
  return (
    <View style={{ backgroundColor: locked ? colors.grayTint : colors.surface, borderRadius: radii.card, paddingHorizontal: 14, paddingVertical: 12, gap: 8, ...(locked ? { borderWidth: 2, borderStyle: "dashed" as const, borderColor: colors.lineStrong } : {}) }}>
      {title ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {dot ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot }} /> : null}
          <T weight="extrabold" style={{ fontSize: 15, flexShrink: 1 }}>{title}</T>
          {hint ? <T weight="semibold" style={{ marginLeft: "auto", fontSize: 12, color: colors.inkSoft }}>{hint}</T> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** A naira box (`.price`): "₦ 9,500   per piece". */
export function PriceInput({ value, onChange, label, suffix, prefix, compact, placeholder }: { value: string; onChange: (text: string) => void; label: string; suffix?: string; prefix?: string; compact?: boolean; placeholder?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, height: compact ? 44 : 48, borderRadius: 14, borderWidth: 2, borderColor: colors.line, paddingHorizontal: 14, backgroundColor: colors.surface, flex: compact ? 1 : undefined }}>
      {prefix ? <T weight="bold" style={{ fontSize: 12, color: colors.inkSoft }}>{prefix}</T> : null}
      <T style={{ fontFamily: fonts.display, fontSize: compact ? 17 : 20 }}>₦</T>
      <TextInput
        value={value}
        onChangeText={(text) => onChange(text.replace(/[^\d.,]/g, ""))}
        keyboardType="decimal-pad"
        accessibilityLabel={label}
        placeholder={placeholder ?? "0"}
        placeholderTextColor={colors.inkFaint}
        style={{ flex: 1, minWidth: 40, fontFamily: fonts.display, fontSize: compact ? 17 : 20, color: colors.ink, paddingVertical: 0 }}
      />
      {suffix ? <T weight="bold" style={{ fontSize: 12, color: colors.inkSoft }}>{suffix}</T> : null}
    </View>
  );
}

/** The orange progress bar (`.meter`). */
export function Meter({ share, label }: { share: number; label: string }) {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.round(share * 100) }} style={{ height: 8, borderRadius: 999, backgroundColor: colors.track, overflow: "hidden" }}>
      <View style={{ width: `${Math.round(Math.max(0, Math.min(1, share)) * 100)}%`, height: "100%", borderRadius: 999, backgroundColor: colors.accent }} />
    </View>
  );
}

/** The goals left to the next level: a meter for counts ("62 / 100"), the value or Done for checks. */
export function GoalList({ goals, action }: { goals: readonly LevelGoal[]; action?: (goal: LevelGoal) => { label: string; onPress: () => void } | null }) {
  const words = useWords();
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 16, gap: 14 }}>
      {goals.map((goal) => {
        const extra = !goal.done && action ? action(goal) : null;
        const value = goalValue(goal);
        return (
          <View key={goal.key} style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <T weight="semibold" style={{ flex: 1, fontSize: 15 }}>{words(`goal.${goal.key}`, goal.label)}</T>
              {extra ? (
                <T weight="extrabold" accessibilityRole="link" onPress={extra.onPress} style={{ fontSize: 15, color: colors.accentInk }}>{extra.label}</T>
              ) : goal.kind === "count" ? (
                <T weight="extrabold" style={{ fontSize: 15 }}>{value}</T>
              ) : (
                <T weight="extrabold" style={{ fontSize: 15, color: goal.done ? colors.success : colors.accentInk }}>{value || (goal.done ? words("goal.done", "Done") : words("goal.notYet", "Not yet"))}</T>
              )}
            </View>
            {goal.kind === "count" ? <Meter share={goalShare(goal)} label={`${goal.label}: ${value}`} /> : null}
          </View>
        );
      })}
    </View>
  );
}

/** The level ladder (`.ladder`): each level as a step, done ones ticked and the current one dark. */
export function Ladder({ levels, current }: { levels: { key: string; label: string }[]; current: string }) {
  const at = Math.max(0, levels.findIndex((level) => level.key === current));
  return (
    <View style={{ flexDirection: "row", gap: 6 }} accessibilityLabel={`${levels[at]?.label ?? ""}, ${at + 1} / ${levels.length}`}>
      {levels.map((level, index) => {
        const state = index < at ? "done" : index === at ? "cur" : "todo";
        return (
          <View key={level.key} style={{ flex: 1, alignItems: "center", gap: 6, paddingVertical: 8, borderRadius: 14, backgroundColor: state === "cur" ? colors.ink : state === "done" ? colors.successTint : "rgba(255,255,255,0.6)" }}>
            <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: state === "cur" ? colors.accent : state === "done" ? colors.success : colors.toggleOff, alignItems: "center", justifyContent: "center" }}>
              {state === "done" ? <AppIcon name="check" size={11} color="#FFFFFF" strokeWidth={3} /> : null}
            </View>
            <T weight="extrabold" numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 11, letterSpacing: 0.6, color: state === "cur" ? "#FFFFFF" : colors.ink }}>{level.label.toUpperCase()}</T>
          </View>
        );
      })}
    </View>
  );
}

/** Pre-order below Established: a lock, what unlocks it and how far they are ("62 of 100 orders · 18 of 30 reviews"). */
export function LockedPreorderCard({ level }: { level: SupplierLevelView | null }) {
  const words = useWords();
  const meter = preorderMeter(level?.goals ?? [], words);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${words("prices.preorder", "Pre-order")}. ${words("prices.preorderLocked", "Unlocks when you're Established: 100 delivered orders and 30 reviews.")} ${meter.line}`} onPress={() => router.push("/supplier/level")}>
      <ChannelCard title={words("prices.preorder", "Pre-order")} hint={words("prices.tier3", "Established")} locked>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <AppIcon name="lock" size={16} color={colors.grayInk} />
          <T style={{ flex: 1, fontSize: 13, lineHeight: 18, color: colors.grayInk }}>{words("prices.preorderLocked", "Unlocks when you're Established: 100 delivered orders and 30 reviews.")}</T>
        </View>
        {level ? (
          <>
            <Meter share={meter.share} label={meter.line} />
            <T weight="bold" style={{ fontSize: 12, color: colors.grayInk }}>{meter.line}</T>
          </>
        ) : null}
      </ChannelCard>
    </Pressable>
  );
}

/** P-Pricing: the price switch, then each channel's price and what sellers charge. */
export function ChannelPrices({ value, onChange, level, showPreorder = true }: { value: PricesForm; onChange: (next: PricesForm) => void; level: SupplierLevelView | null; showPreorder?: boolean }) {
  const words = useWords();
  const set = (patch: Partial<PricesForm>) => onChange({ ...value, ...patch });
  const perChannel = value.mode === "per_channel";
  const preorderOpen = level?.perks.preorders === true;
  const cost = formDropshipCost(value);
  const suggested = Number(value.suggested.replace(/[,\s]/g, "")) || 0;
  const setBreak = (index: number, patch: Partial<PricesForm["breaks"][number]>) => set({ breaks: value.breaks.map((row, at) => (at === index ? { ...row, ...patch } : row)) });

  return (
    <View style={{ gap: 10 }}>
      <Segmented
        options={[
          { value: "same", label: words("prices.same", "Same price for all") },
          { value: "per_channel", label: words("prices.perChannel", "Different per channel") },
        ]}
        value={value.mode}
        onChange={(mode) => set({ mode })}
      />
      {perChannel ? (
        <>
          <ChannelCard title={words("prices.dropship", "Dropship")} dot="#5B3FD6" hint={words("prices.dropshipHint", "1 piece to a customer")}>
            <PriceInput value={value.dropship} onChange={(dropship) => set({ dropship })} label={words("prices.dropshipLabel", "Dropship price per piece")} suffix={words("prices.perPiece", "per piece")} placeholder={value.base || "0"} />
          </ChannelCard>
          <ChannelCard title={words("prices.wholesale", "Wholesale")} dot={colors.forest} hint={words("prices.wholesaleHint", "Bulk to a shop")}>
            <PriceInput value={value.base} onChange={(base) => set({ base })} label={words("prices.wholesaleLabel", "Wholesale price per piece")} suffix={words("prices.perPiece", "per piece")} />
            {value.breaks.map((row, index) => (
              <View key={index} style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <QtyInput value={row.min} onChange={(min) => setBreak(index, { min })} label={words("prices.breakFrom", "Break {n}: from how many pieces", { n: index + 1 })} placeholder="6" />
                  <T style={{ color: colors.inkSoft }}>–</T>
                  <QtyInput value={row.max} onChange={(max) => setBreak(index, { max })} label={words("prices.breakTo", "Break {n}: up to how many (empty: and up)", { n: index + 1 })} placeholder={words("prices.andUp", "and up")} />
                  <Pressable accessibilityRole="button" accessibilityLabel={words("prices.removeBreak", "Remove break {n}", { n: index + 1 })} hitSlop={6} onPress={() => set({ breaks: value.breaks.filter((_, at) => at !== index) })} style={{ width: 36, height: 44, alignItems: "center", justifyContent: "center" }}>
                    <AppIcon name="x" size={16} color={colors.inkSoft} />
                  </Pressable>
                </View>
                <PriceInput compact prefix={breakRange(row) || undefined} value={row.price} onChange={(price) => setBreak(index, { price })} label={words("prices.breakPrice", "Break {n}: price per piece", { n: index + 1 })} suffix={words("prices.perPiece", "per piece")} />
              </View>
            ))}
            {value.breaks.length < MAX_BREAKS ? (
              <T weight="extrabold" accessibilityRole="button" onPress={() => set({ breaks: [...value.breaks, nextBreak(value.breaks)] })} style={{ fontSize: 13, color: colors.accentInk, paddingVertical: 4 }}>
                {words("prices.addBreak", "+ Add quantity break")}
              </T>
            ) : null}
          </ChannelCard>
          {showPreorder ? (
            preorderOpen ? (
              <ChannelCard title={words("prices.preorder", "Pre-order")} dot={colors.accent} hint={words("prices.preorderHint", "Before it's ready")}>
                <PriceInput value={value.preorder} onChange={(preorder) => set({ preorder })} label={words("prices.preorderLabel", "Pre-order price per piece")} suffix={words("prices.perPiece", "per piece")} placeholder={value.base || "0"} />
              </ChannelCard>
            ) : (
              <LockedPreorderCard level={level} />
            )
          ) : null}
        </>
      ) : (
        <ChannelCard title={words("prices.oneTitle", "One price for dropship and wholesale")}>
          <PriceInput value={value.base} onChange={(base) => set({ base })} label={words("prices.oneLabel", "Price per piece")} suffix={words("prices.perPiece", "per piece")} />
        </ChannelCard>
      )}
      <ChannelCard title={words("prices.sellersCharge", "What sellers charge")}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <T weight="bold" style={{ fontSize: 12, color: colors.inkSoft }}>{words("prices.suggested", "Suggested")}</T>
            <PriceInput compact value={value.suggested} onChange={(suggested) => set({ suggested })} label={words("prices.suggestedLabel", "Suggested price for sellers")} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <T weight="bold" style={{ fontSize: 12, color: colors.inkSoft }}>{words("prices.lowest", "Lowest allowed")}</T>
            <PriceInput compact value={value.lowest} onChange={(lowest) => set({ lowest })} label={words("prices.lowestLabel", "Lowest price a seller may list it at (optional)")} placeholder={words("prices.optional", "Optional")} />
          </View>
        </View>
        {cost > 0 && suggested > 0 ? (
          <T style={{ fontSize: 13, lineHeight: 18, color: suggested > cost ? colors.inkSoft : colors.danger }} weight={suggested > cost ? "regular" : "bold"}>
            {suggested > cost
              ? words("prices.keeps", "A seller who dropships it at {price} keeps {keeps} before fees and delivery.", { price: naira(suggested), keeps: naira(suggested - cost) })
              : words("prices.tooLow", "The suggested price should be above your dropship price, so sellers can earn.")}
          </T>
        ) : (
          <T style={{ fontSize: 13, lineHeight: 18, color: colors.inkSoft }}>{words("prices.lowestHint", "The lowest allowed price stops shops undercutting each other and your wholesale buyers.")}</T>
        )}
      </ChannelCard>
    </View>
  );
}

function QtyInput({ value, onChange, label, placeholder }: { value: string; onChange: (text: string) => void; label: string; placeholder: string }) {
  return (
    <TextInput
      value={value}
      onChangeText={(text) => onChange(text.replace(/[^\d]/g, ""))}
      keyboardType="number-pad"
      accessibilityLabel={label}
      placeholder={placeholder}
      placeholderTextColor={colors.inkFaint}
      style={{ flex: 1, height: 44, borderRadius: 14, borderWidth: 2, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 12, fontFamily: fonts.bold, fontSize: 16, color: colors.ink }}
    />
  );
}

const SIZES = [
  { band: "small", key: "small", english: "Small", hint: "Fits in a nylon" },
  { band: "medium", key: "medium", english: "Medium", hint: "Shoe box" },
  { band: "bulky", key: "bulky", english: "Large", hint: "Ghana Must Go, carton or bale" },
] as const;

/** P-Dropship: what sellers see before they add the product. */
export function DropshipSettings({ value, onChange }: { value: DropshipForm; onChange: (next: DropshipForm) => void }) {
  const words = useWords();
  const set = (patch: Partial<DropshipForm>) => onChange({ ...value, ...patch });
  const question = (text: string, sub?: string) => (
    <View style={{ gap: 2 }}>
      <T weight="extrabold" style={{ fontSize: 15 }}>{text}</T>
      {sub ? <T style={{ fontSize: 13, color: colors.inkSoft }}>{sub}</T> : null}
    </View>
  );
  const size = SIZES.find((entry) => entry.band === value.sizeBand) ?? SIZES[0];
  return (
    <View style={{ gap: 10 }}>
      <ChannelCard>
        {question(words("ds.single", "Do you ship single pieces?"))}
        <ChipRow>
          <Chip label={words("ds.singleYes", "Yes, 1 piece is fine")} on={value.single} onPress={() => set({ single: true })} />
          <Chip label={words("ds.singleNo", "No, set a minimum")} on={!value.single} onPress={() => set({ single: false })} />
        </ChipRow>
        {!value.single ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <T weight="semibold" style={{ flex: 1, fontSize: 14 }}>{words("ds.minPerOrder", "Minimum per order")}</T>
            <Stepper value={value.minQty} min={2} max={1000} onChange={(minQty) => set({ minQty })} label={words("ds.minPerOrder", "Minimum per order")} />
            <T style={{ fontSize: 14, color: colors.inkSoft }}>{words("ds.pieces", "pieces")}</T>
          </View>
        ) : null}
      </ChannelCard>
      <ChannelCard>
        {question(words("ds.packTime", "How fast do you pack an order?"), words("ds.packTimeSub", "Customers see this in the delivery date."))}
        <ChipRow>
          {HANDLING_DAYS.map((days) => (
            <Chip key={days} label={days === 1 ? words("ds.day1", "1 day") : words("ds.days", "{n} days", { n: days })} on={value.handlingDays === days} onPress={() => set({ handlingDays: days })} />
          ))}
        </ChipRow>
      </ChannelCard>
      <ChannelCard>
        {question(words("ds.size", "How big is the parcel?"), words("ds.sizeSub", "Sets the delivery price."))}
        <ChipRow>
          {SIZES.map((entry) => <Chip key={entry.band} label={words(`ds.size.${entry.key}`, entry.english)} on={value.sizeBand === entry.band} onPress={() => set({ sizeBand: entry.band })} />)}
        </ChipRow>
        <T style={{ fontSize: 13, color: colors.inkSoft }}>{words(`ds.sizeHint.${size.key}`, size.hint)}</T>
      </ChannelCard>
      <ChannelCard>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <T weight="extrabold" style={{ fontSize: 15 }}>{words("ds.sample", "Sellers can order 1 sample")}</T>
            <T style={{ fontSize: 13, color: colors.inkSoft }}>{words("ds.sampleSub", "At your dropship price, to check quality")}</T>
          </View>
          <Toggle on={value.sample} onChange={(sample) => set({ sample })} label={words("ds.sampleLabel", "Allow samples")} />
        </View>
      </ChannelCard>
    </View>
  );
}

/** "You're Trusted" for a level key. */
export function levelName(level: string | null | undefined, words: ReturnType<typeof wordsOf>) {
  const key = level === "established" || level === "trusted" ? level : "new";
  return words(`level.${key}`, SUPPLIER_LEVEL_LABELS[key]);
}
