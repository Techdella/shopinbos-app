import { useState } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { api } from "@/lib/api";
import { AppIcon } from "@/components/icons";
import { Card, Field, Label, Notice, PillButton, T } from "@/components/ui";
import { colors, radii } from "@/theme";

// Mobile twin of the web's src/components/support/SetupHelpRequest.tsx, with the same props.
// "We'll set it up for you": instead of showing API keys, DNS records or feed links, a technical job becomes a
// short request to the Shopinbos team. It opens a support ticket (topic "setup") that lands in the admin support
// desk, so a person can do the work and message the customer back on WhatsApp.

export interface SetupHelpRequestProps {
  /** What they want set up, in plain words: "Connect your delivery software". */
  title: string;
  /** One or two sentences: what we'll do for them. */
  description: string;
  /** Short key for the team, e.g. "logistics_api". Goes in the ticket subject. */
  feature: string;
  /** Label for the optional "which software" question; omit to hide it. */
  softwareQuestion?: string;
  softwarePlaceholder?: string;
  style?: StyleProp<ViewStyle>;
}

const PHONE = /^\+?[\d\s-]{7,20}$/;

function Optional({ children }: { children: string }) {
  return (
    <Label>
      {children} <T style={{ fontSize: 14, color: colors.inkSoft }}>(optional)</T>
    </Label>
  );
}

export function SetupHelpRequest({ title, description, feature, softwareQuestion, softwarePlaceholder, style }: SetupHelpRequestProps) {
  const [software, setSoftware] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    setError(null);
    if (whatsapp.trim() && !PHONE.test(whatsapp.trim())) {
      setError("That WhatsApp number doesn't look right. Check it, or leave it empty and we'll reply here.");
      return;
    }
    setBusy(true);
    try {
      const lines = [
        `Please help me: ${title}.`,
        softwareQuestion && software.trim() ? `${softwareQuestion} ${software.trim()}` : null,
        whatsapp.trim() ? `Reach me on WhatsApp: ${whatsapp.trim()}` : "Reply here in the app.",
        details.trim() ? `More details: ${details.trim()}` : null,
      ].filter(Boolean);
      await api("/api/support/tickets", {
        method: "POST",
        json: { topic: "setup", subject: `Set up: ${title} [${feature}]`.slice(0, 160), message: lines.join("\n"), path: "mobile app" },
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "We couldn't send that. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <View accessibilityRole="summary" style={[{ flexDirection: "row", gap: 12, backgroundColor: colors.successTint, borderRadius: radii.card, padding: 18 }, style]}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.success, alignItems: "center", justifyContent: "center" }}>
          <AppIcon name="check" size={20} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1 }}>
          <T weight="extrabold" style={{ fontSize: 17 }}>Thanks, we&apos;ve got it.</T>
          <T style={{ fontSize: 15, lineHeight: 22, marginTop: 4 }}>
            Someone from the Shopinbos team will {whatsapp.trim() ? "message you on WhatsApp" : "reply in Help"} within one working day and set it up with you. You don&apos;t need to do anything else.
          </T>
        </View>
      </View>
    );
  }

  return (
    <Card style={[{ gap: 16, padding: 18 }, style]}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.mintTint, alignItems: "center", justifyContent: "center" }}>
          <AppIcon name="chat" size={20} />
        </View>
        <View style={{ flex: 1 }}>
          <T weight="extrabold" accessibilityRole="header" style={{ fontSize: 18 }}>{title}</T>
          <T style={{ fontSize: 15, lineHeight: 22, color: colors.inkSoft, marginTop: 4 }}>{description}</T>
        </View>
      </View>

      {softwareQuestion ? (
        <View>
          <Optional>{softwareQuestion}</Optional>
          <Field value={software} onChangeText={setSoftware} placeholder={softwarePlaceholder} maxLength={120} accessibilityLabel={softwareQuestion} />
        </View>
      ) : null}
      <View>
        <Optional>Your WhatsApp number</Optional>
        <Field value={whatsapp} onChangeText={setWhatsapp} placeholder="0803 123 4567" keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" maxLength={20} accessibilityLabel="Your WhatsApp number" />
      </View>
      <View>
        <Optional>Anything we should know?</Optional>
        <Field value={details} onChangeText={setDetails} multiline maxLength={1500} accessibilityLabel="Anything we should know?" style={{ height: 96, paddingTop: 14, textAlignVertical: "top" }} />
      </View>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <PillButton title="Ask the team to set it up" busy={busy} onPress={() => void submit()} />
    </Card>
  );
}
