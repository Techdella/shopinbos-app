import { useState } from "react";
import { Pressable, View } from "react-native";
import { Pill } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { Card, Chip, Field, Label, PillButton, T, Toggle } from "@/components/ui";
import { monthGrid, shiftMonth } from "@/lib/campaigns-pure";
import { useT } from "@/lib/i18n";
import { PREORDER_DEPOSIT_CHOICES, PREORDER_NOTE_MAX, SHIP_CHOICES, dayFromNow, preorderLineText, preorderPillText, shipDayText, today, type PreorderForm, type PreorderState } from "@/lib/preorder-pure";
import { colors, radii } from "@/theme";

// Preorders on the phone (rules in shared/preorder.ts, shaped by lib/preorder-pure.ts; words in m_ui "preorder.*"):
//   <PreorderEditor>  the Preorders section of the seller's and the supplier's product forms (like the web's)
//   <PreorderBox>     a supplier listing that takes preorders, on Find (ship date, places left, promise, no escrow)
//   <PreorderPill>    "Preorder · 12 Dec" on orders
// Shopinbos never holds preorder money: buyers pay as for any order, and the promise is the seller's own words.

const PREORDER_BG = colors.warnTint;
const PREORDER_INK = "#5C3D00";

// Monday first, as m_ui day.short.<0-6> (0 = Sunday).
const WEEK = [1, 2, 3, 4, 5, 6, 0];

/** A little calendar to pick the ship date (today or later). Give it a new `key` each time it opens. */
function ShipDateSheet({ visible, value, onClose, onPick }: { visible: boolean; value: string | null; onClose: () => void; onPick: (day: string) => void }) {
  const t = useT("m_ui");
  const now = new Date();
  const start = value ?? dayFromNow(7, now);
  const [month, setMonth] = useState({ year: Number(start.slice(0, 4)), month: Number(start.slice(5, 7)) });
  const [day, setDay] = useState<string | null>(value);
  const first = today(now);
  const cells = monthGrid(month.year, month.month);
  const arrow = (by: number, label: string) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={6} onPress={() => setMonth(shiftMonth(month.year, month.month, by))} style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" }}>
      <View style={{ transform: [{ rotate: by < 0 ? "180deg" : "0deg" }] }}>
        <AppIcon name="chevron" size={18} />
      </View>
    </Pressable>
  );
  return (
    <Sheet visible={visible} onClose={onClose} title={t("preorder.shipsFrom")}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        {arrow(-1, t("preorder.prevMonth"))}
        <T weight="extrabold" style={{ fontSize: 17 }}>{`${t.dynamic(`day.month.${month.month - 1}`)} ${month.year}`}</T>
        {arrow(1, t("preorder.nextMonth"))}
      </View>
      <View style={{ flexDirection: "row" }}>
        {WEEK.map((weekday) => (
          <T key={weekday} style={{ flex: 1, textAlign: "center", color: colors.inkSoft, fontSize: 12.5 }}>{t.dynamic(`day.short.${weekday}`)}</T>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {cells.map((cell, index) => {
          const iso = cell === null ? null : `${month.year}-${String(month.month).padStart(2, "0")}-${String(cell).padStart(2, "0")}`;
          const on = iso !== null && iso === day;
          const past = iso !== null && iso < first;
          return (
            <View key={index} style={{ width: `${100 / 7}%`, alignItems: "center", paddingVertical: 2 }}>
              {iso !== null ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: on, disabled: past }}
                  accessibilityLabel={shipDayText(iso, now, t)}
                  disabled={past}
                  onPress={() => setDay(iso)}
                  style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: on ? colors.ink : "transparent", opacity: past ? 0.35 : 1 }}
                >
                  <T weight={on ? "extrabold" : "regular"} style={{ fontSize: 15, color: on ? "#FFFFFF" : colors.ink }}>{String(cell)}</T>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>
      <PillButton title={t("preorder.done")} disabled={!day} style={{ marginTop: 6 }} onPress={() => day && onPick(day)} />
    </Sheet>
  );
}

/**
 * The Preorders section of a product form: Take preorders (switch), Ships from (quick chips or a calendar), Most
 * preorders (empty: no limit), the promise, and the no-escrow line. `audience`: who orders (customers or shops).
 */
export function PreorderEditor({ value, onChange, audience, taken }: { value: PreorderForm; onChange: (next: PreorderForm) => void; audience: "customers" | "shops"; taken?: number | null }) {
  const t = useT("m_ui");
  const [picking, setPicking] = useState(0);
  const now = new Date();
  const edit = (patch: Partial<PreorderForm>) => onChange({ ...value, ...patch });
  const quick = SHIP_CHOICES.map((choice) => ({ ...choice, day: dayFromNow(choice.days, now) }));
  const custom = value.shipsOn !== null && !quick.some((choice) => choice.day === value.shipsOn);
  return (
    <Card style={{ gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T weight="extrabold" style={{ fontSize: 18 }}>{t("preorder.take")}</T>
          <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{audience === "shops" ? t("preorder.takeShops") : t("preorder.takeCustomers")}</T>
        </View>
        <Toggle on={value.enabled} onChange={(enabled) => edit({ enabled })} label={t("preorder.take")} />
      </View>
      {value.enabled ? (
        <>
          <View>
            <Label>{t("preorder.shipsFrom")}</Label>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {quick.map((choice) => (
                <Chip key={choice.key} label={t.dynamic(choice.key, choice.english)} on={value.shipsOn === choice.day} onPress={() => edit({ shipsOn: choice.day })} />
              ))}
              <Chip label={custom ? shipDayText(value.shipsOn!, now, t) : t("preorder.pickDate")} on={custom} onPress={() => setPicking((count) => count + 1)} />
              <Chip label={t("preorder.noDate")} on={value.shipsOn === null} onPress={() => edit({ shipsOn: null })} />
            </View>
            {value.shipsOn ? <T style={{ color: colors.inkSoft, fontSize: 14, marginTop: 6 }}>{t("preorder.shipsOn", { date: shipDayText(value.shipsOn, now, t) })}</T> : null}
          </View>
          <View>
            <Label>{t("preorder.limit")}</Label>
            <Field value={value.limit} onChangeText={(limit) => edit({ limit: limit.replace(/[^\d]/g, "").slice(0, 6) })} keyboardType="number-pad" placeholder="50" accessibilityLabel={t("preorder.limit")} />
            <T style={{ color: colors.inkSoft, fontSize: 14, marginTop: 6 }}>
              {[t("preorder.limitHint"), taken ? t("preorder.taken", { count: taken }) : null].filter(Boolean).join(" ")}
            </T>
          </View>
          {value.depositPct !== undefined ? (
            // A deposit the shop (or the customer, paying by card at checkout) pays when it places the preorder; the
            // rest once the stock is ready (shared/preorder.ts).
            <View>
              <Label>{audience === "shops" ? t("preorders.deposit") : t("preorders.depositCustomers")}</Label>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {[...PREORDER_DEPOSIT_CHOICES, ...(PREORDER_DEPOSIT_CHOICES.includes(value.depositPct as (typeof PREORDER_DEPOSIT_CHOICES)[number]) ? [] : [value.depositPct])].map((pct) => (
                  <Chip key={pct} label={pct === 0 ? t("preorders.noDeposit") : `${pct}%`} on={value.depositPct === pct} onPress={() => edit({ depositPct: pct })} />
                ))}
              </View>
              <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20, marginTop: 6 }}>
                {audience === "shops"
                  ? value.depositPct ? t("preorders.depositHint", { pct: value.depositPct }) : t("preorders.noDepositHint")
                  : value.depositPct && value.depositPct < 100 ? t("preorders.depositHintCustomers", { pct: value.depositPct }) : t("preorders.noDepositHintCustomers")}
              </T>
            </View>
          ) : null}
          <View>
            <Label>{audience === "shops" ? t("preorder.promiseShops") : t("preorder.promiseCustomers")}</Label>
            <Field
              value={value.note}
              onChangeText={(note) => edit({ note })}
              multiline
              maxLength={PREORDER_NOTE_MAX}
              placeholder={t("preorder.promisePlaceholder")}
              accessibilityLabel={audience === "shops" ? t("preorder.promiseShops") : t("preorder.promiseCustomers")}
              style={{ height: 96, paddingTop: 14, textAlignVertical: "top" }}
            />
          </View>
          <View style={{ backgroundColor: colors.mintTint, borderRadius: radii.field, paddingHorizontal: 14, paddingVertical: 10 }}>
            <T style={{ color: colors.forest, fontSize: 14, lineHeight: 20 }}>{t("preorder.noEscrow")}</T>
          </View>
        </>
      ) : null}
      {picking ? <ShipDateSheet key={picking} visible value={value.shipsOn} onClose={() => setPicking(0)} onPick={(shipsOn) => { edit({ shipsOn }); setPicking(0); }} /> : null}
    </Card>
  );
}

/** A supplier listing that takes preorders (Find): the ship date and places left, the promise, and the no-escrow line. */
export function PreorderBox({ state, deposit }: { state: PreorderState; /** "Pay 30% now (₦…). The rest when the stock is ready." */ deposit?: string | null }) {
  const t = useT("m_ui");
  const line = preorderLineText(state, new Date(), t);
  return (
    <View style={{ backgroundColor: PREORDER_BG, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, gap: 6 }} accessibilityLabel={[t("preorder.pill"), line, state.note, deposit].filter(Boolean).join(". ")}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <View style={{ backgroundColor: "rgba(255,255,255,0.7)", borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 2 }}>
          <T weight="bold" style={{ fontSize: 12.5, color: PREORDER_INK }}>{t("preorder.pill")}</T>
        </View>
        {line ? <T weight="bold" style={{ fontSize: 14, color: PREORDER_INK, flexShrink: 1 }}>{line}</T> : null}
      </View>
      {state.note ? <T style={{ fontSize: 14, lineHeight: 20, color: PREORDER_INK }}>{state.note}</T> : null}
      {deposit ? <T weight="bold" style={{ fontSize: 14, lineHeight: 20, color: PREORDER_INK }}>{deposit}</T> : null}
      <T style={{ fontSize: 13.5, lineHeight: 19, color: PREORDER_INK }}>{t("preorder.noEscrowBuyer")}</T>
    </View>
  );
}

/** "Preorder · 12 Dec" on an order (nothing for an ordinary order). */
export function PreorderPill({ preorder }: { preorder: { shipsOn?: string | null } | null | undefined }) {
  const t = useT("m_ui");
  const label = preorderPillText(preorder, new Date(), t);
  return label ? <Pill label={label} tone="warn" icon="clock" /> : null;
}

/** The one-line button label lives in components/ui.tsx with the other button parts; kept here for older imports. */
export { OneLine } from "@/components/ui";
