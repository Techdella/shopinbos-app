// What Rex's tools hand back to the chat besides his words: rich cards the seller can act on. Shared by the
// server (src/lib/ai/rex/tools.ts) and the Rex Studio chat (src/components/builder/rex). Types and one pure helper.

import type { StoreEditorSnapshot } from "@/lib/store-templates";
import type { RexVersionSummary } from "@/lib/ai/rex/studio-versions";

export type RexCard =
  | {
      type: "image";
      tool: "edit_product_photo" | "remove_background" | "lifestyle_photo" | "generate_product_image";
      title: string;
      before: string | null;
      after: string;
      /** Set when the image belongs to a product, so it can be saved there. */
      product: { id: string; name: string } | null;
      /** The product photo it was made from, so "Replace this photo" knows which one. */
      sourceIndex: number | null;
    }
  | { type: "logos"; options: Array<{ url: string; label: string; palette: { primary: string; secondary: string; accent: string } }> }
  | { type: "store"; changes: string[]; version: { id: string; n: number } | null; undoTo: string | null; page: string | null }
  | { type: "themes"; current: string; themes: Array<{ id: string; name: string; blurb: string; swatches: { bg: string; ink: string; accent: string }; dark: boolean }> }
  | { type: "copy"; product: { id: string; name: string }; before: string; after: string }
  | {
      type: "video";
      product: { id: string; name: string; photos: string[] };
      language: string;
      script: { captions: string[]; voiceover: string; cta: string };
      /** Reel template, voice and music (older cards have none: the studio picks). */
      template?: string;
      voice?: string;
      music?: string;
    }
  | {
      type: "brand";
      kind: "book" | "icon" | "favicon" | "print" | "display" | "packaging";
      title: string;
      summary: string;
      href: string;
      /** Brand colours to show as dots (style book). */
      swatches?: string[];
      /** A picture to show (the new icon or favicon). */
      image?: string | null;
    }
  | { type: "marketing"; kind: "campaign" | "automation" | "segment" | "content" | "template"; id: string; title: string; summary: string; href: string; canActivate: boolean }
  | { type: "health"; score: number; missing: Array<{ label: string; rexPrompt: string | null; href: string | null }> }
  | { type: "preview"; page: string | null };

export interface RexReply {
  text: string;
  cards: RexCard[];
  /** The newest draft when Rex changed the store this turn (for the live preview). */
  draft: StoreEditorSnapshot | null;
  versions: RexVersionSummary[] | null;
  /** A tool stopped because the AI allowance and credits are used up (the chat offers "Buy credits"). */
  creditsNeeded?: boolean;
}

/** Session storage key the video card uses to hand a prepared reel to /home/video. */
export const REX_REEL_HANDOFF_KEY = "shopinbos:rex-reel";

/**
 * A one-line memory of a card for the conversation history, so Rex can refer back to what he made (e.g.
 * "put that picture on my banner") on the next turn.
 */
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
    case "brand":
      return `[${card.kind === "packaging" ? "Designed packaging" : card.kind === "print" ? "Set up labels" : card.kind === "book" ? "Wrote the style book" : `Made a ${card.kind}`}: ${card.title}${card.image ? ` ${card.image}` : ""}]`;
    case "marketing":
      return `[Created ${card.kind} "${card.title}"]`;
    case "health":
      return `[Store health ${card.score}/100]`;
    case "preview":
      return "[Opened the preview]";
  }
}
