import type { ReactNode } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { Row } from "@/components/design";
import { Pic } from "@/components/SupplierKit";
import { T } from "@/components/ui";
import type { DropshipOrder, WholesaleOrder } from "@/lib/supplier";
import { orderKindLabel, orderRowStatus } from "@/lib/supplier-pure";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// One supplier order as a row in the Orders list ("Simple app, end to end" supplier prototype): the picture,
// "{shop} · {what you get}" and "{Dropship|Wholesale} · {item} · {status}". A new order also counts down the time
// left to accept it.

type AnyOrder = DropshipOrder | WholesaleOrder;

export function openOrder(order: AnyOrder) {
  router.push({ pathname: "/supplier/order/[id]", params: { id: order.id, kind: order.kind } });
}

/** "Lace front wig × 6", or the items of a dropship order. */
export function orderItems(order: AnyOrder) {
  return order.kind === "dropship" ? order.items.map((item) => (item.quantity > 1 ? `${item.name} × ${item.quantity}` : item.name)).join(", ") : `${order.product.name} × ${order.quantity.toLocaleString("en-NG")}`;
}

export const orderImage = (order: AnyOrder) => (order.kind === "dropship" ? order.items[0]?.image : order.product.image);

export const orderAmount = (order: AnyOrder) => (order.kind === "dropship" ? order.yourTotal : order.total);

/** `below` sits under the grey line (the accept countdown on a new order). */
export function OrderRow({ order, below }: { order: AnyOrder; below?: ReactNode }) {
  const t = useT("m_supplier", "m_partner");
  const line = `${orderKindLabel(order.kind, t)} · ${orderItems(order)} · ${orderRowStatus(order, t)}`;
  return (
    <Row
      lead={<Pic uri={orderImage(order)} />}
      title={`${order.shop} · ${naira(orderAmount(order))}`}
      sub={
        below ? (
          <View style={{ gap: 6 }}>
            <T style={{ fontSize: 14, lineHeight: 19, color: colors.inkSoft }} numberOfLines={2}>{line}</T>
            {below}
          </View>
        ) : (
          line
        )
      }
      onPress={() => openOrder(order)}
    />
  );
}
