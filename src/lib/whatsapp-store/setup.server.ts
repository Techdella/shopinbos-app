import "server-only";

import { getCatalogRow } from "@/lib/whatsapp-catalog/server";
import { connectWhatsAppCatalog } from "@/lib/sales-channels/server";
import { loadAutomation, saveAutomation } from "@/lib/inbox/automation.server";

// One click to sell on WhatsApp: runs after a WhatsApp number connects (src/lib/inbox/connect.ts). Sets up the
// WhatsApp catalog (connectWhatsAppCatalog: find or make it, link it to the number with the cart on, send every
// product) and, once the cart is on, switches the WhatsApp store from "send a link" to the in-chat cart, unless
// the seller chose something else. Whether Peggy answers on WhatsApp stays the seller's choice.

export async function setUpWhatsAppSelling(storeId: string): Promise<{ ok: true; cart: boolean } | { ok: false; error: string; permission?: boolean }> {
  const result = await connectWhatsAppCatalog(storeId);
  if (!result.ok) return "needsSignup" in result ? { ok: false, error: "WhatsApp isn't connected" } : result;
  const catalog = await getCatalogRow(storeId).catch(() => null);
  const cart = Boolean(catalog?.catalogId && catalog.cartEnabled);
  if (cart) {
    const automation = await loadAutomation(storeId);
    if (automation.ready && automation.chatbot.whatsapp.ordering === "link") {
      await saveAutomation(storeId, { chatbot: { ...automation.chatbot, whatsapp: { ...automation.chatbot.whatsapp, ordering: "cart" } } }).catch(() => undefined);
    }
  }
  return { ok: true, cart };
}
