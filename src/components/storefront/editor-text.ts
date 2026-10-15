// The builder's words for hints drawn on the canvas (empty-block tips, sample labels, "edit me" notes). Storefront
// code has no builder catalog, so the builder passes a translator in: English text with {placeholders} (and ICU
// plurals) goes in, the seller's language comes out (it looks up "ed.<English>" in the builder catalog). The live
// store and theme previews never receive one; there, and whenever it is missing, the English is shown as written.

// Relative, with the extension, so Node (tests) can load it without a bundler.
import { formatMessage } from "../../../shared/i18n/index.ts";

export type EditorText = (english: string, vars?: Record<string, string | number>) => string;

/** Without the builder's words: the English itself, placeholders (and plurals) filled. */
export const englishText: EditorText = (english, vars) => formatMessage(english, vars, "en");
