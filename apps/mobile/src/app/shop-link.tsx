import { useState } from "react";
import { useFeature } from "@/lib/features";
import { View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Small } from "@/components/design";
import { ErrorState, LoadingBlock, Picture } from "@/components/kit";
import { LinkShareButtons } from "@/components/LinkShareButtons";
import { Screen } from "@/components/Screen";
import { Card, Field, Label, Notice, PillButton, T } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { changeShopHandle, fetchShopLink, HANDLE_ERROR_CODES } from "@/lib/shop-link";
import { openShop } from "@/lib/share";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors, fonts, radii } from "@/theme";
import { handleProblem, normaliseHandle, PLUG_LIVE, shopQrUrl } from "@shared/shop-handle";

// Your shop link & QR (Menu › Look; web /home/store/share): the shop's @handle (the owner can change it), the QR
// code of its short link to show at a stall or screenshot for a flyer, and the short link with Copy, Share and Send
// on WhatsApp. The card says "Shop with us on Shopinbos"; `plug` (off until Plug, the customer app, ships; the
// pilot switch will turn it on) says "Follow us on Shopinbos Plug" instead. Printing stickers and flyers is on the
// web page.

/** The card customers see: logo and name, the line, the QR code, the @handle and the short link. */
export function ShopQrCard({ name, logoUrl, handle, shortUrl, shortHost, plug = PLUG_LIVE }: { name: string; logoUrl: string | null; handle: string; shortUrl: string; shortHost: string; plug?: boolean }) {
  const t = useT("shopLink");
  return (
    <Card style={{ alignItems: "center", gap: 10, paddingVertical: 22 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, maxWidth: "100%" }}>
        <Picture uri={logoUrl} name={name} size={36} shape="square" />
        <T weight="extrabold" style={{ fontSize: 18, flexShrink: 1 }} numberOfLines={1}>{name}</T>
      </View>
      <T weight="bold" style={{ fontSize: 14, color: colors.inkSoft }}>{plug ? t("card.follow") : t("card.shopWith")}</T>
      {/* Always dark on white, in dark mode too, so any camera reads it. */}
      <View accessible accessibilityRole="image" accessibilityLabel={t("qr.alt", { name })} style={{ padding: 10, backgroundColor: "#FFFFFF", borderRadius: radii.field }}>
        <QRCode value={shopQrUrl(shortUrl)} size={220} color="#16141F" backgroundColor="#FFFFFF" quietZone={4} />
      </View>
      <T weight="extrabold" style={{ fontSize: 24 }} selectable>@{handle}</T>
      <T style={{ fontFamily: fonts.mono, fontSize: 13.5, color: colors.inkSoft }} numberOfLines={1}>{shortHost}</T>
      <T weight="bold" style={{ fontSize: 11.5, letterSpacing: 1.6, color: colors.inkSoft }}>{(plug ? t("card.scanFollow") : t("card.scan")).toUpperCase()}</T>
    </Card>
  );
}

export default function ShopLinkScreen() {
  const t = useT("shopLink", "m_ui");
  // "Follow us on Shopinbos Plug": a pilot switch (plug_follow_card) until Plug ships for everyone.
  const plugCard = useFeature("plug_follow_card");
  const loaded = useLoad(fetchShopLink);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  const link = loaded.data;
  const handle = link?.handle ?? null;
  const wanted = normaliseHandle(draft);
  const shape = editing && wanted && wanted !== handle ? handleProblem(wanted) : null;

  async function save() {
    if (!handle) return;
    if (shape) return setNote({ tone: "error", text: t(`problem.${shape}`) });
    if (!wanted || wanted === handle) return setEditing(false);
    setSaving(true);
    setNote(null);
    try {
      loaded.setData(await changeShopHandle(wanted));
      setEditing(false);
      setNote({ tone: "success", text: t("handle.saved") });
    } catch (error) {
      const code = error instanceof ApiError ? error.code : undefined;
      const known = code && (HANDLE_ERROR_CODES as readonly string[]).includes(code);
      setNote({ tone: "error", text: known ? t.dynamic(`problem.${code}`, t("problem.generic")) : error instanceof ApiError && error.status === 403 ? t("handle.ownerOnly") : t("problem.generic") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen title={t("title")} sub={t("sub")} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()} fallback="/shop">
      {loaded.loading && !link ? <LoadingBlock /> : null}
      {loaded.error && !link ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      {link && !handle ? <Notice tone="info">{t("handle.none")}</Notice> : null}

      {link && handle ? (
        <>
          <ShopQrCard name={link.storeName} logoUrl={link.logoUrl} handle={handle} shortUrl={link.shortUrl} shortHost={link.shortHost} plug={PLUG_LIVE || plugCard} />

          {/* The @handle: shown, or edited (owner only). */}
          <Card style={{ gap: 10 }}>
            <Label>{t("handle.label")}</Label>
            {editing ? (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <T weight="extrabold" style={{ fontSize: 18, color: colors.inkSoft }}>@</T>
                  <View style={{ flex: 1 }}>
                    <Field
                      testID="shop-handle-field"
                      value={draft}
                      onChangeText={(value) => {
                        setDraft(value);
                        setNote(null);
                      }}
                      autoFocus
                      autoCapitalize="none"
                      autoCorrect={false}
                      maxLength={40}
                      returnKeyType="done"
                      onSubmitEditing={() => void save()}
                      accessibilityLabel={t("handle.label")}
                    />
                  </View>
                </View>
                <Small style={shape ? { color: colors.danger } : undefined}>{shape ? t(`problem.${shape}`) : t("handle.help")}</Small>
                <Small>{t("handle.warn")}</Small>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <PillButton size="md" tone="white" style={{ flex: 1 }} title={t("handle.cancel")} onPress={() => {
                    setEditing(false);
                    setNote(null);
                  }} />
                  <PillButton testID="shop-handle-save" size="md" style={{ flex: 1 }} title={t("handle.save")} busy={saving} disabled={Boolean(shape)} onPress={() => void save()} />
                </View>
              </>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <T weight="extrabold" style={{ flex: 1, fontSize: 20 }} numberOfLines={1}>@{handle}</T>
                {link.canEdit ? (
                  <PillButton testID="shop-handle-change" size="sm" tone="white" icon="settings" title={t("handle.change")} onPress={() => {
                    setDraft(handle);
                    setNote(null);
                    setEditing(true);
                  }} />
                ) : null}
              </View>
            )}
            {!link.canEdit ? <Small>{t("handle.ownerOnly")}</Small> : null}
          </Card>
          {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}

          {/* The short link: Copy, Share, Send on WhatsApp, and open it. */}
          <Card style={{ gap: 10 }}>
            <Label>{t("link.label")}</Label>
            <LinkShareButtons url={link.shortUrl} message={t("shareText", { handle: `@${handle}`, url: link.shortUrl })} />
            <PillButton size="sm" tone="white" icon="globe" title={t("open")} onPress={() => void openShop(link.shortUrl)} />
            <Small>{t("link.opens", { url: link.storeUrl.replace(/^https?:\/\//, "") })}</Small>
          </Card>

          <Small style={{ textAlign: "center", paddingHorizontal: 12 }}>{t("print.sub")}</Small>
        </>
      ) : null}
    </Screen>
  );
}
