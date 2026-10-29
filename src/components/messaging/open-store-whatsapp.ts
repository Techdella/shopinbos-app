// "Chat on WhatsApp" anywhere on a store (theme buttons, the footer number) opens the store's WhatsApp chat window
// on the page (LiveChatWidget listens for this event) so the shopper stays on the store. When the store has no
// WhatsApp chat window (no WhatsApp number on its chat button, or the builder preview), WhatsApp itself opens.

export const OPEN_STORE_WHATSAPP_EVENT = "shopinbos:open-whatsapp";

export function openStoreWhatsApp(fallbackHref: string | null) {
  const handled = !window.dispatchEvent(new CustomEvent(OPEN_STORE_WHATSAPP_EVENT, { cancelable: true }));
  if (!handled && fallbackHref) window.open(fallbackHref, "_blank", "noopener,noreferrer");
}
