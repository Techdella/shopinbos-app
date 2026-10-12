import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { Thumb, TonePill } from "@/components/partner";
import { T } from "@/components/ui";
import { orderStage } from "@/lib/partner-pure";
import { capitalise, friendlyDay } from "@/lib/friendly";
import type { DropshipOrder, WholesaleOrder } from "@/lib/supplier";
import { ORDER_KIND_LABEL, supplierOrderStage } from "@/lib/supplier-pure";
import { colors } from "@/theme";

// One supplier order in a list (Home, Orders): products, which shop it's for, where it goes, where it is, what you get.

export function openOrder(order: DropshipOrder | WholesaleOrder) {
  router.push({ pathname: "/supplier/order/[id]", params: { id: order.id, kind: order.kind } });
}

export function OrderRow({ order }: { order: DropshipOrder | WholesaleOrder }) {
  const tone = orderStage(order.status).tone;
  const stage = supplierOrderStage(order.status);
  const single = order.kind === "dropship";
  const title = single ? order.items.map((item) => (item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name)).join(", ") : `${order.product.name} ×${order.quantity.toLocaleString("en-NG")}`;
  const image = single ? order.items[0]?.image : order.product.image;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, for ${order.shop}, ${stage}`}
      onPress={() => openOrder(order)}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 18, padding: 12, opacity: pressed ? 0.8 : 1 })}
    >
      <Thumb uri={image} />
      <View style={{ flex: 1, gap: 3 }}>
        <T weight="extrabold" style={{ fontSize: 15 }} numberOfLines={1}>{title}</T>
        <T style={{ color: colors.inkSoft, fontSize: 14.5 }} numberOfLines={1}>
          {single ? `For ${order.shop} · to ${order.label.address[order.label.address.length - 1] ?? order.label.to}` : `${ORDER_KIND_LABEL.wholesale} · ${order.shop}`} · {capitalise(friendlyDay(order.createdAt))}
        </T>
        <TonePill tone={tone} label={stage} style={{ marginTop: 2 }} />
      </View>
      <T weight="extrabold" style={{ fontSize: 15 }}>{naira(single ? order.yourTotal : order.total)}</T>
    </Pressable>
  );
}
