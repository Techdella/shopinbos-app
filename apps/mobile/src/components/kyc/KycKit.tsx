import { useState, type ReactNode } from "react";
import { View } from "react-native";
import type { ItemState } from "@shared/partner-tiers";
import { TonePill } from "@/components/partner";
import { Card, Notice, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { ITEM_TONE } from "@/lib/kyc-pure";
import type { KycState } from "@/lib/kyc";
import { colors } from "@/theme";

// Small pieces the verification steps share: a titled card, an item's status pill with its reason, and the busy /
// error state of a step's calls (each call answers with the whole state, handed to onState).

export type StepProps = { state: KycState; onState: (next: KycState) => void };

export function StepCard({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ gap: 4 }}>
        <T weight="extrabold" style={{ fontSize: 16 }}>{title}</T>
        {sub ? <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{sub}</T> : null}
      </View>
      {children}
    </Card>
  );
}

/** "Approved" / "Being checked" / "Needed" / "Rejected" for one item, and the team's reason under it. */
export function ItemStatus({ label, state, reason }: { label: string; state: ItemState; reason?: string | null }) {
  const t = useT("m_kyc");
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <T weight="bold" style={{ flex: 1 }}>{label}</T>
        <TonePill tone={ITEM_TONE[state]} label={t(`item.${state}`)} />
      </View>
      {state === "rejected" && reason ? <T style={{ color: colors.danger, fontSize: 14 }}>{reason}</T> : null}
    </View>
  );
}

/** Runs one call at a time for a step: `busy` names the running one, `error` holds the server's words. */
export function useStepAction(onState: (next: KycState) => void) {
  const t = useT("m_kyc");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  async function run<R>(key: string, call: () => Promise<R>, after?: (result: R) => void) {
    setBusy(key);
    setError(null);
    setDone(null);
    try {
      const result = await call();
      if (result && typeof result === "object" && "tier1" in (result as object)) onState(result as unknown as KycState);
      after?.(result);
      return result;
    } catch (failure) {
      setError(failure instanceof Error && failure.message ? failure.message : t("error.retry"));
      return null;
    } finally {
      setBusy(null);
    }
  }
  const notes = (
    <>
      {error ? <Notice>{error}</Notice> : null}
      {done ? <Notice tone="success">{done}</Notice> : null}
    </>
  );
  return { busy, error, setError, setDone, run, notes };
}
