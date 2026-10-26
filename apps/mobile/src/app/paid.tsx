import { useEffect } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { colors } from "@/theme";

// Landing route for shopinbos://paid?ref=…&status=…, where Paystack's return page (web /api/mobile/paid) sends the
// in-app browser after a payment. The screen that opened Paystack reads the result itself (lib/pay.ts); on Android
// the link can also reach the router, so this only steps back to that screen instead of showing "page not found".
export default function Paid() {
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, []);
  return <View style={{ flex: 1, backgroundColor: colors.canvas }} />;
}
