import { useEffect } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { colors } from "@/theme";

// Landing route for shopinbos://connected?channel=…&status=…, where connecting WhatsApp, Facebook & Instagram or
// Google ends (the web's /api/mobile/connected page, shared/app-connect.ts). The screen that opened the sign-in reads
// the result itself (lib/channels.ts); on Android the link can also reach the router, so this steps back to that
// screen, or opens Connect accounts with how it went when the app was opened from the link.
export default function Connected() {
  const params = useLocalSearchParams<{ channel?: string; status?: string }>();
  useEffect(() => {
    if (router.canGoBack()) return router.back();
    const channel = typeof params.channel === "string" && /^[a-z_]{2,20}$/.test(params.channel) ? params.channel : null;
    const result = params.status === "connected" ? "connected" : params.status === "problem" ? "problem" : null;
    router.replace(channel && result ? { pathname: "/channels", params: { [result]: channel } } : "/channels");
  }, [params.channel, params.status]);
  return <View style={{ flex: 1, backgroundColor: colors.canvas }} />;
}
