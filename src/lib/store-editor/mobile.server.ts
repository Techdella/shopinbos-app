import "server-only";
import { newBoutiqueSection } from "@/components/builder/editor/editor-logic";
import { createSectionFromLibrary, isBoutiqueTheme, parseEditorState, type StoreEditorSnapshot, type TemplateSectionNode } from "@/lib/store-templates";
import { EDITOR_BLOCKS, draftVersion, type Renderer } from "@shared/store-editor";

// The phone's store editor (apps/mobile/src/app/store-editor.tsx) on the server: which kind of renderer the draft's
// theme uses, and the ready-made sections its "Add a section" sheet drops in (made exactly as the web builder makes
// them: newBoutiqueSection for the 2026 themes, the section library for the classic ones). The phone gives each a
// new id when it drops it in (shared/store-editor.ts withNewIds).

export function rendererOf(snapshot: Pick<StoreEditorSnapshot, "templateId"> | null | undefined): Renderer {
  return snapshot && isBoutiqueTheme(snapshot.templateId) ? "boutique" : "classic";
}

function made(kind: string, renderer: Renderer): TemplateSectionNode {
  const id = `${kind}-new`;
  return renderer === "boutique" ? newBoutiqueSection(kind, id) : { ...createSectionFromLibrary(kind), id };
}

/** Block id ("reviews") → its ready-made section for this renderer. Blocks the theme can't take are left out. */
export function editorCatalog(renderer: Renderer): Record<string, TemplateSectionNode> {
  const out: Record<string, TemplateSectionNode> = {};
  for (const block of EDITOR_BLOCKS) {
    const kind = block.kinds[renderer];
    if (!kind) continue;
    try {
      out[block.id] = made(kind, renderer);
    } catch {
      // A section the library can't make on this deployment: the sheet just doesn't offer it.
    }
  }
  return out;
}

/** The body of a new page ("Blank page"): a heading and words, as the web builder's Add page makes it. */
export function pageBodyTemplate(renderer: Renderer): TemplateSectionNode {
  return renderer === "boutique" ? newBoutiqueSection("text", "text-new") : { ...createSectionFromLibrary("text-columns"), id: "text-new" };
}

/**
 * The save stamp of the draft the store has saved ("" when it has none yet: then the editor shows the look's own
 * starting design, made fresh on every load, and there's nothing another device could have changed).
 */
export function storedDraftVersion(brandSettings: unknown): string {
  const settings = brandSettings && typeof brandSettings === "object" ? (brandSettings as Record<string, unknown>) : {};
  const editor = parseEditorState(settings.editor);
  return draftVersion(editor.draft ?? editor.published ?? null);
}
