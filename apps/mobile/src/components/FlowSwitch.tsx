import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { LinkButton, PillButton, T } from "@/components/ui";
import { updateAutomation } from "@/lib/marketing";
import type { FlowRow } from "@/lib/marketing-pure";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// The automation on/off switch the Automations list and one automation share (app/marketing).

/** On/off switch for one automation; switching on asks first because it will message customers by itself. */
export function useFlowSwitch(onDone: () => Promise<void>) {
  const t = useT("m_marketing", "automations");
  const [asking, setAsking] = useState<FlowRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function set(flow: FlowRow, active: boolean) {
    setBusy(flow.id);
    setNote(null);
    try {
      await updateAutomation(flow.id, { active });
      setAsking(null);
      setNote({ tone: "success", text: active ? t("auto.nowOn", { name: flow.name }) : t("auto.nowOff", { name: flow.name }) });
      await onDone();
    } catch (switchError) {
      setAsking(null);
      setNote({ tone: "error", text: switchError instanceof Error ? switchError.message : t("auto.notSaved") });
    } finally {
      setBusy(null);
    }
  }

  const toggle = (flow: FlowRow, next: boolean) => (next ? setAsking(flow) : void set(flow, false));
  const sheet = (
    <Sheet visible={asking !== null} onClose={() => setAsking(null)} title={t("auto.onTitle", { name: asking?.name ?? "" })}>
      <T style={{ fontSize: 15, lineHeight: 22, color: colors.inkSoft }}>
        {asking ? t("toggle.confirm", { name: asking.name, what: asking.messages ? t("toggle.upTo", { count: asking.messages }) : t("toggle.messages") }) : ""}
      </T>
      <PillButton title={t("auto.onYes")} busy={busy !== null} onPress={() => asking && void set(asking, true)} />
      <LinkButton title={t("auto.keepOff")} onPress={() => setAsking(null)} />
    </Sheet>
  );
  return { toggle, sheet, busy, note };
}
