import { api } from "./api";

// Rex, the store designer: POST /api/ai/rex (the same agent as Rex Studio at /studio on the web). He edits the
// draft store, makes pictures, logos, descriptions and campaigns, and answers with text plus "cards".

export type RexCard =
  | { type: "image"; title: string; before: string | null; after: string; product: { id: string; name: string } | null }
  | { type: "logos"; options: Array<{ url: string; label: string }> }
  | { type: "store"; changes: string[]; version: { id: string; n: number } | null }
  | { type: "themes"; current: string; themes: Array<{ id: string; name: string; blurb: string }> }
  | { type: "copy"; product: { id: string; name: string }; after: string }
  | { type: "video"; product: { id: string; name: string }; script: { captions: string[]; voiceover: string; cta: string } }
  | { type: "marketing"; kind: string; id: string; title: string; summary: string; href: string }
  | { type: "health"; score: number; missing: Array<{ label: string; rexPrompt: string | null; href: string | null }> }
  | { type: "preview" };

export interface RexReply {
  text: string;
  cards: RexCard[];
}

/** The starter cards Rex Studio opens with (src/lib/ai/rex/starters.ts). Translated as m_rex "starter.<n>.title|prompt", in this order. */
export const REX_STARTERS = [
  { title: "Edit a product photo", prompt: "I want to edit one of my product photos." },
  { title: "Generate product images", prompt: "Make new pictures for one of my products." },
  { title: "Make a logo", prompt: "Make a logo for my store." },
  { title: "Make a product video", prompt: "Make a short video reel for one of my products." },
  { title: "Change a section of my store", prompt: "I want to change or rebuild a section of my store." },
  { title: "Build a campaign", prompt: "Help me build an email campaign for my customers." },
  { title: "Set up an automation", prompt: "Set up an automation for my store." },
  { title: "Write product descriptions", prompt: "Write better descriptions for my products." },
];

/** A one-line memory of a card for the conversation, so Rex can refer back to it (same as the web's cardNote). */
export function cardNote(card: RexCard): string {
  switch (card.type) {
    case "image":
      return `[Made a picture${card.product ? ` for ${card.product.name}` : ""}: ${card.after}]`;
    case "logos":
      return `[Made logo options: ${card.options.map((option) => `${option.label} ${option.url}`).join(", ")}]`;
    case "store":
      return `[Changed the draft${card.version ? ` (version ${card.version.n})` : ""}: ${card.changes.join("; ")}]`;
    case "themes":
      return "[Showed the theme cards]";
    case "copy":
      return `[Wrote a description for ${card.product.name}]`;
    case "video":
      return `[Prepared a reel for ${card.product.name}]`;
    case "marketing":
      return `[Created ${card.kind} "${card.title}"]`;
    case "health":
      return `[Store health ${card.score}/100]`;
    case "preview":
      return "[Opened the preview]";
    default:
      return "";
  }
}

/** Photos per message, as the server allows (src/lib/ai/rex/agent-pure.ts REX_MAX_PHOTOS). */
export const REX_MAX_PHOTOS = 6;

/** `imageUrls`: photos attached to the newest message, uploaded first (lib/photos.ts uploadPhoto), as Rex Studio sends them. */
export const askRex = (messages: Array<{ role: "user" | "assistant"; content: string }>, imageUrls: string[] = []) =>
  api<RexReply>("/api/ai/rex", { method: "POST", json: imageUrls.length ? { messages, imageUrls: imageUrls.slice(0, REX_MAX_PHOTOS) } : { messages } });
