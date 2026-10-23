import { useState } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { api, ApiError } from "@/lib/api";
import { AppIcon } from "@/components/icons";
import { PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// "Call Peggy · free": a voice call with Peggy, Shopinbos's AI customer support, for help getting set up. The
// server gives a one-time link (GET /api/mobile/peggy-call, valid 15 minutes) and the call runs in the phone's
// browser (the same call as the web dashboards: src/components/peggy/PeggyCall.tsx). Free: no AI credits.

export function CallPeggyButton({ style, note = true }: { style?: StyleProp<ViewStyle>; note?: boolean }) {
  const t = useT("m_help");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = async () => {
    setBusy(true);
    setError(null);
    try {
      const link = await api<{ ready: boolean; url: string }>("/api/mobile/peggy-call");
      if (!link.ready) {
        setError(t("call.soon"));
        return;
      }
      await WebBrowser.openBrowserAsync(link.url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("call.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={style}>
      <PillButton tone="forest" busy={busy} disabled={busy} onPress={() => void call()} accessibilityLabel={t("call.label")}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <AppIcon name="phone" size={19} color="#FFFFFF" />
          <T weight="extrabold" style={{ color: "#FFFFFF", fontSize: 16 }}>{t("call.title")}</T>
        </View>
      </PillButton>
      {note ? <T style={{ marginTop: 8, textAlign: "center", fontSize: 13, color: colors.inkSoft }}>{t("call.note")}</T> : null}
      {error ? <T style={{ marginTop: 6, textAlign: "center", fontSize: 13, color: colors.danger }}>{error}</T> : null}
    </View>
  );
}
