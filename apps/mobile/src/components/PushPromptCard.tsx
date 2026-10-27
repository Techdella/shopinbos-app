import { useEffect, useState } from "react";
import { View } from "react-native";
import { AppIcon } from "@/components/icons";
import { ButtonRow, Card, PillButton, T } from "@/components/ui";
import { dismissPushOffer, shouldOfferPush, turnOnPush } from "@/lib/push";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// The friendly "Turn on notifications" card. Asking happens only when someone taps Turn on (never at launch);
// "Not now" hides it for two weeks. Shows nothing once they've decided, or where push can't work (web, Expo Go).

// Words per side of the app: m_notifications "push.<who>.title" / "push.<who>.body".
const WORDS = {
  seller: { title: "push.seller.title", body: "push.seller.body" },
  supplier: { title: "push.supplier.title", body: "push.supplier.body" },
  logistics: { title: "push.logistics.title", body: "push.logistics.body" },
  rider: { title: "push.rider.title", body: "push.rider.body" },
} as const;

export function PushPromptCard({ who = "seller", when = true }: { who?: keyof typeof WORDS; when?: boolean }) {
  const t = useT("m_notifications");
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
          <T weight="extrabold" style={{ fontSize: 16, color: colors.forest }}>{t(words.title)}</T>
          <T style={{ fontSize: 15, lineHeight: 21, color: colors.forest }}>{blocked ? t("push.blocked") : t(words.body)}</T>
        </View>
      </View>
      {!blocked ? (
        <ButtonRow labels={[t("push.turnOn"), t("push.notNow")]} size="sm">
          <PillButton
            title={t("push.turnOn")}
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
            title={t("push.notNow")}
            tone="white"
            size="sm"
            style={{ flex: 1 }}
            onPress={() => {
              dismissPushOffer();
              setShow(false);
            }}
          />
        </ButtonRow>
      ) : null}
    </Card>
  );
}
