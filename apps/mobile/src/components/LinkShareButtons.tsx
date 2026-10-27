import { useEffect, useRef, useState } from "react";
import { Linking, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { ButtonRow, PillButton, T } from "@/components/ui";
import { shareText } from "@/lib/share";
import { useT } from "@/lib/i18n";
import { whatsappShareUrl, type LinkStatus } from "@/lib/paylinks-pure";
import { colors, radii } from "@/theme";

// A link on screen with Copy, Share and (optionally) Send on WhatsApp: payment links and the link in bio page.

/** Badge colours for a payment link's status (list and detail). */
export const LINK_STATUS_COLORS: Record<LinkStatus, { bg: string; fg: string }> = {
  active: { bg: colors.mintTint, fg: colors.forest },
  paid: { bg: colors.successTint, fg: colors.success },
  expired: { bg: colors.canvas, fg: colors.inkSoft },
  cancelled: { bg: colors.canvas, fg: colors.inkSoft },
};

export function LinkShareButtons({ url, message, whatsappTo, showWhatsapp = true }: { url: string; message: string; whatsappTo?: string | null; showWhatsapp?: boolean }) {
  const t = useT("m_paylinks");
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    await Clipboard.setStringAsync(url).catch(() => undefined);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }

  return (
    <View style={{ gap: 10 }}>
      <View style={{ backgroundColor: colors.canvas, borderRadius: radii.field, paddingHorizontal: 14, paddingVertical: 12 }}>
        <T selectable style={{ fontSize: 14.5 }} numberOfLines={2}>{url.replace(/^https?:\/\//, "")}</T>
      </View>
      <ButtonRow labels={[copied ? t("copied") : t("copy"), t("share")]} icons gap={8}>
        <PillButton size="md" tone="white" style={{ flex: 1 }} onPress={() => void copy()} accessibilityLabel={copied ? t("copied") : t("copy")} icon={copied ? "check" : "doc"} title={copied ? t("copied") : t("copy")} />
        <PillButton size="md" tone="white" style={{ flex: 1 }} onPress={() => void shareText(message)} accessibilityLabel={t("share")} icon="share" title={t("share")} />
      </ButtonRow>
      {showWhatsapp ? (
        <PillButton size="md" tone="forest" onPress={() => void Linking.openURL(whatsappShareUrl(message, whatsappTo)).catch(() => undefined)} accessibilityLabel={t("whatsapp")} icon="chat" title={t("whatsapp")} />
      ) : null}
    </View>
  );
}
