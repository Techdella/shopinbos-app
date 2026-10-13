// A store's service emails to its customers (B): order confirmation, refund, review request, invoice, inbox reply.
// Pure builders on the shared shell (unit-tested); the server code loads the store (compliance.server.ts) and sends.

import { escapeHtml, html, storeEmail, type StoreSender } from "./shell.ts";

export interface OrderEmailInput {
  appUrl: string;
  store: StoreSender;
  buyerName?: string | null;
  orderNumber: string;
  items: Array<{ name: string; qty: number; price: string }>;
  subtotal?: string | null;
  shipping?: string | null;
  total: string;
  orderUrl?: string | null;
  /** "Pay on delivery", "Paid by card"… */
  paymentNote?: string | null;
}

const first = (name: string | null | undefined) => String(name ?? "").trim().split(/\s+/)[0] || "there";

export function orderConfirmationEmail(input: OrderEmailInput) {
  const rows = [
    ...input.items.map((item) => ({ label: `${item.name} × ${item.qty}`, value: item.price })),
    ...(input.subtotal ? [{ label: "Subtotal", value: input.subtotal, muted: true }] : []),
    ...(input.shipping ? [{ label: "Delivery", value: input.shipping, muted: true }] : []),
    { label: "Total", value: input.total, strong: true },
  ];
  return {
    subject: `Order confirmed: ${input.orderNumber}`,
    html: storeEmail({
      appUrl: input.appUrl,
      store: input.store,
      kind: "transactional",
      preheader: `Thanks for your order from ${input.store.name}. Order ${input.orderNumber}, ${input.total}.`,
      eyebrow: `Order ${input.orderNumber}`,
      heading: `Thank you, ${first(input.buyerName)}!`,
      bodyHtml: `${html.raw(`Your order from <strong>${escapeHtml(input.store.name)}</strong> is confirmed. Here's what you ordered.`)}${html.rows(rows)}${input.paymentNote ? html.small(input.paymentNote) : ""}${html.small("We'll send you an update when it's on its way.")}`,
      cta: input.orderUrl ? { label: "View your order", url: input.orderUrl } : null,
      reason: `you placed order ${input.orderNumber} with ${input.store.name}`,
    }),
  };
}

/** Some parcels of a shop order have left, not all: "Part of your order is on its way" (sent once per order). */
export function orderPartlySentEmail(input: { appUrl: string; store: StoreSender; buyerName?: string | null; orderNumber: string; sentItems: string[]; waitingItems: string[]; partsLine?: string | null; orderUrl?: string | null }) {
  const rows = [
    ...input.sentItems.map((name) => ({ label: name, value: "On its way" })),
    ...input.waitingItems.map((name) => ({ label: name, value: "Coming soon", muted: true })),
  ];
  return {
    subject: `Part of your order is on its way: ${input.orderNumber}`,
    html: storeEmail({
      appUrl: input.appUrl,
      store: input.store,
      kind: "transactional",
      preheader: `Part of your order ${input.orderNumber} from ${input.store.name} is on its way. The rest follows soon.`,
      eyebrow: `Order ${input.orderNumber}`,
      heading: "Part of your order is on its way",
      bodyHtml: `${html.raw(`Hi ${escapeHtml(first(input.buyerName))}, your order from <strong>${escapeHtml(input.store.name)}</strong> comes in more than one parcel${input.partsLine ? ` (${escapeHtml(input.partsLine)})` : ""}. Here's what's on its way now.`)}${rows.length ? html.rows(rows) : ""}${html.small("We'll tell you when the rest is on its way. You don't need to do anything.")}`,
      cta: input.orderUrl ? { label: "View your order", url: input.orderUrl } : null,
      reason: `you placed order ${input.orderNumber} with ${input.store.name}`,
    }),
  };
}

export function refundEmail(input: { appUrl: string; store: StoreSender; buyerName: string; orderNumber: string; amount: string; kind: "automatic" | "by_store" }) {
  const body =
    input.kind === "automatic"
      ? html.raw(`We've refunded your payment of <strong>${escapeHtml(input.amount)}</strong>. It usually reaches your card or bank within 5 to 10 working days, depending on your bank.`)
      : html.raw(`${escapeHtml(input.store.name)} will refund your payment of <strong>${escapeHtml(input.amount)}</strong> and will contact you about it.`);
  return {
    subject: `Refund for order ${input.orderNumber}`,
    html: storeEmail({
      appUrl: input.appUrl,
      store: input.store,
      kind: "transactional",
      preheader: `About your order ${input.orderNumber} and your refund.`,
      eyebrow: `Order ${input.orderNumber}`,
      heading: "Your order couldn't be filled",
      bodyHtml: `${html.raw(`Hi ${escapeHtml(first(input.buyerName))}, order <strong>${escapeHtml(input.orderNumber)}</strong> from <strong>${escapeHtml(input.store.name)}</strong> expired before your payment arrived, and the items sold out in the meantime.`)}${body}${html.small("Sorry about this. Reply to this email if you have questions.")}`,
      reason: `you placed order ${input.orderNumber} with ${input.store.name}`,
    }),
  };
}

export function reviewRequestEmail(input: { appUrl: string; store: StoreSender; customerName: string; link: string; items: string[] }) {
  return storeEmail({
    appUrl: input.appUrl,
    store: input.store,
    kind: "transactional",
    preheader: `A quick rating helps other buyers. It takes about a minute.`,
    heading: `How was your order, ${first(input.customerName)}?`,
    bodyHtml: `${html.p(`Thank you for shopping with ${input.store.name}. A quick rating helps other buyers and helps us get better.`)}${html.list(input.items.slice(0, 6))}`,
    cta: { label: "Leave a review", url: input.link },
    reason: `you recently ordered from ${input.store.name}`,
    serviceNote: `This is a one-off follow-up about your order with ${input.store.name}.`,
  });
}

export function invoiceEmail(input: { appUrl: string; store: StoreSender; invoiceId: string; description: string; amount: string }) {
  return storeEmail({
    appUrl: input.appUrl,
    store: input.store,
    kind: "transactional",
    preheader: `Invoice ${input.invoiceId} from ${input.store.name}: ${input.amount}.`,
    eyebrow: `Invoice ${input.invoiceId}`,
    heading: `An invoice from ${input.store.name}`,
    bodyHtml: `${html.text(input.description)}${html.rows([{ label: "Total due", value: input.amount, strong: true }])}${html.small("Reply to this email if anything looks wrong.")}`,
    reason: `${input.store.name} sent you an invoice`,
    serviceNote: `This is a service message from ${input.store.name} about an invoice.`,
  });
}

/** A seller's reply from the shared inbox, sent by email. */
export function inboxReplyEmail(input: { appUrl: string; store: StoreSender; body: string }) {
  return storeEmail({
    appUrl: input.appUrl,
    store: input.store,
    kind: "transactional",
    preheader: input.body.slice(0, 120),
    heading: `A reply from ${input.store.name}`,
    bodyHtml: `${html.text(input.body)}${html.small("Reply to this email to answer.")}`,
    reason: `you contacted ${input.store.name}`,
    serviceNote: `This is a reply to your conversation with ${input.store.name}.`,
  });
}
