import { useState } from "react";
import { View } from "react-native";
import { Card, Field, Label, Notice, PillButton, T } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { redeemFeatureInvite } from "@/lib/features";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// "Have a pilot invite code?" (Settings): the code from the Shopinbos team turns on the pilot features it gives
// (Admin › Pilot features › Invite codes; POST /api/app/features/invite). The features show once their switches allow.

const CODE_KEYS: Record<string, "pilot.notFound" | "pilot.expired" | "pilot.usedUp" | "pilot.tooMany"> = {
  INVITE_NOT_FOUND: "pilot.notFound",
  INVITE_EXPIRED: "pilot.expired",
  INVITE_USED_UP: "pilot.usedUp",
  RATE_LIMITED: "pilot.tooMany",
};

export function PilotInviteCard() {
  const t = useT("m_settings");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function redeem() {
    const clean = code.trim();
    if (!clean) return setNote({ tone: "error", text: t("pilot.empty") });
    setBusy(true);
    setNote(null);
    try {
      await redeemFeatureInvite(clean);
      setCode("");
      setNote({ tone: "success", text: t("pilot.done") });
    } catch (error) {
      const key = error instanceof ApiError && error.code ? CODE_KEYS[error.code] : undefined;
      setNote({ tone: "error", text: key ? t(key) : error instanceof Error ? error.message : t("pilot.notFound") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 10 }}>
      <View>
        <Label>{t("pilot.title")}</Label>
        <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 19, marginBottom: 8 }}>{t("pilot.hint")}</T>
        <Field
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={40}
          placeholder="PILOTAB12CD3"
          accessibilityLabel={t("pilot.title")}
          onSubmitEditing={() => void redeem()}
          testID="pilot-invite-code"
        />
      </View>
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      <PillButton title={t("pilot.redeem")} tone="white" size="sm" busy={busy} disabled={busy} onPress={() => void redeem()} testID="pilot-invite-redeem" />
    </Card>
  );
}
