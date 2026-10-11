// The starter cards Rex Studio opens with. Each sends `prompt` to Rex, who asks for anything he still needs
// (which product, which photo) and then does it with his tools. Pure, shared by the page and tests.

export interface RexStarter {
  id: string;
  title: string;
  hint: string;
  prompt: string;
  icon: "image" | "sparkle" | "palette" | "play" | "layers" | "megaphone" | "automation" | "edit";
}

export const REX_STARTERS: readonly RexStarter[] = [
  { id: "edit-photo", title: "Edit a product photo", hint: "Brighter, white background, cut-out or a lifestyle scene", prompt: "I want to edit one of my product photos.", icon: "image" },
  { id: "product-images", title: "Generate product images", hint: "New shots and banners from a description", prompt: "Make new pictures for one of my products.", icon: "sparkle" },
  { id: "logo", title: "Make a logo", hint: "Three ideas, tap one to use it", prompt: "Make a logo for my store.", icon: "palette" },
  { id: "video", title: "Make a product video", hint: "A reel for Instagram, TikTok or WhatsApp", prompt: "Make a short video reel for one of my products.", icon: "play" },
  { id: "section", title: "Change or rebuild a section of my store", hint: "Words, layout, colours or the whole theme", prompt: "I want to change or rebuild a section of my store.", icon: "layers" },
  { id: "campaign", title: "Build a campaign", hint: "An email to your customers, saved as a draft", prompt: "Help me build an email campaign for my customers.", icon: "megaphone" },
  { id: "automation", title: "Set up an automation", hint: "Welcome, abandoned checkout, thank-you emails", prompt: "Set up an automation for my store.", icon: "automation" },
  { id: "descriptions", title: "Write product descriptions", hint: "Clear words that sell, you approve each one", prompt: "Write better descriptions for my products.", icon: "edit" },
];

/** Words that mean the seller wants to see their store (opens the preview without asking Rex). */
const PREVIEW_REQUEST = /^(please\s+)?(show|open|let me see|preview|view)\s+(me\s+)?(my\s+|the\s+)?(store|shop|site|website|preview)\b/i;

export function isPreviewRequest(text: string) {
  return PREVIEW_REQUEST.test(text.trim());
}
