import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import type { BrandingOffer } from "@shared/dropship-rules";
import { AppIcon, type AppIconName } from "@/components/icons";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { PriceInput, useWords } from "@/components/supplier/DropshipKit";
import { Notice, PillButton, T, Toggle } from "@/components/ui";
import { amountOf } from "@/lib/dropship-pure";
import { fetchBranding, saveBranding, type BrandingView } from "@/lib/supplier";
import { useLoad } from "@/lib/useLoad";
import { colors, radii } from "@/theme";

// Seller branding (P-Branding; the web's /supplier/branding): what the supplier can do for shops that dropship from
// them, so the customer feels the parcel came from the seller's shop. Blind packing and the seller's name on
// tracking are always on; printing the seller's packing slip and using their stickers or bags (each with an optional
// fee per parcel) unlock at Trusted, shown locked for New suppliers with a link to Your level; custom packaging
// (quoted in chat) is open to everyone. GET/PUT /api/supplier/branding.

function Item({ icon, tint, title, sub, right, children }: { icon: AppIconName; tint: string; title: string; sub: string; right: ReactNode; children?: ReactNode }) {
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, paddingHorizontal: 14, paddingVertical: 12, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: tint, alignItems: "center", justifyContent: "center" }}>
          <AppIcon name={icon} size={20} color={colors.ink} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T weight="extrabold" style={{ fontSize: 15 }}>{title}</T>
          <T style={{ fontSize: 13, lineHeight: 18, color: colors.inkSoft }}>{sub}</T>
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

function BrandingForm({ view }: { view: BrandingView }) {
  const words = useWords();
  const [slip, setSlip] = useState(view.offer.packingSlip);
  const [slipFee, setSlipFee] = useState(view.offer.packingSlipFee ? String(view.offer.packingSlipFee) : "");
  const [stickers, setStickers] = useState(view.offer.stickers);
  const [stickerFee, setStickerFee] = useState(view.offer.stickerFee ? String(view.offer.stickerFee) : "");
  const [custom, setCustom] = useState(view.offer.custom);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = !view.allowed;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const offer: Partial<BrandingOffer> = locked
        ? { custom }
        : { packingSlip: slip, packingSlipFee: slip ? amountOf(slipFee) ?? 0 : 0, stickers, stickerFee: stickers ? amountOf(stickerFee) ?? 0 : 0, custom };
      await saveBranding(offer);
      router.back();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : words("brand.saveFailed", "Couldn't save. Try again."));
    } finally {
      setBusy(false);
    }
  }

  const always = (
    <View style={{ backgroundColor: colors.successTint, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}>
      <T weight="extrabold" style={{ fontSize: 10.5, letterSpacing: 0.6, color: colors.success }}>{words("brand.always", "ALWAYS ON")}</T>
    </View>
  );
  const lock = (
    <Pressable accessibilityRole="button" accessibilityLabel={words("brand.lockedLabel", "Unlocks at Trusted. See your level")} onPress={() => router.push("/supplier/level")} style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.grayTint, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
      <AppIcon name="lock" size={13} color={colors.grayInk} />
      <T weight="bold" style={{ fontSize: 12, color: colors.grayInk }}>{words("brand.trusted", "Trusted")}</T>
    </Pressable>
  );
  const fee = (value: string, onChange: (text: string) => void, label: string) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <T weight="semibold" style={{ flex: 1, fontSize: 14 }}>{words("brand.fee", "Your fee per parcel")}</T>
      <View style={{ width: 140 }}>
        <PriceInput compact value={value} onChange={onChange} label={label} placeholder={words("brand.free", "Free")} />
      </View>
    </View>
  );

  return (
    <Screen
      title={words("brand.title", "Seller branding")}
      sub={words("brand.sub", "What you can do for shops that dropship from you")}
      footer={<PillButton title={words("brand.save", "Save")} tone="accent" busy={busy} onPress={() => void save()} />}
    >
      <T style={{ fontSize: 14, lineHeight: 20, color: colors.inkSoft }}>{words("brand.intro", "Customers should feel the parcel came from the seller's shop. The first two are always on.")}</T>
      <View style={{ gap: 10 }}>
        <Item icon="box" tint={colors.lilac} title={words("brand.blind", "Blind packing")} sub={words("brand.blindSub", "No price tag, receipt or your name inside")} right={always} />
        <Item icon="chat" tint={colors.successTint} title={words("brand.tracking", "Seller's name on tracking")} sub={words("brand.trackingSub", "Texts and WhatsApp updates come from the seller's shop")} right={always} />
        <Item icon="printer" tint={colors.peach} title={words("brand.slip", "Print the seller's packing slip")} sub={words("brand.slipSub", "Their logo, thank-you note and SKU. Needs a printer.")} right={locked ? lock : <Toggle on={slip} onChange={setSlip} label={words("brand.slipLabel", "Print packing slips")} />}>
          {!locked && slip ? fee(slipFee, setSlipFee, words("brand.slipFee", "Packing slip fee per parcel")) : null}
        </Item>
        <Item icon="tag" tint="#E7E1FF" title={words("brand.stickers", "Use the seller's stickers or bags")} sub={words("brand.stickersSub", "They send you a pack once. You use one per order.")} right={locked ? lock : <Toggle on={stickers} onChange={setStickers} label={words("brand.stickersLabel", "Use seller stickers")} />}>
          {!locked && stickers ? fee(stickerFee, setStickerFee, words("brand.stickerFee", "Sticker fee per parcel")) : null}
        </Item>
        <Item icon="sparkle" tint={colors.warnTint} title={words("brand.custom", "Custom packaging")} sub={words("brand.customSub", "Boxes, cards, gift wrap. You quote in chat.")} right={<Toggle on={custom} onChange={setCustom} label={words("brand.customLabel", "Offer custom packaging")} />} />
      </View>
      {locked ? <Notice tone="info">{words("brand.lockedNote", "Packing slips and stickers open when you reach Trusted: 25 delivered orders and a 4.3 rating.")}</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
    </Screen>
  );
}

export default function SupplierBrandingScreen() {
  const words = useWords();
  const branding = useLoad(fetchBranding);
  // The form starts from what was saved (its state is set once, so a quiet reload doesn't undo a change).
  if (branding.data) return <BrandingForm view={branding.data} />;
  return (
    <Screen title={words("brand.title", "Seller branding")}>
      {branding.loading ? <LoadingBlock /> : null}
      {branding.error ? <ErrorState message={branding.error} onRetry={() => void branding.reload()} /> : null}
    </Screen>
  );
}
