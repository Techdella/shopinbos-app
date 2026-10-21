import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Sheet } from "@/components/Sheet";
import { TILE, type TileTone } from "@/components/design";
import { AppIcon, type AppIconName } from "@/components/icons";
import { T } from "@/components/ui";
import { sharePost, SHARE_TARGETS, type ShareTarget } from "@/lib/familiar-share";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// "Share it" ("Familiar app" prototype sheet `stShare`): WhatsApp Status, WhatsApp chats, TikTok, Instagram, Facebook
// and Save to phone, as six big tiles. Each one opens the phone's share sheet (or WhatsApp) with the picture and the
// caption copied. Nothing is posted for the person.

const LOOK: Record<ShareTarget, { icon: AppIconName; tone: TileTone }> = {
  whatsapp_status: { icon: "phone", tone: "mint" },
  whatsapp_chat: { icon: "chat", tone: "mint" },
  tiktok: { icon: "play", tone: "ink" },
  instagram: { icon: "camera", tone: "lilac" },
  facebook: { icon: "users", tone: "sky" },
  save: { icon: "image", tone: "gray" },
};

const KEY = {
  whatsapp_status: "share.whatsappStatus",
  whatsapp_chat: "share.whatsappChat",
  tiktok: "share.tiktok",
  instagram: "share.instagram",
  facebook: "share.facebook",
  save: "share.save",
} as const;

export function ShareSheet({ visible, onClose, imageUrl, caption, onShared }: { visible: boolean; onClose: () => void; imageUrl: string | null; caption: string; onShared?: (target: ShareTarget) => void }) {
  const t = useT("m_familiar");
  const [busy, setBusy] = useState<ShareTarget | null>(null);
  const [done, setDone] = useState(false);

  const pick = async (target: ShareTarget) => {
    if (busy) return;
    setBusy(target);
    const shared = await sharePost({ imageUrl, caption, target, title: t("share.title") }).catch(() => false);
    setBusy(null);
    setDone(true);
    if (shared) onShared?.(target);
  };

  const close = () => {
    setDone(false);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={close} title={t("share.title")}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 14 }}>
        {SHARE_TARGETS.map((target) => (
          <Pressable
            key={target}
            accessibilityRole="button"
            accessibilityLabel={t(KEY[target])}
            accessibilityState={{ busy: busy === target }}
            onPress={() => void pick(target)}
            style={({ pressed }) => ({ width: "33.33%", alignItems: "center", gap: 8, paddingVertical: 4, opacity: pressed ? 0.75 : 1 })}
          >
            <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: TILE[LOOK[target].tone].bg, alignItems: "center", justifyContent: "center" }}>
              {busy === target ? <ActivityIndicator color={TILE[LOOK[target].tone].fg} /> : <AppIcon name={LOOK[target].icon} size={22} color={TILE[LOOK[target].tone].fg} />}
            </View>
            <T weight="semibold" numberOfLines={2} style={{ fontSize: 13, lineHeight: 17, textAlign: "center" }}>{t(KEY[target])}</T>
          </Pressable>
        ))}
      </View>
      <T accessibilityLiveRegion="polite" style={{ fontSize: 14, lineHeight: 20, color: colors.inkSoft }}>
        {done ? t("share.done") : t("share.hint")}
      </T>
    </Sheet>
  );
}
