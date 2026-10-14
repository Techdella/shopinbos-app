// The shipping label as plain text, to send on WhatsApp (app/order/label.tsx). Pure, unit-tested in
// tests/product-edit-labels.test.mjs. The words come from the m_label catalog through `t`.

export interface ShippingLabel {
  orderId: string;
  orderNumber: string;
  buyerName: string;
  buyerPhone: string | null;
  addressLines: string[];
  collect: number;
  itemCount: number;
  createdAt: string;
  trackUrl: string;
}

export interface LabelShop {
  name: string;
  phone: string | null;
  logoUrl: string | null;
}

type Words = (key: "label.deliverTo" | "label.pickup" | "label.collect" | "label.paid" | "label.items" | "label.from" | "label.track", values?: Record<string, string | number>) => string;

const naira = (amount: number) => `₦${Math.round(amount).toLocaleString("en-NG")}`;

export function labelText(shop: LabelShop, label: ShippingLabel, t: Words): string {
  return [
    `*${t("label.deliverTo")}*`,
    label.buyerName,
    label.buyerPhone,
    ...(label.addressLines.length ? label.addressLines : [t("label.pickup")]),
    "",
    label.collect > 0 ? t("label.collect", { amount: naira(label.collect) }) : t("label.paid"),
    `${label.orderNumber} · ${t("label.items", { count: label.itemCount })}`,
    t("label.from", { shop: shop.name }) + (shop.phone ? ` · ${shop.phone}` : ""),
    t("label.track", { url: label.trackUrl }),
  ]
    .filter((line): line is string => line !== null && line !== undefined)
    .join("\n");
}
