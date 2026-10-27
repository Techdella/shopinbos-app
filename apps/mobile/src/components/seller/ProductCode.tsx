import { useCallback } from "react";
import { View } from "react-native";
import { naira } from "@shared/onboarding";
import { productShareMessage } from "@shared/product-codes";
import { IconButton } from "@/components/seller/bits";
import { PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { shareOnWhatsApp } from "@/lib/share";
import { colors, fonts, radii } from "@/theme";

// A product's short code (BAG2) and Share to WhatsApp, for the product list, the product page, order lines and the
// record-sale picker. The WhatsApp message (shared/product-codes.ts productShareMessage) is in the seller's language:
// "Ankara Maxi Dress – ₦18,500 / Code: DRS3 / Order here: <product page>?ref=wa".

export interface SharedProduct {
  name: string;
  retailPrice: number;
  shortCode?: string | null;
  url?: string | null;
}

/** The small mono "BAG2" badge. */
export function CodeBadge({ code }: { code: string }) {
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: colors.canvas, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
      <T style={{ fontFamily: fonts.mono, fontSize: 12.5, letterSpacing: 0.6, color: colors.ink }}>{code}</T>
    </View>
  );
}

/** Opens WhatsApp with the product's message ready (the share sheet when WhatsApp isn't installed). */
export function useShareProduct() {
  const t = useT("common");
  return useCallback(
    (product: SharedProduct) => {
      if (!product.url) return;
      const message = productShareMessage(
        { name: product.name, price: product.retailPrice > 0 ? naira(product.retailPrice) : null, code: product.shortCode, url: product.url },
        { code: t("product.code"), orderHere: t("product.orderHere") },
      );
      void shareOnWhatsApp(message);
    },
    [t],
  );
}

/** The round share icon on a product row. */
export function ShareProductIcon({ product }: { product: SharedProduct }) {
  const t = useT("common");
  const share = useShareProduct();
  if (!product.url) return null;
  return <IconButton icon="share" label={`${t("product.shareWhatsapp")}: ${product.name}`} onPress={() => share(product)} />;
}

/** "Share to WhatsApp" as a full-width button (product page, after adding a product). */
export function ShareProductButton({ product }: { product: SharedProduct }) {
  const t = useT("common");
  const share = useShareProduct();
  if (!product.url) return null;
  return (
    <PillButton tone="forest" accessibilityLabel={t("product.shareWhatsapp")} onPress={() => share(product)} icon="chat" title={t("product.shareWhatsapp")} />
  );
}
