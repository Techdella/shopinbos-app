import { TEMPLATE_VARIABLES, TEMPLATE_VARIABLE_KEYS, type TemplateVariable } from "../../../../lib/marketing/text-channels.ts";

// Plain words for WhatsApp messages (simplicity rules, section 8A). Sellers never see {{1}}, MARKETING/UTILITY or
// language codes: they type "Hi [Customer's first name]" and tap chips. This converts between that text and the
// numbered placeholders + variable mapping WhatsApp needs. Pure, unit tested.

/** Chip label for each detail that can fill a placeholder. */
export const DETAIL_LABEL: Record<TemplateVariable, string> = {
  ...(Object.fromEntries(TEMPLATE_VARIABLE_KEYS.map((key) => [key, TEMPLATE_VARIABLES[key].label])) as Record<TemplateVariable, string>),
  first_name: "Customer's first name",
  store_name: "Shop name",
  cart_link: "Link to finish paying",
  cart_items: "What they were buying",
  tracking_code: "Delivery tracking number",
  tracking_link: "Delivery tracking link",
  order_link: "Link to their order",
};

const UNSET = "Customer detail";

/** "Hi {{1}}" + ["first_name"] → "Hi [Customer's first name]". */
export function toFriendly(body: string, variables: string[]) {
  return body.replace(/{{\s*(\d+)\s*}}/g, (_, n: string) => {
    const key = variables[Number(n) - 1] as TemplateVariable | undefined;
    return `[${key && key in DETAIL_LABEL ? DETAIL_LABEL[key] : `${UNSET} ${n}`}]`;
  });
}

const BY_LABEL = new Map<string, TemplateVariable>(TEMPLATE_VARIABLE_KEYS.map((key) => [DETAIL_LABEL[key].toLowerCase(), key]));

/** "Hi [Customer's first name]" → { body: "Hi {{1}}", variables: ["first_name"] }. Unknown [words] stay as text. */
export function fromFriendly(text: string): { body: string; variables: string[] } {
  const variables: string[] = [];
  const body = text.replace(/\[([^\]\n]{1,60})\]/g, (whole, inner: string) => {
    const label = inner.trim().toLowerCase();
    const key = BY_LABEL.get(label);
    if (key) {
      variables.push(key);
      return `{{${variables.length}}}`;
    }
    if (label.startsWith(UNSET.toLowerCase())) {
      variables.push("");
      return `{{${variables.length}}}`;
    }
    return whole;
  });
  return { body, variables };
}

export const CATEGORY_LABEL: Record<string, string> = { MARKETING: "Promotion", UTILITY: "Order update" };

export function categoryLabel(category: string) {
  return CATEGORY_LABEL[category] ?? "Promotion";
}

/** "weekend_sale" → "Weekend sale". */
export function friendlyName(name: string) {
  const text = name.replace(/_/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Untitled message";
}

/** WhatsApp's rejection codes in plain words. */
export function plainRejection(reason: string | null | undefined) {
  const code = String(reason ?? "").toUpperCase();
  if (!code) return "no reason given. Change the words a little and send it again.";
  if (/TAG_CONTENT_MISMATCH|INCORRECT_CATEGORY|PROMOTIONAL/.test(code)) return "it reads like a promotion. Change it to Promotion, or take out the offer.";
  if (/INVALID_FORMAT|FORMAT/.test(code)) return "the way it's written isn't allowed. Start and end with your own words, and check the links.";
  if (/ABUSIVE|SCAM|POLICY/.test(code)) return "WhatsApp thinks the words break its rules. Make it plainer and send it again.";
  if (/DUPLICATE|EXISTS/.test(code)) return "you already have a message with these words.";
  return `${code.replace(/_/g, " ").toLowerCase()}. Change the words a little and send it again.`;
}

/** templateProblems() (src/lib/marketing/text-channels.ts) in the words the editor uses. */
export function plainProblem(problem: string) {
  if (/lowercase letters, numbers and underscores/.test(problem)) return "Give the message a short name (under More options).";
  if (/Pick Marketing or Utility/.test(problem)) return "Choose Promotion or Order update.";
  if (/Pick a language/.test(problem)) return "Choose the language (under More options).";
  if (/start or end with a variable/.test(problem)) return "Start and end your message with your own words, not a customer detail.";
  if (/Variables must go/.test(problem)) return "Something is wrong with a customer detail in your message. Remove it and add it again with the buttons.";
  if (/Choose what {{\d+}} is filled with/.test(problem)) return `Pick what each [${UNSET}] should be, or remove it.`;
  if (/header without variables/.test(problem)) return "The title can't include customer details.";
  if (/footer without variables/.test(problem)) return "The small print can't include customer details.";
  return problem.replace(/\bheader\b/gi, "title").replace(/\bfooter\b/gi, "small print");
}

// Plain names for the order events (the lib labels use words like "checkout" and "abandoned cart").
export const EVENT_COPY: Record<string, { label: string; sub: string }> = {
  order_confirmed: { label: "Order confirmed", sub: "Right after they order" },
  payment_received: { label: "Payment received", sub: "When their payment arrives or you mark it paid" },
  order_shipped: { label: "On its way (with tracking)", sub: "When you send the order" },
  order_partly_shipped: { label: "Part of the order on its way", sub: "When the first parcel of an order sent in parts leaves (with the On its way SMS)" },
  order_delivered: { label: "Delivered", sub: "When the order is marked delivered" },
  abandoned_cart: { label: "Customers who didn't finish paying", sub: "One reminder, an hour after someone leaves without paying" },
};
