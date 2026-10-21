import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Heading, Keypad, Sub } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { Screen } from "@/components/Screen";
import { PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { deliverWithCode } from "@/lib/supplier";
import { colors } from "@/theme";

// "Enter their code" ("Simple app, end to end" supplier prototype `dcode`): on an order the supplier delivers
// themselves, the customer's 4-digit code (sent by SMS and WhatsApp) confirms the handover. The server checks it
// (PATCH /api/mobile/supplier/orders/[id] { action: "delivered", code }); a wrong code says so and clears the boxes.

const LENGTH = 4;

export default function DeliveryCode() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT("m_supplier", "m_partner");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handOver() {
    setBusy(true);
    setError(null);
    try {
      await deliverWithCode(String(id), code);
      router.back();
    } catch (failure) {
      setError(failure instanceof Error && failure.message ? failure.message : t("code.wrong"));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title={t("code.title")}
      footer={
        code.length === LENGTH ? (
          <PillButton tone="accent" busy={busy} disabled={busy} onPress={() => void handOver()} accessibilityLabel={t("code.handedOver")}>
            <AppIcon name="check" size={20} color={colors.ink} strokeWidth={2.4} />
            <T weight="extrabold" style={{ fontSize: 17, color: colors.ink }}>{t("code.handedOver")}</T>
          </PillButton>
        ) : null
      }
    >
      <Heading style={{ textAlign: "center" }}>{t("code.heading")}</Heading>
      <Sub style={{ textAlign: "center", marginTop: -10 }}>{t("code.sub")}</Sub>
      {error ? <T weight="bold" style={{ fontSize: 13, textAlign: "center", color: colors.accentInk }} accessibilityRole="alert">{error}</T> : null}
      <Keypad value={code} length={LENGTH} onChange={(next) => { setError(null); setCode(next); }} />
    </Screen>
  );
}
