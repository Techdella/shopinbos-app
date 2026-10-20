// How people reach Shopinbos: the WhatsApp Business number (Shopinbos WhatsApp account on Meta) and support email.
// NEXT_PUBLIC_SUPPORT_WHATSAPP overrides the number (international format, digits only). Pure, browser-safe.

export const SHOPINBOS_WHATSAPP = "17116951381";

export function supportWhatsApp(env: string | undefined = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP) {
  return (env ?? "").replace(/\D/g, "") || SHOPINBOS_WHATSAPP;
}

/** wa.me link to the Shopinbos number, with a message ready to send. */
export function whatsappChatUrl(text?: string, number = supportWhatsApp()) {
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** "+1 711-695-1381" for display. */
export function formatWhatsApp(number = supportWhatsApp()) {
  return number.length === 11 && number.startsWith("1") ? `+1 ${number.slice(1, 4)}-${number.slice(4, 7)}-${number.slice(7)}` : `+${number}`;
}
