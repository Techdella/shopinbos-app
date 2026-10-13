import { useEffect, useState } from "react";
import { View } from "react-native";
import { AppIcon } from "@/components/icons";
import { Card, PillButton, T } from "@/components/ui";
import { dismissPushOffer, shouldOfferPush, turnOnPush } from "@/lib/push";
import { colors } from "@/theme";

// The friendly "Turn on notifications" card. Asking happens only when someone taps Turn on (never at launch);
// "Not now" hides it for two weeks. Shows nothing once they've decided, or where push can't work (web, Expo Go).

const WORDS: Record<"seller" | "supplier" | "logistics" | "rider", { title: string; body: string }> = {
  seller: { title: "Know the moment you get an order", body: "We'll tell you about new orders, payments and messages, even when the app is closed." },
  supplier: { title: "Don't miss an order to accept", body: "Shops wait for you to accept. We'll tell you straight away, even when the app is closed." },
  logistics: { title: "Get new jobs straight away", body: "We'll tell you about new jobs, cash to pay in and messages, even when the app is closed." },
  rider: { title: "Hear about new jobs", body: "We'll tell you when your dispatcher gives you a job or changes one." },
};

export function PushPromptCard({ who = "seller", when = true }: { who?: keyof typeof WORDS; when?: boolean }) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!when) return;
    let live = true;
    void shouldOfferPush().then((offer) => {
      if (live) setShow(offer);
    });
    return () => {
      live = false;
    };
  }, [when]);

  if (!show || !when) return null;
  const words = WORDS[who];
  return (
    <Card style={{ backgroundColor: colors.mintTint, gap: 10 }}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
          <AppIcon name="bell" size={20} color={colors.forest} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T weight="extrabold" style={{ fontSize: 16, color: colors.forest }}>{words.title}</T>
          <T style={{ fontSize: 15, lineHeight: 21, color: colors.forest }}>{blocked ? "Notifications are off for Shopinbos. Turn them on in your phone's Settings app." : words.body}</T>
        </View>
      </View>
      {!blocked ? (
        <View style={{ flexDirection: "row", gap: 10 }}>
          <PillButton
            title="Turn on"
            size="sm"
            busy={busy}
            style={{ flex: 1 }}
            onPress={async () => {
              setBusy(true);
              const result = await turnOnPush();
              setBusy(false);
              if (result === "granted" || result === "unsupported") setShow(false);
              else if (result === "denied") setBlocked(true);
            }}
          />
          <PillButton
            title="Not now"
            tone="white"
            size="sm"
            style={{ flex: 1 }}
            onPress={() => {
              dismissPushOffer();
              setShow(false);
            }}
          />
        </View>
      ) : null}
    </Card>
  );
}
