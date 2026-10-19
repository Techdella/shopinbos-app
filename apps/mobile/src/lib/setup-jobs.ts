import type { TFunction } from "@shared/i18n";
import type { AppIconName } from "@/components/icons";

// Technical jobs the Shopinbos team does for people on mobile ("Ask us to set it up"), with plain helper sentences.
export const SETUP_JOBS = {
  "web-address": {
    icon: "store",
    title: "Connect a domain",
    sub: "Your own name like yourshop.com. We set it up for you.",
    description: "We'll get you a domain like yourshop.com, or connect one you already have, and set everything up. Your old link keeps working.",
    feature: "web_address",
    softwareQuestion: "Do you already have a domain? Type it here",
    softwarePlaceholder: "yourshop.com",
  },
  channels: {
    icon: "chat",
    title: "Connect WhatsApp, Instagram or TikTok",
    sub: "So their chats come here and your products show there.",
    description: "We'll connect your WhatsApp Business, Instagram, Facebook or TikTok to your shop with you. Chats come to Chats, and your products show there.",
    feature: "channels",
    softwareQuestion: "Which ones? (WhatsApp, Instagram, TikTok…)",
    softwarePlaceholder: "WhatsApp and Instagram",
  },
  "product-lists": {
    icon: "box",
    title: "Product feeds for Google and Facebook",
    sub: "So people find them when they search or scroll.",
    description: "We'll send your products to Google Shopping and the Facebook and Instagram shop, and keep them up to date.",
    feature: "product_feeds",
    softwareQuestion: undefined,
    softwarePlaceholder: undefined,
  },
  software: {
    icon: "settings",
    title: "Integrations",
    sub: "Connect accounting, delivery or other software you use.",
    description: "Tell us what you use. Our team connects it to your shop so you don't have to type things twice.",
    feature: "developer",
    softwareQuestion: "Which software do you use?",
    softwarePlaceholder: "For example: QuickBooks",
  },
  other: {
    icon: "help",
    title: "Something else",
    sub: "Tell us what you need.",
    description: "Tell us what you'd like set up. A person from Shopinbos will do it with you.",
    feature: "other",
    softwareQuestion: undefined,
    softwarePlaceholder: undefined,
  },
} satisfies Record<string, { icon: AppIconName; title: string; sub: string; description: string; feature: string; softwareQuestion: string | undefined; softwarePlaceholder: string | undefined }>;

export type SetupJobKey = keyof typeof SETUP_JOBS;

/** A job's words in the app language (m_help "job.<key>.*"; English above is the fallback). */
export function setupJobWords(key: SetupJobKey, t: Pick<TFunction, "dynamic">) {
  const job = SETUP_JOBS[key];
  const word = (field: "title" | "sub" | "description" | "softwareQuestion" | "softwarePlaceholder") => {
    const english = job[field];
    return english === undefined ? undefined : t.dynamic(`job.${key}.${field}`, english);
  };
  return { ...job, title: word("title")!, sub: word("sub")!, description: word("description")!, softwareQuestion: word("softwareQuestion"), softwarePlaceholder: word("softwarePlaceholder") };
}
