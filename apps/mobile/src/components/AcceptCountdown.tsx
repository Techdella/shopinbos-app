import { useEffect, useState } from "react";
import { View } from "react-native";
import { acceptCountdown } from "@shared/supplier-pickup";
import { AppIcon } from "@/components/icons";
import { T } from "@/components/ui";
import { colors } from "@/theme";

// "Accept in 2h 14m", ticking (spec 8A: each new order shows a countdown). In the last 30 minutes it turns amber
// with "Accept soon or the shop will be told". The words come from shared/supplier-pickup.ts, like the web.

const AMBER = { background: "#FDF0D9", border: "#F2A93B", ink: "#7A4D06" };

export function AcceptCountdown({ acceptBy, big = false }: { acceptBy: string | null | undefined; big?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const countdown = acceptCountdown(acceptBy ?? null, now);
  if (!countdown) return null;
  const soon = countdown.soon;
  return (
    <View accessibilityRole="timer" accessibilityLiveRegion="polite" style={{ gap: 4 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          alignSelf: "flex-start",
          maxWidth: "100%",
          paddingHorizontal: 12,
          minHeight: big ? 40 : 32,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: soon ? AMBER.border : colors.line,
          backgroundColor: soon ? AMBER.background : colors.canvas,
        }}
      >
        <View style={{ flexShrink: 0 }}><AppIcon name="clock" size={big ? 18 : 15} color={soon ? AMBER.ink : colors.ink} /></View>
        {/* One line: "Accept in 4h 59m" never breaks in a narrow order row. */}
        <T weight="bold" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ flexShrink: 1, fontSize: big ? 16 : 14, color: soon ? AMBER.ink : colors.ink }}>{countdown.text}</T>
      </View>
      {countdown.warning ? <T weight="bold" style={{ fontSize: 14, lineHeight: 19, color: AMBER.ink }}>{countdown.warning}</T> : null}
    </View>
  );
}
