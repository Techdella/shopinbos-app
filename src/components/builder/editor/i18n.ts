"use client";

import { useCallback } from "react";
import { useT } from "@/components/i18n/I18nProvider";
import type { EditorText } from "@/components/storefront/editor-text";

// The builder's words: section-schema.ts and editor-logic.ts stay pure English data (tests load them without a
// bundler), so labels are translated where they are shown. tx("Heading") looks up "ed.Heading" in the builder
// catalog and falls back to the English text; t() is for the sentences with {placeholders}.
// editorText is the same lookup with {placeholders} filled, for a storefront drawn in editor mode outside the builder
// (Rex's preview, the store card): its canvas hints in the seller's language. Never passed on the live store.
export function useEditorT() {
  const t = useT("builder", "common");
  const tx = useCallback((text: string | null | undefined): string => (text ? t.dynamic(`ed.${text}`, text) : ""), [t]);
  const editorText = useCallback<EditorText>((english, vars) => t.dynamic(`ed.${english}`, english, vars), [t]);
  return { t, tx, editorText };
}
