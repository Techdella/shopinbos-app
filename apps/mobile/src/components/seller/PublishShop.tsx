import { useState } from "react";
import { View } from "react-native";
import { Sheet } from "@/components/Sheet";
import { AppIcon } from "@/components/icons";
import { Notice, PillButton, T } from "@/components/ui";
import { publishShop, type PublishedShop } from "@/lib/publish";
import { openShop, shareShop } from "@/lib/share";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// One way to put the shop live everywhere in the app: the button, then "Your shop is live" with View shop and Share,
// or the server's own reason in a notice right under the button (where the seller is looking) when it can't.

/** Publishes and keeps what happened: `live` (name and link) on success, `error` (the real reason) otherwise. */
export function usePublishShop(onPublished?: (shop: PublishedShop) => void) {
  const t = useT("m_shop");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<PublishedShop | null>(null);
  async function publish() {
    setBusy(true);
    setError(null);
    try {
      const shop = await publishShop();
      setLive(shop);
      onPublished?.(shop);
      return true;
    } catch (publishError) {
      setError(publishError instanceof Error && publishError.message ? publishError.message : t("publish.failed"));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, live, publish, closeLive: () => setLive(null) };
}

/** "Your shop is live": View shop (the shop itself in the phone's browser) and Share (the phone's share sheet). */
export function ShopLiveSheet({ shop, onClose }: { shop: PublishedShop | null; onClose: () => void }) {
  const t = useT("m_shop");
  return (
    <Sheet visible={Boolean(shop)} onClose={onClose} title={t("publish.liveTitle")} testID="shop-live-sheet">
      {shop?.url ? <T style={{ color: colors.inkSoft, fontSize: 15 }} numberOfLines={1}>{shop.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</T> : null}
      {/* Stacked: two buttons side by side don't fit their words on a 360px phone. */}
      <View style={{ gap: 10, marginTop: 6 }}>
        {shop?.url ? (
          <PillButton testID="shop-live-view" tone="white" size="md" accessibilityLabel={t("publish.view")} onPress={() => void openShop(shop.url!)}>
            <AppIcon name="globe" size={18} />
            <T weight="bold" style={{ fontSize: 16 }}>{t("publish.view")}</T>
          </PillButton>
        ) : null}
        <PillButton testID="shop-live-share" size="md" accessibilityLabel={t("share")} onPress={() => void shareShop()}>
          <AppIcon name="share" size={18} color="#FFFFFF" />
          <T weight="bold" style={{ fontSize: 16, color: "#FFFFFF" }}>{t("share")}</T>
        </PillButton>
      </View>
    </Sheet>
  );
}

/** The publish button with its result: the live sheet, or the reason it didn't go live right under it. */
export function PublishButton({
  title,
  tone = "accent",
  size = "lg",
  onPublished,
  testID = "publish-shop",
  sheet = true,
}: {
  title?: string;
  tone?: "ink" | "accent" | "white";
  size?: "lg" | "md" | "sm";
  onPublished?: (shop: PublishedShop) => void;
  testID?: string;
  /** False when the screen shows "Your shop is live" itself (the button goes away once the shop is live). */
  sheet?: boolean;
}) {
  const t = useT("m_shop");
  const { busy, error, live, publish, closeLive } = usePublishShop(onPublished);
  return (
    <View style={{ gap: 8 }}>
      <PillButton testID={testID} tone={tone} size={size} title={title ?? t("publish.button")} busy={busy} onPress={() => void publish()} />
      {error ? <Notice>{error}</Notice> : null}
      {sheet ? <ShopLiveSheet shop={live} onClose={closeLive} /> : null}
    </View>
  );
}
