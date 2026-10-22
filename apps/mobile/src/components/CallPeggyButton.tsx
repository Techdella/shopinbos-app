import { useState } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { api, ApiError } from "@/lib/api";
import { AppIcon } from "@/components/icons";
import { PillButton, T } from "@/components/ui";
import { colors } from "@/theme";

// "Call Peggy · free": a voice call with Peggy, Shopinbos's AI customer support, for help getting set up. The
// server gives a one-time link (GET /api/mobile/peggy-call, valid 15 minutes) and the call runs in the phone's
// browser (the same call as the web dashboards: src/components/peggy/PeggyCall.tsx). Free: no AI credits.

export function CallPeggyButton({ style, note = true }: { style?: StyleProp<ViewStyle>; note?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = async () => {
    setBusy(true);
    setError(null);
    try {
      const link = await api<{ ready: boolean; url: string }>("/api/mobile/peggy-call");
      if (!link.ready) {
        setError("Calls with Peggy are coming soon. Chat with her instead, or message us on WhatsApp.");
        return;
      }
      await WebBrowser.openBrowserAsync(link.url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach Peggy just now. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={style}>
      <PillButton tone="forest" busy={busy} disabled={busy} onPress={() => void call()} accessibilityLabel="Call Peggy, free">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <AppIcon name="phone" size={19} color="#FFFFFF" />
          <T weight="extrabold" style={{ color: "#FFFFFF", fontSize: 16 }}>Call Peggy · free</T>
        </View>
      </PillButton>
      {note ? <T style={{ marginTop: 8, textAlign: "center", fontSize: 13, color: colors.inkSoft }}>Peggy is Shopinbos&apos;s AI support. She&apos;ll talk you through each step.</T> : null}
      {error ? <T style={{ marginTop: 6, textAlign: "center", fontSize: 13, color: colors.danger }}>{error}</T> : null}
    </View>
  );
}
