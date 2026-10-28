import { useMemo, useState, type ReactNode } from "react";
import { Pressable, TextInput, View } from "react-native";
import { router } from "expo-router";
import { HANDLING_DAYS, SUPPLIER_LEVEL_LABELS, type LevelGoal } from "@shared/dropship-rules";
import { Stepper } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { T, Toggle } from "@/components/ui";
import {
  MAX_BREAKS,
  breakRange,
  formDropshipCost,
  goalShare,
  goalValue,
  groupDigits,
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

/** A white card (`.ch`) with an optional bold heading line, a coloured dot (or an icon) and a grey hint on the right. */
export function ChannelCard({ title, dot, icon, hint, locked, children, padding = 14 }: { title?: string; dot?: string; icon?: ReactNode; hint?: string; locked?: boolean; children?: ReactNode; padding?: number }) {
  return (
    <View style={{ backgroundColor: locked ? colors.grayTint : colors.surface, borderRadius: radii.card, paddingHorizontal: 14, paddingVertical: padding, gap: 10, ...(locked ? { borderWidth: 2, borderStyle: "dashed" as const, borderColor: "#D9D6E2" } : {}) }}>
      {title ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {dot ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot }} /> : null}
          {icon}
          <T weight="extrabold" style={{ fontSize: 15, flexShrink: 1 }}>{title}</T>
          {hint ? <T weight="semibold" numberOfLines={1} style={{ marginLeft: "auto", fontSize: 12, color: colors.inkSoft, flexShrink: 1 }}>{hint}</T> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** A choice chip of the boards (`.chip`): 2px grey ring, ink when picked. `small`: the seller's 36px chips. */
export function BoardChip({ label, on, onPress, small, disabled }: { label: string; on: boolean; onPress: () => void; small?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on, disabled: Boolean(disabled) }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({ height: small ? 36 : 42, paddingHorizontal: small ? 12 : 14, borderRadius: 999, borderWidth: 2, borderColor: on ? colors.ink : colors.line, backgroundColor: on ? colors.ink : colors.surface, justifyContent: "center", maxWidth: "100%", opacity: disabled ? 0.45 : pressed ? 0.85 : 1 })}
    >
      <T weight="bold" numberOfLines={1} style={{ fontSize: small ? 13 : 14, color: on ? "#FFFFFF" : colors.ink }}>{label}</T>
    </Pressable>
  );
}

/** Chips that wrap (`.chips`). */
export function BoardChips({ children, gap = 8 }: { children: ReactNode; gap?: number }) {
  return <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap }}>{children}</View>;
}

/** The grey two-way switch (`.seg`): the picked side white and lifted. */
export function SoftSegmented<V extends string>({ options, value, onChange }: { options: { value: V; label: string }[]; value: V; onChange: (value: V) => void }) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: "row", backgroundColor: colors.line, borderRadius: 999, padding: 4 }}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable key={option.value} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(option.value)} style={{ flex: 1, height: 40, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: on ? colors.surface : "transparent", ...(on ? { shadowColor: colors.ink, shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 } : {}) }}>
            <T weight="extrabold" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ fontSize: 13, paddingHorizontal: 8, color: on ? colors.ink : colors.grayInk }}>{option.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A naira box (`.price`): "₦9,500   per piece". `prefix`: a quantity range on the left ("6–23"). */
export function PriceInput({ value, onChange, label, suffix, prefix, compact, placeholder }: { value: string; onChange: (text: string) => void; label: string; suffix?: string; prefix?: string; compact?: boolean; placeholder?: string }) {
  const size = compact ? 17 : 20;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", height: compact ? 44 : 48, borderRadius: 14, borderWidth: 2, borderColor: colors.line, paddingHorizontal: 14, backgroundColor: colors.surface }}>
      {prefix ? <T weight="bold" style={{ fontSize: 13, color: colors.inkSoft, marginRight: "auto", paddingRight: 6 }}>{prefix}</T> : null}
      <T style={{ fontFamily: fonts.display, fontSize: size, color: value ? colors.ink : colors.inkFaint }}>₦</T>
      <TextInput
        value={groupDigits(value)}
        onChangeText={(text) => onChange(text.replace(/[^\d.]/g, ""))}
        keyboardType="decimal-pad"
        accessibilityLabel={label}
        placeholder={placeholder ?? "0"}
        placeholderTextColor={colors.inkFaint}
        style={{ flex: prefix ? 0 : 1, minWidth: prefix ? 64 : 40, width: prefix ? 64 : undefined, textAlign: prefix ? "right" : "left", fontFamily: fonts.display, fontSize: size, color: colors.ink, paddingVertical: 0 }}
      />
      {suffix ? <T weight="bold" style={{ fontSize: 12, color: colors.inkSoft, paddingLeft: 6 }}>{suffix}</T> : null}
    </View>
  );
}

/** The progress bar (`.meter`): orange for suppliers, forest green on the delivery partner's screens. */
export function Meter({ share, label, color = colors.accent }: { share: number; label: string; color?: string }) {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.round(share * 100) }} style={{ height: 8, borderRadius: 999, backgroundColor: colors.line, overflow: "hidden" }}>
      <View style={{ width: `${Math.round(Math.max(0, Math.min(1, share)) * 100)}%`, height: "100%", borderRadius: 999, backgroundColor: color }} />
    </View>
  );
}

/** The goals left to the next level (`.goals`): a meter for counts ("62 / 100"), a tick and the value for checks. */
export function GoalList({ goals, action, color }: { goals: readonly LevelGoal[]; action?: (goal: LevelGoal) => { label: string; onPress: () => void } | null; color?: string }) {
  const words = useWords();
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 4 }}>
      {goals.map((goal, index) => {
        const extra = !goal.done && action ? action(goal) : null;
        const value = goalValue(goal);
        return (
          <View key={goal.key} style={{ gap: 6, paddingVertical: 11, borderTopWidth: index ? 1 : 0, borderTopColor: colors.grayTint }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <T weight="bold" style={{ flex: 1, fontSize: 14 }}>{words(`goal.${goal.key}`, goal.label)}</T>
              {extra ? (
                <T weight="extrabold" accessibilityRole="link" onPress={extra.onPress} style={{ fontSize: 14, color: color ?? colors.accentInk, textDecorationLine: "underline" }}>{extra.label}</T>
              ) : goal.kind === "count" ? (
                <T weight="extrabold" style={{ fontSize: 14 }}>{value}</T>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  {goal.done ? <AppIcon name="check" size={14} color={colors.success} strokeWidth={2.6} /> : null}
                  <T weight="extrabold" style={{ fontSize: 14, color: goal.done ? colors.success : colors.accentInk }}>{value || (goal.done ? words("goal.done", "Done") : words("goal.notYet", "Not yet"))}</T>
                </View>
              )}
            </View>
            {goal.kind === "count" ? <Meter share={goalShare(goal)} label={`${goal.label}: ${value}`} color={color} /> : null}
          </View>
        );
      })}
    </View>
  );
}

/** The level ladder on a dark card (`.ladder`): a bar per level, yellow when passed, white for the current one. */
export function Ladder({ levels, current }: { levels: { key: string; label: string }[]; current: string }) {
  const at = Math.max(0, levels.findIndex((level) => level.key === current));
  return (
    <View style={{ flexDirection: "row", gap: 6 }} accessibilityLabel={`${levels[at]?.label ?? ""}, ${at + 1} / ${levels.length}`}>
      {levels.map((level, index) => {
        const tone = index < at ? "#FFE27A" : index === at ? "#FFFFFF" : "#8A8697";
        return (
          <View key={level.key} style={{ flex: 1, gap: 6 }}>
            <View style={{ height: 6, borderRadius: 999, backgroundColor: index <= at ? tone : "#3A3646" }} />
            <T weight="extrabold" numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 11, letterSpacing: 0.5, color: tone }}>{level.label.toUpperCase()}</T>
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
      <ChannelCard title={words("prices.preorder", "Pre-order")} icon={<AppIcon name="lock" size={16} color={colors.ink} />} hint={words("prices.tier3", "Established")} locked>
        <T style={{ fontSize: 13, lineHeight: 18, color: colors.grayInk }}>{words("prices.preorderLocked", "Unlocks when you're Established: 100 delivered orders and 30 reviews.")}</T>
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
  const [editRanges, setEditRanges] = useState(false);
  const set = (patch: Partial<PricesForm>) => onChange({ ...value, ...patch });
  const perChannel = value.mode === "per_channel";
  const preorderOpen = level?.perks.preorders === true;
  const cost = formDropshipCost(value);
  const suggested = Number(value.suggested.replace(/[,\s]/g, "")) || 0;
  const setBreak = (index: number, patch: Partial<PricesForm["breaks"][number]>) => set({ breaks: value.breaks.map((row, at) => (at === index ? { ...row, ...patch } : row)) });
  const firstMin = Number(value.breaks[0]?.min) || 0;
  const baseRange = value.breaks.length && firstMin > 1 ? (firstMin > 2 ? `1–${firstMin - 1}` : "1") : undefined;

  return (
    <View style={{ gap: 10 }}>
      <SoftSegmented
        options={[
          { value: "same", label: words("prices.same", "Same price for all") },
          { value: "per_channel", label: words("prices.perChannel", "Different per channel") },
        ]}
        value={value.mode}
        onChange={(mode) => set({ mode })}
      />
      {perChannel ? (
        <>
          <ChannelCard title={words("prices.dropship", "Dropship")} dot="#5B3FD6" hint={words("prices.dropshipHint", "1 piece to a customer")} padding={12}>
            <PriceInput value={value.dropship} onChange={(dropship) => set({ dropship })} label={words("prices.dropshipLabel", "Dropship price per piece")} suffix={words("prices.perPiece", "per piece")} placeholder={value.base || "0"} />
          </ChannelCard>
          <ChannelCard title={words("prices.wholesale", "Wholesale")} dot={colors.forest} hint={words("prices.wholesaleHint", "Bulk to a shop")} padding={12}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <View style={{ flexBasis: "47%", flexGrow: 1 }}>
                <PriceInput compact prefix={baseRange} value={value.base} onChange={(base) => set({ base })} label={words("prices.wholesaleLabel", "Wholesale price per piece")} suffix={baseRange ? undefined : words("prices.perPiece", "per piece")} />
              </View>
              {value.breaks.map((row, index) => (
                <View key={index} style={{ flexBasis: "47%", flexGrow: 1 }}>
                  <PriceInput compact prefix={breakRange(row) || "?"} value={row.price} onChange={(price) => setBreak(index, { price })} label={words("prices.breakPrice", "Break {n}: price per piece", { n: index + 1 })} />
                </View>
              ))}
            </View>
            {editRanges
              ? value.breaks.map((row, index) => (
                  <View key={index} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <QtyInput value={row.min} onChange={(min) => setBreak(index, { min })} label={words("prices.breakFrom", "Break {n}: from how many pieces", { n: index + 1 })} placeholder="6" />
                    <T style={{ color: colors.inkSoft }}>–</T>
                    <QtyInput value={row.max} onChange={(max) => setBreak(index, { max })} label={words("prices.breakTo", "Break {n}: up to how many (empty: and up)", { n: index + 1 })} placeholder={words("prices.andUp", "and up")} />
                    <Pressable accessibilityRole="button" accessibilityLabel={words("prices.removeBreak", "Remove break {n}", { n: index + 1 })} hitSlop={6} onPress={() => set({ breaks: value.breaks.filter((_, at) => at !== index) })} style={{ width: 36, height: 44, alignItems: "center", justifyContent: "center" }}>
                      <AppIcon name="x" size={16} color={colors.inkSoft} />
                    </Pressable>
                  </View>
                ))
              : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
              {value.breaks.length < MAX_BREAKS ? (
                <T
                  weight="extrabold"
                  accessibilityRole="button"
                  onPress={() => {
                    set({ breaks: [...value.breaks, nextBreak(value.breaks)] });
                    setEditRanges(true);
                  }}
                  style={{ fontSize: 13, color: colors.accentInk, paddingVertical: 2 }}
                >
                  {words("prices.addBreak", "+ Add quantity break")}
                </T>
              ) : null}
              {value.breaks.length ? (
                <T weight="bold" accessibilityRole="button" onPress={() => setEditRanges((open) => !open)} style={{ marginLeft: "auto", fontSize: 13, color: colors.inkSoft, paddingVertical: 2 }}>
                  {editRanges ? words("prices.rangesDone", "Done") : words("prices.editRanges", "Change quantities")}
                </T>
              ) : null}
            </View>
          </ChannelCard>
          {showPreorder ? (
            preorderOpen ? (
              <ChannelCard title={words("prices.preorder", "Pre-order")} dot={colors.accent} hint={words("prices.preorderHint", "Before it's ready")} padding={12}>
                <PriceInput value={value.preorder} onChange={(preorder) => set({ preorder })} label={words("prices.preorderLabel", "Pre-order price per piece")} suffix={words("prices.perPiece", "per piece")} placeholder={value.base || "0"} />
              </ChannelCard>
            ) : (
              <LockedPreorderCard level={level} />
            )
          ) : null}
        </>
      ) : (
        <ChannelCard title={words("prices.oneTitle", "One price for dropship and wholesale")} padding={12}>
          <PriceInput value={value.base} onChange={(base) => set({ base })} label={words("prices.oneLabel", "Price per piece")} suffix={words("prices.perPiece", "per piece")} />
        </ChannelCard>
      )}
      <ChannelCard title={words("prices.sellersCharge", "What sellers charge")} padding={12}>
        <View style={{ flexDirection: "row", gap: 8, marginTop: -4 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <T weight="bold" style={{ fontSize: 12, color: colors.inkSoft }}>{words("prices.suggested", "Suggested")}</T>
            <PriceInput compact value={value.suggested} onChange={(suggested) => set({ suggested })} label={words("prices.suggestedLabel", "Suggested price for sellers")} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <T weight="bold" style={{ fontSize: 12, color: colors.inkSoft }}>{words("prices.lowest", "Lowest allowed")}</T>
            <PriceInput compact value={value.lowest} onChange={(lowest) => set({ lowest })} label={words("prices.lowestLabel", "Lowest price a seller may list it at (optional)")} placeholder={words("prices.optional", "Optional")} />
          </View>
        </View>
        {cost > 0 && suggested > 0 && suggested <= cost ? (
          <T weight="bold" style={{ fontSize: 13, lineHeight: 18, color: colors.danger }}>{words("prices.tooLow", "The suggested price should be above your dropship price, so sellers can earn.")}</T>
        ) : null}
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

/** A question on the Dropship settings card (`.q` in Bricolage, `.qs` grey under it). */
function Question({ text, sub }: { text: string; sub?: string }) {
  return (
    <View style={{ gap: 2 }}>
      <T style={{ fontFamily: fonts.display, fontSize: 17, lineHeight: 21 }}>{text}</T>
      {sub ? <T style={{ fontSize: 13, color: colors.inkSoft }}>{sub}</T> : null}
    </View>
  );
}

/** P-Dropship: what sellers see before they add the product. */
export function DropshipSettings({ value, onChange }: { value: DropshipForm; onChange: (next: DropshipForm) => void }) {
  const words = useWords();
  const set = (patch: Partial<DropshipForm>) => onChange({ ...value, ...patch });
  const size = SIZES.find((entry) => entry.band === value.sizeBand) ?? SIZES[0];
  return (
    <View style={{ gap: 10 }}>
      <ChannelCard>
        <Question text={words("ds.single", "Do you ship single pieces?")} />
        <BoardChips>
          <BoardChip label={words("ds.singleYes", "Yes, 1 piece is fine")} on={value.single} onPress={() => set({ single: true })} />
          <BoardChip label={words("ds.singleNo", "No, set a minimum")} on={!value.single} onPress={() => set({ single: false })} />
        </BoardChips>
        {!value.single ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <T weight="bold" style={{ flex: 1, fontSize: 14 }}>{words("ds.minPerOrder", "Minimum per order")}</T>
            <Stepper value={value.minQty} min={2} max={1000} onChange={(minQty) => set({ minQty })} label={words("ds.minPerOrder", "Minimum per order")} />
            <T style={{ fontSize: 14, color: colors.inkSoft }}>{words("ds.pieces", "pieces")}</T>
          </View>
        ) : null}
      </ChannelCard>
      <ChannelCard>
        <Question text={words("ds.packTime", "How fast do you pack an order?")} sub={words("ds.packTimeSub", "Customers see this in the delivery date.")} />
        <BoardChips>
          {HANDLING_DAYS.map((days) => (
            <BoardChip key={days} label={days === 1 ? words("ds.day1", "1 day") : words("ds.days", "{n} days", { n: days })} on={value.handlingDays === days} onPress={() => set({ handlingDays: days })} />
          ))}
        </BoardChips>
      </ChannelCard>
      <ChannelCard>
        <Question text={words("ds.size", "How big is the parcel?")} sub={`${words("ds.sizeSub", "Sets the delivery price.")} ${words(`ds.size.${size.key}`, size.english)}: ${words(`ds.sizeHint.${size.key}`, size.hint).toLowerCase()}.`} />
        <BoardChips>
          {SIZES.map((entry) => <BoardChip key={entry.band} label={words(`ds.size.${entry.key}`, entry.english)} on={value.sizeBand === entry.band} onPress={() => set({ sizeBand: entry.band })} />)}
        </BoardChips>
      </ChannelCard>
      <ChannelCard>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <T weight="extrabold" style={{ fontSize: 15 }}>{words("ds.sample", "Sellers can order 1 sample")}</T>
            <T style={{ fontSize: 13, color: colors.inkSoft }}>{words("ds.sampleSub", "At your dropship price, to check quality")}</T>
          </View>
          <Toggle tone="accent" on={value.sample} onChange={(sample) => set({ sample })} label={words("ds.sampleLabel", "Allow samples")} />
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
