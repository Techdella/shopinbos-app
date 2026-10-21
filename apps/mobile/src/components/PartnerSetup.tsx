import { useState } from "react";
import { ScrollView, View } from "react-native";
import { parseArea, formatArea } from "@shared/delivery-market";
import { Choice, List, Row, Seg, Small, Stepper } from "@/components/design";
import { ChipWrap, LabeledInput, PriceBox } from "@/components/PartnerKit";
import { Sheet } from "@/components/Sheet";
import { LinkButton, Notice, PillButton } from "@/components/ui";
import { useT } from "@/lib/i18n";
import type { RateService, SizeBand } from "@/lib/logistics";
import { SERVICE_KEYS, SIZE_KEYS, STATE_CHIPS, newDraftRate, stateLabel, type DeliverMode, type DraftRate } from "@/lib/logistics-pure";

// The editors the set-up steps and the Business screens share ("Delivery partner app" prototype pCover, pServices,
// pRates, cover, services): states to pick up from, where you deliver (same states / all of Nigeria / selected
// states), the services you offer, and the rate card with a price box per row, "+ Add a price", the re-attempt and
// return fees and notes for sellers.

const toggle = (list: string[], item: string) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

export function CoverageEditor({
  pickup,
  onPickup,
  mode,
  onMode,
  deliver,
  onDeliver,
  wizard,
}: {
  pickup: string[];
  onPickup: (next: string[]) => void;
  mode: DeliverMode;
  onMode: (next: DeliverMode) => void;
  deliver: string[];
  onDeliver: (next: string[]) => void;
  /** Set-up words ("Where can you pick up from?") instead of the Coverage screen's ("Pick up from"). */
  wizard?: boolean;
}) {
  const t = useT("m_partner");
  const modes: { value: DeliverMode; title: string; sub: string }[] = [
    { value: "same", title: t("cover.same"), sub: t("cover.sameSub") },
    { value: "all", title: t("cover.all"), sub: t("cover.allSub") },
    { value: "some", title: t("cover.some"), sub: t("cover.someSub") },
  ];
  return (
    <>
      <ChipWrap label={wizard ? t("cover.pickQ") : t("cover.pick")}>
        {STATE_CHIPS.map((state) => (
          <Seg key={state} label={stateLabel(state)} on={pickup.includes(state)} onPress={() => onPickup(toggle(pickup, state))} />
        ))}
      </ChipWrap>
      <View style={{ gap: 10 }}>
        <Small style={{ fontSize: 14 }}>{wizard ? t("cover.deliverQ") : t("cover.deliver")}</Small>
        {modes.map((option) => (
          <Choice key={option.value} title={option.title} sub={option.sub} on={mode === option.value} onPress={() => onMode(option.value)} />
        ))}
      </View>
      {mode === "some" ? (
        <ChipWrap>
          {STATE_CHIPS.map((state) => (
            <Seg key={state} label={stateLabel(state)} on={deliver.includes(state)} onPress={() => onDeliver(toggle(deliver, state))} />
          ))}
        </ChipWrap>
      ) : null}
    </>
  );
}

const SERVICE_SUBS: Record<string, string> = { doorstep: "svcSub.doorstep", pickup_point: "svcSub.pickup_point", same_day: "svcSub.same_day", interstate: "svcSub.interstate" };
const SERVICE_TITLES: Record<string, string> = { doorstep: "svcLong.doorstep", pickup_point: "svcLong.pickup_point", same_day: "svcLong.same_day", interstate: "svcLong.interstate" };

export function ServicesEditor({ services, onServices }: { services: string[]; onServices: (next: string[]) => void }) {
  const t = useT("m_partner");
  return (
    <View style={{ gap: 10 }}>
      {["doorstep", "pickup_point", "same_day", "interstate"].map((service) => (
        <Choice key={service} multi title={t.dynamic(SERVICE_TITLES[service])} sub={t.dynamic(SERVICE_SUBS[service])} on={services.includes(service)} onPress={() => onServices(toggle(services, service))} />
      ))}
    </View>
  );
}

/** "Lagos → South-West" and "Doorstep · Small (up to 2 kg) · 1–2 days" for a rate row. */
export function useRateWords() {
  const t = useT("m_partner");
  const days = (row: { minDays: number; maxDays: number }) =>
    row.maxDays <= 0 ? t("days.same") : row.minDays === row.maxDays ? t("days.n", { count: row.maxDays }) : t("days.range", { min: row.minDays, max: row.maxDays });
  return {
    route: (row: { from: string; to: string }) => `${stateLabel(row.from)} → ${stateLabel(row.to)}`,
    line: (row: { service: string; sizeBand: string; minDays: number; maxDays: number }) =>
      `${t.dynamic(SERVICE_KEYS[row.service] ?? row.service)} · ${t.dynamic(SIZE_KEYS[row.sizeBand as SizeBand] ?? row.sizeBand)} · ${days(row)}`,
  };
}

export function RateCardEditor({
  rows,
  onRows,
  fail,
  onFail,
  ret,
  onRet,
  notes,
  onNotes,
}: {
  rows: DraftRate[];
  onRows: (next: DraftRate[]) => void;
  fail: string;
  onFail: (text: string) => void;
  ret: string;
  onRet: (text: string) => void;
  notes: string;
  onNotes: (text: string) => void;
}) {
  const t = useT("m_partner");
  const words = useRateWords();
  const [editing, setEditing] = useState<DraftRate | null>(null);
  const setPrice = (id: string, price: string) => onRows(rows.map((row) => (row.id === id ? { ...row, price } : row)));

  return (
    <>
      {rows.length ? (
        <List>
          {rows.map((row) => (
            <Row
              key={row.id}
              title={words.route(row)}
              sub={words.line(row)}
              accessibilityLabel={t("rates.editRow", { route: words.route(row) })}
              onPress={() => setEditing(row)}
              right={<PriceBox value={row.price} onChangeText={(text) => setPrice(row.id, text)} label={t("rates.priceFor", { route: words.route(row) })} />}
            />
          ))}
        </List>
      ) : null}
      <LinkButton title={t("rates.add")} style={{ alignSelf: "flex-start" }} onPress={() => setEditing(newDraftRate(rows[0]?.from ?? "Lagos", rows[0]?.to ?? "Lagos"))} />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <LabeledInput label={t("rates.reattempt")} value={fail} onChangeText={onFail} keyboardType="number-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <LabeledInput label={t("rates.return")} value={ret} onChangeText={onRet} keyboardType="number-pad" />
        </View>
      </View>
      <LabeledInput label={t("rates.notes")} value={notes} onChangeText={onNotes} />
      <RateRowSheet
        row={editing}
        onClose={() => setEditing(null)}
        onSave={(next) => {
          onRows(rows.some((row) => row.id === next.id) ? rows.map((row) => (row.id === next.id ? next : row)) : [...rows, next]);
          setEditing(null);
        }}
        onRemove={(id) => {
          onRows(rows.filter((row) => row.id !== id));
          setEditing(null);
        }}
      />
    </>
  );
}

/** Add or change one price: from, to, service, size, days and the price. */
function RateRowSheet({ row, onClose, onSave, onRemove }: { row: DraftRate | null; onClose: () => void; onSave: (row: DraftRate) => void; onRemove: (id: string) => void }) {
  const t = useT("m_partner", "common");
  const [draft, setDraft] = useState<DraftRate | null>(row);
  const [from, setFrom] = useState(row?.from ?? "");
  const [to, setTo] = useState(row?.to ?? "");
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState<string | null>(null);
  // A new row opened: start from it (state set during render, React's "adjust state when a prop changes").
  if ((row?.id ?? null) !== seen) {
    setSeen(row?.id ?? null);
    setDraft(row);
    setFrom(row?.from ?? "");
    setTo(row?.to ?? "");
    setError(null);
  }
  if (!draft) return null;
  const set = (patch: Partial<DraftRate>) => setDraft({ ...draft, ...patch });

  function save() {
    if (!draft) return;
    const a = parseArea(from);
    const b = parseArea(to);
    if (!a || !b) return setError(t("rates.unknownPlace"));
    if (!Number(draft.price.replace(/\D/g, ""))) return setError(t("rates.needPrice"));
    onSave({ ...draft, from: formatArea(a), to: formatArea(b), minDays: draft.service === "same_day" ? 0 : draft.minDays, maxDays: draft.service === "same_day" ? 0 : Math.max(draft.minDays, draft.maxDays) });
  }

  return (
    <Sheet visible={Boolean(row)} onClose={onClose} title={t("rates.rowTitle")}>
      <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 14 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <LabeledInput label={t("rates.from")} value={from} onChangeText={setFrom} autoCapitalize="words" placeholder="Lagos" />
          </View>
          <View style={{ flex: 1 }}>
            <LabeledInput label={t("rates.to")} value={to} onChangeText={setTo} autoCapitalize="words" placeholder="South-West" />
          </View>
        </View>
        <Small>{t("rates.placeHint")}</Small>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(["doorstep", "pickup_point", "same_day"] as RateService[]).map((service) => (
            <Seg key={service} label={t.dynamic(SERVICE_KEYS[service])} on={draft.service === service} onPress={() => set({ service })} />
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(["small", "medium", "bulky"] as SizeBand[]).map((size) => (
            <Seg key={size} label={t.dynamic(SIZE_KEYS[size])} on={draft.sizeBand === size} onPress={() => set({ sizeBand: size })} />
          ))}
        </View>
        {draft.service === "same_day" ? null : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Small style={{ fontSize: 14 }}>{t("rates.days")}</Small>
            <Stepper value={draft.minDays} min={0} max={60} label={t("rates.minDays")} onChange={(minDays) => set({ minDays, maxDays: Math.max(minDays, draft.maxDays) })} />
            <Small>–</Small>
            <Stepper value={draft.maxDays} min={draft.minDays} max={60} label={t("rates.maxDays")} onChange={(maxDays) => set({ maxDays })} />
          </View>
        )}
        <LabeledInput label={t("rates.price")} value={draft.price} onChangeText={(price) => set({ price: price.replace(/[^\d,]/g, "") })} keyboardType="number-pad" />
        {error ? <Notice>{error}</Notice> : null}
        <PillButton tone="forest" title={t("save")} onPress={save} />
        <LinkButton title={t("rates.remove")} onPress={() => onRemove(draft.id)} />
      </ScrollView>
    </Sheet>
  );
}
