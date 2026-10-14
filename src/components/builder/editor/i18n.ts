"use client";

import { useCallback } from "react";
import { useT } from "@/components/i18n/I18nProvider";

// The builder's words: section-schema.ts and editor-logic.ts stay pure English data (tests load them without a
// bundler), so labels are translated where they are shown. tx("Heading") looks up "ed.Heading" in the builder
// catalog and falls back to the English text; t() is for the sentences with {placeholders}.
export function useEditorT() {
  const t = useT("builder", "common");
  const tx = useCallback((text: string | null | undefined): string => (text ? t.dynamic(`ed.${text}`, text) : ""), [t]);
  return { t, tx };
}
