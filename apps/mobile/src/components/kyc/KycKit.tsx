import { useState, type ReactNode } from "react";
import { View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import type { ItemState } from "@shared/partner-tiers";
import { Sub, Title } from "@/components/design";
import { TonePill } from "@/components/partner";
import { Notice, PillButton, T } from "@/components/ui";
import { API_URL } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { ITEM_TONE } from "@/lib/kyc-pure";
import type { KycState } from "@/lib/kyc";
import { colors } from "@/theme";

// Small pieces the sign-up screens share: the one-question frame (big question, its input, Continue at the bottom),
// an item's status pill with its reason, and the busy / error state of a screen's calls (each call answers with the
// whole state, handed to onState).

export type StepProps = { state: KycState; onState: (next: KycState) => void };
export type ScreenProps = StepProps & { onDone: () => void };

export const openOnWeb = (path: string) => void WebBrowser.openBrowserAsync(`${API_URL}${path}`);

/** One question per screen: the question in large type, its answer, and Continue. */
export function Question({ title, sub, error, children, onContinue, continueLabel, busy = false, canContinue = true }: {
  title: string;
  sub?: string;
  error?: string | null;
  children?: ReactNode;
  onContinue?: () => void;
  continueLabel?: string;
  busy?: boolean;
  canContinue?: boolean;
}) {
  const t = useT("m_kyc");
  return (
    <View style={{ gap: 18 }}>
      <View style={{ gap: 8 }}>
        <Title size={28}>{title}</Title>
        {sub ? <Sub>{sub}</Sub> : null}
      </View>
      {children}
      {error ? <Notice>{error}</Notice> : null}
      {onContinue ? <PillButton title={continueLabel ?? t("flow.continue")} busy={busy} disabled={!canContinue} onPress={onContinue} /> : null}
    </View>
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

/** Runs one call at a time for a screen: `busy` names the running one, `error` holds the server's words. */
export function useStepAction(onState: (next: KycState) => void) {
  const t = useT("m_kyc");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run<R>(key: string, call: () => Promise<R>, after?: (result: R) => void) {
    setBusy(key);
    setError(null);
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
  return { busy, error, setError, run };
}
