import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { Thumb, TonePill } from "@/components/partner";
import { T } from "@/components/ui";
import { orderStage } from "@/lib/partner-pure";
import { capitalise, friendlyDay } from "@/lib/friendly";
import type { DropshipOrder, WholesaleOrder } from "@/lib/supplier";
import { ORDER_KIND_LABEL, supplierOrderStage } from "@/lib/supplier-pure";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// One supplier order in a list (Home, Orders): products, which shop it's for, where it goes, where it is, what you get.

export function openOrder(order: DropshipOrder | WholesaleOrder) {
  router.push({ pathname: "/supplier/order/[id]", params: { id: order.id, kind: order.kind } });
}

export function OrderRow({ order }: { order: DropshipOrder | WholesaleOrder }) {
  const t = useT("m_ui");
  const tone = orderStage(order.status).tone;
  const stage = supplierOrderStage(order.status);
  const single = order.kind === "dropship";
  const title = single ? order.items.map((item) => (item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name)).join(", ") : `${order.product.name} ×${order.quantity.toLocaleString("en-NG")}`;
  const image = single ? order.items[0]?.image : order.product.image;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("partner.orderLabel", { title, shop: order.shop, stage })}
      onPress={() => openOrder(order)}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 18, padding: 12, opacity: pressed ? 0.8 : 1 })}
    >
      <Thumb uri={image} />
      <View style={{ flex: 1, gap: 3 }}>
        <T weight="extrabold" style={{ fontSize: 15 }} numberOfLines={1}>{title}</T>
        <T style={{ color: colors.inkSoft, fontSize: 14.5 }} numberOfLines={1}>
          {single ? t("partner.orderFor", { shop: order.shop, place: order.label.address[order.label.address.length - 1] ?? order.label.to }) : `${ORDER_KIND_LABEL.wholesale} · ${order.shop}`} · {capitalise(friendlyDay(order.createdAt, new Date(), t))}
        </T>
        <TonePill tone={tone} label={stage} style={{ marginTop: 2 }} />
        {order.pickup?.text && ["accepted", "processing", "confirmed"].includes(order.status) ? (
          <T weight="bold" style={{ color: colors.forest, fontSize: 14.5 }} numberOfLines={1}>{order.pickup.status === "finding_rider" ? t("partner.findingRider") : t("partner.riderBooked", { when: order.pickup.text.replace(/^Pick up/, "pick up") })}</T>
        ) : null}
      </View>
      <T weight="extrabold" style={{ fontSize: 15 }}>{naira(single ? order.yourTotal : order.total)}</T>
    </Pressable>
  );
}
