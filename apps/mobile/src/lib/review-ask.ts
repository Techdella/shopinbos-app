// Ask for reviews now (app/reviews/ask.tsx), the same choices as the web form (src/app/home/reviews/_components/
// RequestForm.tsx). Pure, so tests/mobile-native-tools.test.mjs can run it.

export type RequestChannel = "email" | "sms" | "whatsapp" | "link";

interface Askable {
  id: string;
  reach: Record<RequestChannel, boolean>;
  asked: unknown;
  reviewed: boolean;
}

/** Email when the shop can send email, otherwise a WhatsApp message the seller sends from their phone. */
export function defaultChannel(ready: Partial<Record<RequestChannel, boolean>>): RequestChannel {
  return ready.email ? "email" : "link";
}

/** A message from the seller's own WhatsApp always works; the others need the shop's account set up. */
export function channelReady(ready: Partial<Record<RequestChannel, boolean>>, channel: RequestChannel) {
  return channel === "link" || Boolean(ready[channel]);
}

/** People already asked or who already reviewed are hidden until "Show people already asked". */
export function visibleOrders<T extends Askable>(orders: T[], showAll: boolean) {
  return showAll ? orders : orders.filter((order) => !order.asked && !order.reviewed);
}

/** "Choose all": everyone shown who can be reached this way. */
export function chooseAll<T extends Askable>(orders: T[], channel: RequestChannel) {
  return orders.filter((order) => order.reach[channel]).map((order) => order.id);
}

/** Drops chosen people who can't be reached after switching how to ask. */
export function keepReachable<T extends Askable>(chosen: string[], orders: T[], channel: RequestChannel) {
  const ok = new Set(chooseAll(orders, channel));
  return chosen.filter((id) => ok.has(id));
}
