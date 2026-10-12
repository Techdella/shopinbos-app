import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { Thumb, TonePill } from "@/components/partner";
import { T } from "@/components/ui";
import { orderStage, timeAgo } from "@/lib/partner-pure";
import type { DropshipOrder, WholesaleOrder } from "@/lib/supplier";
import { colors } from "@/theme";

// One supplier order in a list (Home, Orders): products, which shop it's for, where it goes, status and value.

export function openOrder(order: DropshipOrder | WholesaleOrder) {
  router.push({ pathname: "/supplier/order/[id]", params: { id: order.id, kind: order.kind } });
}

export function OrderRow({ order }: { order: DropshipOrder | WholesaleOrder }) {
  const stage = orderStage(order.status);
  const dropship = order.kind === "dropship";
  const title = dropship ? order.items.map((item) => `${item.name} × ${item.quantity}`).join(", ") : `${order.product.name} × ${order.quantity.toLocaleString("en-NG")}`;
  const image = dropship ? order.items[0]?.image : order.product.image;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, for ${order.shop}, ${stage.label}`}
      onPress={() => openOrder(order)}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 18, padding: 12, opacity: pressed ? 0.8 : 1 })}
    >
      <Thumb uri={image} />
      <View style={{ flex: 1, gap: 3 }}>
        <T weight="extrabold" style={{ fontSize: 14.5 }} numberOfLines={1}>{title}</T>
        <T style={{ color: colors.inkSoft, fontSize: 12.5 }} numberOfLines={1}>
          {dropship ? `For ${order.shop} · to ${order.label.address[order.label.address.length - 1] ?? order.label.to}` : `Wholesale · ${order.shop}`} · {timeAgo(order.createdAt)}
        </T>
        <TonePill tone={stage.tone} label={dropship && order.mixed ? "Shop is handling it" : stage.label} style={{ marginTop: 2 }} />
      </View>
      <T weight="extrabold" style={{ fontSize: 14.5 }}>{naira(dropship ? order.yourTotal : order.total)}</T>
    </Pressable>
  );
}
