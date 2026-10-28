import type { ReactNode } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { Row } from "@/components/design";
import { PreorderPill } from "@/components/Preorder";
import { Pic } from "@/components/SupplierKit";
import { T } from "@/components/ui";
import type { DropshipOrder, WholesaleOrder } from "@/lib/supplier";
import { orderCity, orderKindLabel, orderRowStatus } from "@/lib/supplier-pure";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// One supplier order as a row in the Orders list ("Familiar app" supplier prototype `orders`): the picture, the
// shop over "{Dropship|Wholesale} · {item} · {status}", and on the right what you get with the town it goes to.
// A new order also counts down the time left to accept it. A preorder (wholesale) shows "Preorder · 12 Dec".

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

/** `below` sits under the row at its full width (the accept countdown on a new order, so it stays on one line). */
export function OrderRow({ order, below }: { order: AnyOrder; below?: ReactNode }) {
  const t = useT("m_supplier", "m_partner");
  // A shop's sample (one piece at the dropship price, shared/samples.ts) says so instead of "Wholesale".
  const kind = order.kind === "wholesale" && order.sample ? t("kind.sample") : orderKindLabel(order.kind, t);
  const line = `${kind} · ${orderItems(order)} · ${orderRowStatus(order, t)}`;
  const amount = naira(orderAmount(order));
  const city = orderCity(order);
  const preorder = order.preorder ?? null;
  return (
    <Row
      accessibilityLabel={[order.shop, amount, city, line].filter(Boolean).join(". ")}
      lead={<Pic uri={orderImage(order)} />}
      title={order.shop}
      sub={
        preorder ? (
          <View style={{ gap: 6 }}>
            <T style={{ fontSize: 14, lineHeight: 19, color: colors.inkSoft }} numberOfLines={2}>{line}</T>
            <PreorderPill preorder={preorder} />
          </View>
        ) : (
          line
        )
      }
      below={below}
      leadWidth={52}
      right={
        <View style={{ alignItems: "flex-end", gap: 2, maxWidth: 110 }}>
          <T weight="extrabold" style={{ fontSize: 15 }} numberOfLines={1}>{amount}</T>
          {city ? <T style={{ fontSize: 13, color: colors.inkSoft }} numberOfLines={1}>{city}</T> : null}
        </View>
      }
      chevron={false}
      onPress={() => openOrder(order)}
    />
  );
}
