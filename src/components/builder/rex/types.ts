import type { SurfaceStore } from "@/components/storefront/TemplateStorefrontSurface";
import type { StoreEditorSnapshot } from "@/lib/store-templates";
import type { StoreHealthFacts } from "@/lib/store-health";
import type { RexVersionSummary } from "@/lib/ai/rex/studio-versions";
import type { RexCard } from "@/lib/ai/rex/cards";

export interface RexStudioProps {
  firstName: string;
  /** The seller's profile photo, beside their messages (else their initial). */
  avatarUrl?: string | null;
  /** `?prompt=` from a link (e.g. "Rebrand my store" on Your store): prefilled in the composer. */
  initialPrompt: string;
  /** `?preview=1`: open with the store preview showing. */
  openPreview: boolean;
  fromOnboarding: boolean;
  store: SurfaceStore & { id: string; slug: string };
  /** "adaeze.mybos.store" or the custom domain, for the publish toast. */
  storeHost: string;
  storeUrl: string;
  initialDraft: StoreEditorSnapshot;
  /** False when the store has no saved draft yet (Rex offers to build it). */
  draftSaved: boolean;
  themeName: string;
  healthFacts: StoreHealthFacts;
  versions: RexVersionSummary[];
  live: boolean;
  hasUnpublishedChanges: boolean;
  aiReady: boolean;
  /** For "build my whole store": what onboarding remembered. */
  buildContext: {
    brief?: string;
    category?: string;
    businessDescription?: string;
    template?: { templateId: string; templateName: string } | null;
  };
}

export type ChatMessage =
  | { id: string; role: "seller"; text: string; images?: string[] }
  | {
      id: string;
      role: "rex";
      text: string;
      changes?: string[];
      version?: { id: string; n: number } | null;
      undoTo?: string | null;
      undone?: boolean;
      tone?: "error";
      /** A follow-up Rex offers (e.g. after a blocked publish). */
      offer?: string;
      /** Results of Rex's tools: pictures, logos, store changes, copy, campaigns. */
      cards?: RexCard[];
      /** Show a "Buy credits" button (the allowance and credits ran out). */
      buyCredits?: boolean;
    };

export interface StudioChange {
  reply: string;
  changes: string[];
  draft: StoreEditorSnapshot | null;
  version: { id: string; n: number } | null;
  undoTo: string | null;
  versions?: RexVersionSummary[];
}
