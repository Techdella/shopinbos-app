"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cx, Mascot, Spinner } from "@/components/app-ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import { StoreLaunchBillingModal } from "@/components/billing/StoreLaunchBillingModal";
import { ThemeLibrary, type ThemeSwitchedResult } from "@/components/builder/ThemeLibrary";
import { TemplateStorefrontSurface, type SurfaceStore } from "@/components/storefront/TemplateStorefrontSurface";
import {
  createSectionFromLibrary,
  createSnapshotFromTemplate,
  getTemplateManifest,
  isBoutiqueTheme,
  type StoreEditorSnapshot,
  type TemplatePageSeed,
  type TemplatePageType,
  type TemplateSectionNode,
  type ThemeTokenSet,
} from "@/lib/store-templates";
import { AppsPanel } from "./AppsPanel";
import { Canvas, type CanvasToolbarAction, type Device } from "./Canvas";
import {
  buildPageList,
  canDuplicateSection,
  canMoveSection,
  duplicateSection,
  findPageEntry,
  insertLabel,
  insertSection,
  moveSection,
  moveSectionTo,
  newBoutiqueSection,
  removeSection,
  sectionGroup,
  setAppEnabled,
  setSectionCopy,
  toggleSectionHidden,
  updatePageSections,
  updateSection,
  type EditorApp,
  type PageEntry,
  type RendererKind,
  type SectionBlockRow,
  type SectionGroup,
} from "./editor-logic";
import { InsertPanel } from "./InsertPanel";
import { Inspector, type SectionAction } from "./Inspector";
import { PagePicker } from "./PagePicker";
import { RexPanel } from "./RexPanel";
import { sectionSchema } from "./section-schema";
import { SectionsPanel } from "./SectionsPanel";
import { ThemeSettingsPanel, type ThemeView } from "./ThemeSettingsPanel";
import { TopBar } from "./TopBar";
import { IconButton, useMediaQuery } from "./ui";
import { storefrontHost, useBuilder } from "./useBuilder";

type Panel = "sections" | "insert" | "theme" | "apps" | "rex";

const RAIL: Array<{ id: Exclude<Panel, "rex">; icon: IconName; label: string }> = [
  { id: "sections", icon: "list", label: "Sections" },
  { id: "insert", icon: "plus", label: "Insert" },
  { id: "theme", icon: "settings", label: "Theme settings" },
  { id: "apps", icon: "grid", label: "Apps" },
];

const POLICY_PAGES: Array<[string, string, string]> = [
  ["privacy-policy", "Privacy policy", "How customer data is collected, used and protected."],
  ["terms-and-conditions", "Terms and conditions", "The terms customers accept when shopping from this store."],
  ["refund-policy", "Refund policy", "Refund eligibility, timelines and process."],
  ["shipping-policy", "Delivery policy", "Delivery locations, timelines and fees."],
  ["return-policy", "Return policy", "Return eligibility, condition and support steps."],
];

function newId(kind: string) {
  return `${kind}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

function normalizePage(page: string) {
  return page === "shop" || page === "categories" ? "products" : page;
}

function isTyping(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
}

export function Builder({ initialRexOpen = false }: { initialRexOpen?: boolean }) {
  const router = useRouter();
  const b = useBuilder();
  const { draft, commit } = b;

  const wide = useMediaQuery("(min-width: 1280px)");
  const tabletUp = useMediaQuery("(min-width: 768px)");
  const phone = !tabletUp;

  const [view, setView] = useState<"editor" | "themes">("editor");
  const [preview, setPreview] = useState<{ id: string; name: string; snapshot: StoreEditorSnapshot } | null>(null);
  const [panel, setPanel] = useState<Panel | null>(initialRexOpen ? "rex" : "sections");
  const [themeView, setThemeView] = useState<ThemeView | null>(null);
  const [insertTab, setInsertTab] = useState<"section" | "element">("section");
  const [insertTarget, setInsertTarget] = useState<{ group: SectionGroup; beforeId: string | null }>({ group: "template", beforeId: null });
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [entryId, setEntryId] = useState("home");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusField, setFocusField] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<"settings" | "style">("settings");
  const [device, setDevice] = useState<Device>("desktop");
  const [scrollToken, setScrollToken] = useState(0);
  const [sheet, setSheet] = useState<"section" | "sections" | null>(null);
  const [phoneNote, setPhoneNote] = useState(true);
  const insertSearchRef = useRef<HTMLInputElement>(null);

  const snapshot = preview?.snapshot ?? draft;
  const renderer: RendererKind = snapshot && isBoutiqueTheme(snapshot.templateId) ? "boutique" : "classic";
  const themeId = snapshot?.templateId ?? "";

  const pageEntries = useMemo(() => buildPageList({
    pages: (draft?.pages ?? []).map((page) => ({ pageType: page.pageType, title: page.title })),
    products: b.store.products,
    collections: b.store.shopper.collections,
  }), [draft?.pages, b.store.products, b.store.shopper.collections]);
  const entry: PageEntry | null = findPageEntry(pageEntries, entryId);
  const pageType = entry?.pageType ?? (draft?.pages.some((page) => page.pageType === entryId) ? entryId : draft?.pages[0]?.pageType ?? "home");
  const page: TemplatePageSeed | null = draft?.pages.find((candidate) => candidate.pageType === pageType) ?? null;
  const sections = page?.sections ?? [];
  const selected = sections.find((section) => section.id === selectedId) ?? null;
  const currentLabel = entry?.label ?? page?.title ?? "Home page";

  // Wide screens keep the settings column open; narrower ones open it as a slide-over when a section is picked.
  useEffect(() => {
    setInspectorOpen(wide);
  }, [wide]);

  // A theme switch or Rex can remove the selected section or page; fall back quietly.
  useEffect(() => {
    if (selectedId && !selected) setSelectedId(null);
  }, [selected, selectedId]);
  useEffect(() => {
    if (draft && !draft.pages.some((candidate) => candidate.pageType === pageType)) setEntryId(draft.pages[0]?.pageType ?? "home");
  }, [draft, pageType]);

  // ── Edits ────────────────────────────────────────────────────────────────

  const editSections = useCallback((updater: (list: TemplateSectionNode[]) => TemplateSectionNode[], key?: string) => {
    commit((current) => updatePageSections(current, pageType, updater), key);
  }, [commit, pageType]);

  const editSection = useCallback((id: string, updater: (section: TemplateSectionNode) => TemplateSectionNode, key?: string) => {
    editSections((list) => updateSection(list, id, updater), key);
  }, [editSections]);

  const select = useCallback((id: string | null, from: "canvas" | "tree" = "canvas") => {
    setSelectedId(id);
    if (id) {
      setInspectorTab("settings");
      if (from === "tree") setScrollToken((token) => token + 1);
      if (!wide) setInspectorOpen(true);
      if (phone) setSheet("section");
    }
  }, [phone, wide]);

  const sectionAction = useCallback((id: string, action: SectionAction) => {
    const section = sections.find((entry) => entry.id === id);
    if (!section) return;
    if (action === "up" || action === "down") editSections((list) => moveSection(list, id, action));
    if (action === "hide") editSections((list) => toggleSectionHidden(list, id));
    if (action === "duplicate") {
      const copyId = newId(section.kind);
      editSections((list) => duplicateSection(list, id, copyId));
      setSelectedId(copyId);
    }
    if (action === "remove") {
      editSections((list) => removeSection(list, id));
      setSelectedId(null);
      setSheet(null);
      b.showToast(`${section.name} removed`, "ok", { label: "Undo", run: b.undo });
    }
  }, [b, editSections, sections]);

  const openInsert = useCallback((group: SectionGroup, beforeId: string | null) => {
    setInsertTarget({ group, beforeId });
    setInsertTab("section");
    setPanel("insert");
    setTimeout(() => insertSearchRef.current?.focus(), 30);
  }, []);

  const insert = useCallback((kind: string) => {
    const id = newId(kind);
    const section = renderer === "boutique" ? newBoutiqueSection(kind, id) : { ...createSectionFromLibrary(kind), id };
    if (renderer !== "boutique") section.name = section.name || insertLabel(kind);
    let beforeId = insertTarget.beforeId;
    if (!beforeId && insertTarget.group === "template" && selected && sectionGroup(selected.kind) === "template") {
      const index = sections.findIndex((entry) => entry.id === selected.id);
      beforeId = sections[index + 1]?.id ?? null;
    }
    editSections((list) => insertSection(list, section, beforeId));
    setInsertTarget({ group: "template", beforeId: null });
    select(id, "tree");
    b.showToast(`${section.name} added`);
  }, [b, editSections, insertTarget, renderer, sections, select, selected]);

  const addBlock = useCallback((sectionId: string, blockId: string) => {
    const section = sections.find((entry) => entry.id === sectionId);
    if (!section) return;
    select(sectionId, "tree");
    if (blockId === "image") { setFocusField("media"); return; }
    if (blockId === "product") { setFocusField("items"); return; }
    if (blockId === "question" || blockId === "faq") {
      editSection(sectionId, (current) => ({ ...current, items: [...(current.items ?? []), { question: "New question", answer: "" }] }));
      setFocusField("items");
      return;
    }
    if (blockId === "cta" || blockId === "whatsapp-cta") {
      const key = blockId === "whatsapp-cta" && section.kind === "footer"
        ? "whatsappLabel"
        : section.kind === "hero-split" ? "primaryCta" : section.kind === "newsletter" || section.kind === "contact-form" ? "buttonLabel" : "cta";
      editSection(sectionId, (current) => setSectionCopy(current, key, blockId === "whatsapp-cta" ? "Chat on WhatsApp" : "Shop now"));
      setFocusField(key);
      return;
    }
    const item =
      blockId === "text-point" ? { title: "New point", body: "A helpful detail for shoppers." } :
      blockId === "image-tile" ? { title: "New tile", subtitle: "Describe this image or collection.", color: "#0FA493" } :
      blockId === "product-card" ? { title: "New product", subtitle: "Short description", priceLabel: "", color: "#0FA493", mappedStoreProductId: null } :
      blockId === "review" ? { quote: "", person: "" } :
      blockId === "filter" ? { label: "New filter", value: "All" } :
      blockId === "option" ? { label: "New option", values: ["Choice one", "Choice two"] } :
      null;
    if (!item) return;
    editSection(sectionId, (current) => ({ ...current, items: [...(current.items ?? []), item] }));
    setFocusField(`item-${(section.items ?? []).length}`);
  }, [editSection, sections, select]);

  const addableFor = useCallback((section: TemplateSectionNode) => sectionSchema(section.kind, renderer, themeId).addable, [renderer, themeId]);

  const uploadImage = useCallback(async (file: File) => {
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("folder", "store-banners");
      const response = await fetch("/api/upload", { method: "POST", body });
      const json = await response.json().catch(() => null) as { data?: { publicUrl?: string }; error?: { message?: string } } | null;
      if (!response.ok || !json?.data?.publicUrl) throw new Error(json?.error?.message ?? "That upload didn't work. Try a smaller image.");
      return json.data.publicUrl;
    } catch (error) {
      b.showToast(error instanceof Error ? error.message : "That upload didn't work.", "error");
      return null;
    }
  }, [b]);

  const updateStoreLogo = useCallback(async (url: string) => {
    b.setStore((current) => ({ ...current, logoUrl: url }));
    try {
      const response = await fetch("/api/app/store", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logoUrl: url }) });
      if (!response.ok) throw new Error();
      b.showToast("Logo updated");
    } catch {
      b.showToast("The logo shows here but couldn't be saved. Try again.", "error");
    }
  }, [b]);

  const setTheme = useCallback((key: keyof ThemeTokenSet, value: string) => {
    commit((current) => ({ ...current, themeTokens: { ...current.themeTokens, [key]: value } }), `theme:${key}`);
  }, [commit]);

  const setHeaderCopyEverywhere = useCallback((key: string, value: string) => {
    commit((current) => ({
      ...current,
      pages: current.pages.map((entry) => ({ ...entry, sections: entry.sections.map((section) => (section.kind === "header" ? setSectionCopy(section, key, value) : section)) })),
    }), `header:${key}`);
  }, [commit]);

  const homeSections = draft?.pages.find((entry) => entry.pageType === "home")?.sections ?? null;
  const toggleApp = useCallback((app: EditorApp, on: boolean) => {
    commit((current) => updatePageSections(current, "home", (list) => setAppEnabled(list, app, on, newId(app.kind))));
    b.showToast(on ? `${app.label} added to your home page` : `${app.label} hidden`);
  }, [b, commit]);

  const addPage = useCallback((title: string) => {
    if (!draft) return;
    const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "page";
    let slug = base;
    for (let n = 2; draft.pages.some((entry) => entry.pageType === slug || entry.slug === slug); n += 1) slug = `${base}-${n}`;
    const home = draft.pages.find((entry) => entry.pageType === "home") ?? draft.pages[0];
    const chrome = (home?.sections ?? []).filter((section) => sectionGroup(section.kind) !== "template");
    const body: TemplateSectionNode = renderer === "boutique"
      ? { ...newBoutiqueSection("text", newId("text")), name: title, blocks: [{ id: `${slug}-copy`, type: "copy", content: { title, body: "" } }] }
      : { ...createSectionFromLibrary("text-columns"), name: title };
    const sectionsForPage = [...chrome.filter((section) => sectionGroup(section.kind) === "header"), body, ...chrome.filter((section) => sectionGroup(section.kind) === "footer")];
    commit((current) => ({
      ...current,
      pages: [...current.pages, { id: `custom-${slug}`, pageType: slug as TemplatePageType, title, slug, sections: sectionsForPage, seo: { metaTitle: `${title} | ${b.store.name}`, metaDescription: "" } }],
    }));
    setEntryId(slug);
    setSelectedId(body.id);
    b.showToast(`${title} page added`);
  }, [b, commit, draft, renderer]);

  const missingPolicies = draft ? POLICY_PAGES.filter(([slug]) => !draft.pages.some((entry) => entry.pageType === slug)) : [];
  const addPolicyPages = useCallback(() => {
    commit((current) => {
      const home = current.pages.find((entry) => entry.pageType === "home");
      const header = (home?.sections ?? []).filter((section) => sectionGroup(section.kind) === "header");
      const footer = (home?.sections ?? []).filter((section) => sectionGroup(section.kind) === "footer");
      const existing = new Set(current.pages.map((entry) => entry.pageType as string));
      const additions = POLICY_PAGES.filter(([slug]) => !existing.has(slug)).map(([slug, title, body]) => ({
        id: `legal-${slug}`,
        pageType: slug as TemplatePageType,
        title,
        slug,
        sections: [...header, {
          id: `${slug}-content`,
          kind: "text-columns",
          name: title,
          visible: true,
          blocks: [{ id: `${slug}-copy`, type: "copy", content: { title, body } }],
          items: [{ title: "Your policy", body: "Write your own terms here before you publish." }],
        }, ...footer],
        seo: { metaTitle: `${title} | ${b.store.name}`, metaDescription: body },
      }));
      return { ...current, pages: [...current.pages, ...additions] };
    });
    b.showToast("Policy pages added. Write your own terms in each one.");
  }, [b, commit]);

  // ── Leaving, keyboard ───────────────────────────────────────────────────

  const leave = useCallback(async (destination: string) => {
    if (b.dirty) {
      const ok = await b.save({ quiet: true });
      if (!ok) return;
    }
    router.push(destination);
  }, [b, router]);

  useEffect(() => {
    const handler = (event: Event) => { void leave(String((event as CustomEvent).detail ?? "/home/store")); };
    window.addEventListener("editor:requestLeave", handler);
    return () => window.removeEventListener("editor:requestLeave", handler);
  }, [leave]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && key === "s") {
        event.preventDefault();
        if (b.dirty) void b.save();
        return;
      }
      if (view !== "editor" || isTyping(event.target)) return;
      if (mod && key === "z") {
        event.preventDefault();
        if (event.shiftKey) b.redo(); else b.undo();
      } else if (mod && key === "y") {
        event.preventDefault();
        b.redo();
      } else if (mod && key === "f" && !phone) {
        event.preventDefault();
        openInsert(insertTarget.group, insertTarget.beforeId);
      } else if (event.key === "Escape" && selectedId) {
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [b, insertTarget, openInsert, phone, selectedId, view]);

  // ── Themes ──────────────────────────────────────────────────────────────

  const openThemes = useCallback(async () => {
    if (b.dirty) await b.save({ quiet: true });
    setPreview(null);
    setView("themes");
  }, [b]);

  const previewTheme = useCallback((id: string) => {
    const manifest = getTemplateManifest(id);
    if (!manifest) return;
    setPreview({ id, name: manifest.name, snapshot: createSnapshotFromTemplate(manifest) });
    setSelectedId(null);
    setEntryId("home");
    setView("editor");
  }, []);

  const onSwitched = useCallback((result: ThemeSwitchedResult) => {
    const next = result.draft as StoreEditorSnapshot | null;
    setPreview(null);
    setSelectedId(null);
    setEntryId("home");
    if (next && Array.isArray(next.pages)) b.resetDraft(next);
    else void b.reload();
    b.showToast(result.draftOnly ? `${result.templateName} is ready. Publish when you're happy.` : `Your store now uses ${result.templateName}`);
  }, [b]);

  // ── Canvas data ─────────────────────────────────────────────────────────

  // Previewing a product shows that product on the product page; a collection shows only its products.
  const canvasStore: SurfaceStore = useMemo(() => {
    const base = b.surfaceStore;
    if (entry?.productId) {
      const chosen = base.storeProducts.find((product) => product.id === entry.productId);
      return chosen ? { ...base, storeProducts: [chosen, ...base.storeProducts.filter((product) => product.id !== chosen.id)] } : base;
    }
    if (entry?.collectionId) {
      const collection = b.store.shopper.collections.find((candidate) => candidate.id === entry.collectionId);
      return collection ? { ...base, storeProducts: base.storeProducts.filter((product) => collection.productIds.includes(product.id)) } : base;
    }
    return base;
  }, [b.store.shopper.collections, b.surfaceStore, entry?.collectionId, entry?.productId]);

  const editing = !preview;
  const toolbar: CanvasToolbarAction[] = selected ? [
    { id: "up", icon: "arrowUp", label: "Move up", disabled: !canMoveSection(sections, selected.id, "up"), onClick: () => sectionAction(selected.id, "up") },
    { id: "down", icon: "arrowDown", label: "Move down", disabled: !canMoveSection(sections, selected.id, "down"), onClick: () => sectionAction(selected.id, "down") },
    { id: "duplicate", icon: "copy", label: "Duplicate", disabled: !canDuplicateSection(selected), onClick: () => sectionAction(selected.id, "duplicate") },
    { id: "hide", icon: "eye", label: selected.visible === false ? "Show" : "Hide", onClick: () => sectionAction(selected.id, "hide") },
    { id: "remove", icon: "trash", label: "Remove", danger: true, onClick: () => sectionAction(selected.id, "remove") },
  ] : [];

  const surface = snapshot ? (
    <TemplateStorefrontSurface
      store={canvasStore}
      snapshot={snapshot}
      storeBasePath={`/s/${b.store.slug}`}
      mode="editor"
      device={device === "mobile" || phone ? "mobile" : "desktop"}
      selectedPage={pageType}
      selectedSectionId={editing ? selectedId : null}
      onSelectPage={(next) => { setEntryId(normalizePage(next)); setSelectedId(null); }}
      onSelectSection={editing ? (id) => (id ? select(id) : setSelectedId(null)) : () => undefined}
      onInsertSectionBefore={editing ? (id) => openInsert("template", id) : undefined}
      onChangeSectionStyle={editing ? (id) => { select(id); setFocusField("layout"); } : undefined}
      onDuplicateSection={editing ? (id) => sectionAction(id, "duplicate") : undefined}
      onMoveSection={editing ? (id, direction) => sectionAction(id, direction) : undefined}
      onToggleSectionVisibility={editing ? (id) => sectionAction(id, "hide") : undefined}
      onDeleteSection={editing ? (id) => sectionAction(id, "remove") : undefined}
      onUpdateSectionCopy={editing ? (id, key, value) => editSection(id, (section) => setSectionCopy(section, key, value), `${id}:${key}`) : undefined}
      onUploadImage={editing ? uploadImage : undefined}
      onUpdateStoreLogo={editing ? (url) => void updateStoreLogo(url) : undefined}
      onUpdateSectionItem={editing ? (id, index, changes) => editSection(id, (section) => ({ ...section, items: (section.items ?? []).map((item, i) => (i === index ? { ...item, ...changes } : item)) })) : undefined}
      onUpdateImageBlock={editing ? (id, blockId, url) => editSection(id, (section) => ({ ...section, blocks: section.blocks.map((block) => (block.id === blockId ? { ...block, content: { ...block.content, originalSrc: url, resolvedSrc: url } } : block)) })) : undefined}
      cartCount={0}
    />
  ) : null;

  // ── Render ──────────────────────────────────────────────────────────────

  if (b.loading) {
    return (
      <div className="fixed inset-0 z-[500] grid place-items-center bg-app-canvas font-app text-app-ink-soft">
        <div className="flex items-center gap-3 text-[14px] font-medium"><Spinner /> Opening the builder…</div>
      </div>
    );
  }

  if (b.loadError) {
    return (
      <div className="fixed inset-0 z-[500] grid place-items-center bg-app-canvas p-4 font-app">
        <div className="w-full max-w-[420px] rounded-[22px] border border-app-line bg-white p-6 text-center">
          <h1 className="text-[20px] font-extrabold text-app-ink">The builder didn&apos;t open</h1>
          <p className="mt-2 text-[14px] text-app-ink-soft">{b.loadError}</p>
          <div className="mt-5 flex justify-center gap-2">
            <a href="/home/store" className="inline-flex min-h-11 items-center rounded-full border border-app-line px-5 text-[14px] font-bold text-app-ink">Back</a>
            <button type="button" onClick={() => void b.reload()} className="inline-flex min-h-11 items-center rounded-full bg-app-ink px-5 text-[14px] font-bold text-white">Try again</button>
          </div>
        </div>
      </div>
    );
  }

  const pagePicker = (
    <PagePicker
      entries={pageEntries}
      currentId={entry?.id ?? pageType}
      currentLabel={currentLabel}
      onPick={(picked) => { setEntryId(picked.id); setSelectedId(null); setPreview(null); }}
      onAddPage={addPage}
      onAddPolicyPages={missingPolicies.length ? addPolicyPages : null}
    />
  );

  const inspector = draft && editing ? (
    <Inspector
      section={selected}
      page={page}
      renderer={renderer}
      themeId={themeId}
      storeName={b.store.name}
      storeHost={storefrontHost(b.store.storefrontUrl)}
      products={b.store.products}
      tab={phone ? "settings" : inspectorTab}
      onTab={setInspectorTab}
      focusField={focusField}
      onFocusHandled={() => setFocusField(null)}
      onChange={(updater, key) => selected && editSection(selected.id, updater, key)}
      onChangePage={(updater, key) => commit((current) => ({ ...current, pages: current.pages.map((entry) => (entry.pageType === pageType ? updater(entry) : entry)) }), key)}
      onAction={(action) => selected && sectionAction(selected.id, action)}
      canMove={{
        up: selected ? canMoveSection(sections, selected.id, "up") : false,
        down: selected ? canMoveSection(sections, selected.id, "down") : false,
        duplicate: selected ? canDuplicateSection(selected) : false,
      }}
      onUpload={uploadImage}
      onOpenThemeSettings={() => { setPanel("theme"); setThemeView(null); setSheet(null); }}
      onAddBlock={(blockId) => selected && addBlock(selected.id, blockId)}
      onClose={wide ? undefined : () => { if (phone) setSheet(null); else setInspectorOpen(false); }}
      compact={phone}
    />
  ) : null;

  const sectionsPanel = (
    <SectionsPanel
      pageTitle={currentLabel}
      sections={sections}
      selectedId={selectedId}
      onSelect={(id) => select(id, "tree")}
      onSelectBlock={(id, block: SectionBlockRow) => { select(id, "tree"); setFocusField(block.field ?? (block.itemIndex !== undefined ? "items" : null)); }}
      onToggleHidden={(id) => sectionAction(id, "hide")}
      onMove={(id, direction) => sectionAction(id, direction)}
      onDrop={(id, targetId, place) => editSections((list) => moveSectionTo(list, id, targetId, place))}
      onAddSection={(group) => { setSheet(null); openInsert(group, null); }}
      onAddBlock={(id) => {
        const addable = sections.find((entry) => entry.id === id);
        const options = addable ? addableFor(addable) : [];
        if (options.length === 1) addBlock(id, options[0]!.id);
        else { select(id, "tree"); setInsertTab("element"); setPanel("insert"); }
      }}
      canAddBlock={(section) => addableFor(section).length > 0}
      canAddToHeader={!sections.some((section) => section.kind === "header") || !sections.some((section) => section.kind === "announcement-bar")}
    />
  );

  const leftPanel = !draft || !editing ? null : panel === "sections" ? sectionsPanel
    : panel === "insert" ? (
      <InsertPanel
        ref={insertSearchRef}
        renderer={renderer}
        target={insertTarget.group}
        existingKinds={sections.map((section) => section.kind)}
        placeLabel={insertTarget.beforeId
          ? `Adds above ${sections.find((section) => section.id === insertTarget.beforeId)?.name ?? "the chosen section"}`
          : insertTarget.group === "header" ? "Adds to the header" : selected && sectionGroup(selected.kind) === "template" ? `Adds below ${selected.name}` : `Adds to the end of ${currentLabel}`}
        onInsert={insert}
        selectedName={selected?.name ?? null}
        elements={selected ? addableFor(selected) : []}
        onAddElement={(id) => selected && addBlock(selected.id, id)}
        onClose={() => setPanel("sections")}
        tab={insertTab}
        onTab={setInsertTab}
      />
    ) : panel === "theme" ? (
      <ThemeSettingsPanel draft={draft} renderer={renderer} shopper={b.store.shopper} view={themeView} onView={setThemeView} onTheme={setTheme} onHeaderCopy={setHeaderCopyEverywhere} onClose={() => setPanel("sections")} />
    ) : panel === "apps" ? (
      <AppsPanel renderer={renderer} homeSections={homeSections} onToggle={toggleApp} onClose={() => setPanel("sections")} />
    ) : panel === "rex" ? (
      <RexPanel
        storeName={b.store.name}
        pageType={pageType}
        selectedSectionId={selectedId}
        selectedName={selected?.name ?? null}
        applyOps={b.applyOps}
        onApplied={() => b.showToast("Rex's change is on the page", "ok", { label: "Undo", run: b.undo })}
        onClose={() => setPanel("sections")}
      />
    ) : null;

  const emptyState = (
    <div className="grid h-full place-items-center overflow-y-auto bg-[#ECEBF1] p-4">
      <div className="w-full max-w-[560px] rounded-[22px] border border-app-line bg-white p-6 text-center">
        <h1 className="text-[22px] font-extrabold text-app-ink">Let&apos;s build your store</h1>
        <p className="mt-2 text-[14px] text-app-ink-soft">Pick a theme, start from a blank page, or let Rex build a first version from your products.</p>
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <button type="button" onClick={() => void openThemes()} className="rounded-[16px] border border-app-line p-4 text-left hover:border-app-line-strong"><Icon name="palette" size={18} /><span className="mt-2 block text-[14px] font-bold text-app-ink">Pick a theme</span></button>
          <button type="button" onClick={() => void b.startBlank()} className="rounded-[16px] border border-app-line p-4 text-left hover:border-app-line-strong"><Icon name="grid" size={18} /><span className="mt-2 block text-[14px] font-bold text-app-ink">Start blank</span></button>
          <a href="/studio" className="rounded-[16px] bg-app-peach p-4 text-left"><Mascot name="rex" className="h-6 w-6" alt="" /><span className="mt-2 block text-[14px] font-bold text-app-ink">Build with Rex</span></a>
        </div>
      </div>
    </div>
  );

  const previewBar = preview ? (
    <div className="flex flex-wrap items-center gap-2 border-b border-app-line bg-app-peach px-4 py-2 text-[13.5px] text-app-ink">
      <span className="min-w-0 flex-1"><strong>Previewing {preview.name}.</strong> Your products show in it; nothing changes until you use it.</span>
      <button type="button" onClick={() => setView("themes")} className="min-h-9 rounded-full border border-app-line bg-white px-3 font-semibold">Back to themes</button>
      <button type="button" onClick={() => setPreview(null)} className="min-h-9 rounded-full bg-app-ink px-3 font-semibold text-white">Stop preview</button>
    </div>
  ) : null;

  const canvas = snapshot ? (
    <Canvas
      device={phone ? "mobile" : device}
      fit={phone}
      selectedId={editing ? selectedId : null}
      selectedName={selected?.name ?? null}
      overlay={renderer === "boutique" && editing && !phone}
      actions={toolbar}
      layoutVersion={snapshot}
      scrollToken={scrollToken}
      onBackgroundClick={() => setSelectedId(null)}
    >
      {surface}
    </Canvas>
  ) : emptyState;

  const toast = b.toast ? (
    <div role="status" className={cx("fixed bottom-6 left-1/2 z-[620] flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-3 rounded-[14px] px-4 py-3 text-[14px] font-medium text-white shadow-[0_14px_40px_rgba(22,20,31,.3)]", b.toast.tone === "error" ? "bg-app-danger" : "bg-app-ink", phone && sheet && "bottom-[calc(65vh+12px)]")}>
      <span className="min-w-0">{b.toast.message}</span>
      {b.toast.action?.href ? <a href={b.toast.action.href} target="_blank" rel="noopener noreferrer" className="shrink-0 font-bold underline">{b.toast.action.label}</a> : null}
      {b.toast.action?.run ? <button type="button" onClick={() => { b.toast?.action?.run?.(); b.dismissToast(); }} className="shrink-0 font-bold underline">{b.toast.action.label}</button> : null}
      <button type="button" aria-label="Dismiss" onClick={b.dismissToast} className="grid h-7 w-7 shrink-0 place-items-center rounded-full hover:bg-white/15"><Icon name="x" size={14} /></button>
    </div>
  ) : null;

  return (
    <div className="fixed inset-0 z-[500] flex flex-col bg-white font-app text-app-ink">
      <TopBar
        themeName={preview ? preview.name : draft?.templateName ?? "Your store"}
        status={b.status}
        view={view}
        onView={(next) => (next === "themes" ? void openThemes() : setView("editor"))}
        onBack={() => void leave("/home/store")}
        pagePicker={pagePicker}
        inspectorOpen={inspectorOpen}
        onToggleInspector={() => setInspectorOpen((open) => !open)}
        device={device}
        onDevice={setDevice}
        canUndo={b.canUndo && editing}
        onUndo={b.undo}
        canRedo={b.canRedo && editing}
        onRedo={b.redo}
        onPublish={() => void b.publish()}
        publishing={b.publishing}
        canPublish={Boolean(draft) && (b.status !== "live" || b.dirty)}
        onSave={() => void b.save()}
        saving={b.saving}
        dirty={b.dirty}
        phone={phone}
      />

      {view === "themes" ? (
        <div className="min-h-0 flex-1 overflow-y-auto bg-app-canvas px-4 py-6 sm:px-8 sm:py-8">
          <ThemeLibrary
            mode="builder"
            currentThemeId={draft?.templateId ?? null}
            onPreview={previewTheme}
            onCustomize={() => { setPreview(null); setView("editor"); }}
            onSwitched={onSwitched}
          />
        </div>
      ) : phone ? (
        <div className="relative flex min-h-0 flex-1 flex-col">
          {previewBar}
          {phoneNote ? (
            <div className="flex items-start gap-2 border-b border-app-line bg-app-mint px-3 py-2 text-[12.5px] leading-5 text-app-forest">
              <Icon name="monitor" size={15} className="mt-0.5 shrink-0" />
              <p className="min-w-0 flex-1">The full builder works best on a computer. Here you can preview pages, tap a section to edit its words and photos, hide or reorder sections, and publish.</p>
              <button type="button" aria-label="Dismiss" onClick={() => setPhoneNote(false)} className="grid h-7 w-7 shrink-0 place-items-center"><Icon name="x" size={14} /></button>
            </div>
          ) : null}
          <div className="min-h-0 flex-1">{canvas}</div>
          {draft && editing ? (
            <div className="flex shrink-0 items-center gap-2 border-t border-app-line bg-white p-2">
              <button type="button" onClick={() => setSheet(sheet === "sections" ? null : "sections")} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-app-line text-[14px] font-bold"><Icon name="list" size={16} /> Sections</button>
              <button type="button" disabled={!selected} onClick={() => setSheet("section")} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-app-ink text-[14px] font-bold text-white disabled:opacity-40"><Icon name="edit" size={16} /> {selected ? "Edit section" : "Tap a section"}</button>
            </div>
          ) : null}
          {sheet ? (
            <>
              <button type="button" aria-label="Close" onClick={() => setSheet(null)} className="fixed inset-0 z-[540] bg-black/25" />
              <div role="dialog" aria-modal="true" aria-label={sheet === "sections" ? "Sections" : selected?.name ?? "Section"} className="fixed inset-x-0 bottom-0 z-[550] flex h-[65vh] flex-col rounded-t-[22px] bg-white shadow-[0_-18px_50px_rgba(22,20,31,.2)]">
                <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-app-line-strong" aria-hidden />
                <div className="min-h-0 flex-1">
                  {sheet === "sections" ? (
                    <div className="relative h-full">
                      <IconButton icon="x" label="Close" onClick={() => setSheet(null)} className="absolute right-2 top-2 z-10" />
                      {sectionsPanel}
                    </div>
                  ) : inspector}
                </div>
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1">
          {draft && editing ? (
            <nav aria-label="Builder tools" className="flex w-[52px] shrink-0 flex-col items-center gap-1 border-r border-app-line bg-white py-2">
              {RAIL.map((item) => (
                <IconButton
                  key={item.id}
                  icon={item.icon}
                  label={item.label}
                  active={panel === item.id}
                  aria-pressed={panel === item.id}
                  onClick={() => {
                    if (item.id === "theme") setThemeView(null);
                    if (item.id === "insert") { setInsertTab("section"); setInsertTarget({ group: "template", beforeId: null }); }
                    setPanel(panel === item.id ? null : item.id);
                  }}
                />
              ))}
              <button
                type="button"
                onClick={() => setPanel(panel === "rex" ? null : "rex")}
                aria-pressed={panel === "rex"}
                aria-label="Ask Rex"
                title="Ask Rex"
                className={cx("mt-auto grid h-10 w-10 place-items-center rounded-[12px] bg-app-mint transition hover:brightness-95", panel === "rex" && "ring-2 ring-[#2F66F6]")}
              >
                <Mascot name="rex" className="h-7 w-7" alt="" />
              </button>
            </nav>
          ) : null}
          {leftPanel ? <aside aria-label="Builder panel" className="w-[264px] shrink-0 border-r border-app-line bg-white xl:w-[280px]">{leftPanel}</aside> : null}
          <main className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Page preview">
            {previewBar}
            <div className="min-h-0 flex-1">{canvas}</div>
          </main>
          {inspector && inspectorOpen ? (
            wide ? (
              <aside aria-label="Section settings" className="w-[320px] shrink-0 border-l border-app-line bg-white">{inspector}</aside>
            ) : (
              <aside aria-label="Section settings" className="absolute inset-y-0 right-0 z-30 w-[min(340px,90vw)] border-l border-app-line bg-white shadow-[-18px_0_50px_rgba(22,20,31,.14)]">{inspector}</aside>
            )
          ) : null}
        </div>
      )}

      {toast}
      <StoreLaunchBillingModal open={Boolean(b.launchPricing)} pricing={b.launchPricing} onClose={b.clearLaunchPricing} />
    </div>
  );
}
