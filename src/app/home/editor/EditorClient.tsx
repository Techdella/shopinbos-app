"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StorefrontClient } from "@/app/s/[slug]/StorefrontClient";
import {
  createSectionFromLibrary,
  type StoreEditorSnapshot,
  type TemplatePageSeed,
  type TemplateSectionNode,
} from "@/lib/store-templates";
import { SectionPreviewPopover } from "@/components/builder/SectionPreview";
import { StoreLaunchBillingModal, type StoreLaunchPricing } from "@/components/billing/StoreLaunchBillingModal";

type EditorEnvelope = {
  store: {
    id: string;
    name: string;
    slug: string;
    currency: string;
    brandSettings: Record<string, unknown>;
    storeProducts: Array<{
      id: string;
      name: string;
      description?: string | null;
      images: string[];
      retailPrice: number;
      currency: string;
    }>;
  };
  template?: {
    templateId: string;
    templateName: string;
  } | null;
  draft?: StoreEditorSnapshot | null;
  published?: StoreEditorSnapshot | null;
};

function updateSection(
  snapshot: StoreEditorSnapshot,
  pageType: string,
  sectionId: string,
  updater: (section: TemplateSectionNode) => TemplateSectionNode,
) {
  return {
    ...snapshot,
    updatedAt: new Date().toISOString(),
    pages: snapshot.pages.map((page) =>
      page.pageType === pageType
        ? {
            ...page,
            sections: page.sections.map((section) => (section.id === sectionId ? updater(section) : section)),
          }
        : page,
    ),
  };
}

const tools = [
  { id: "pages", label: "Pages", glyph: "▦" },
  { id: "add", label: "Add", glyph: "＋" },
  { id: "theme", label: "Shop look", glyph: "⌬" },
  { id: "type", label: "Type", glyph: "Aa" },
  { id: "color", label: "Color", glyph: "◐" },
  { id: "nav", label: "Nav", glyph: "⛬" },
  { id: "cms", label: "CMS", glyph: "⏍" },
  { id: "seo", label: "SEO", glyph: "⚙" },
];

const TAB_NAMES = ["Content", "Design", "Layout", "Rex"];

function Tooltip({ children, tip }: { children: React.ReactNode; tip: string }) {
  return (
    <span style={{ position: "relative" }}>
      {children}
    </span>
  );
}

function ImageUploadButton({ onUpload }: { onUpload: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("folder", "brand");

      const response = await fetch("/api/upload", { method: "POST", body: formData });
      const json = (await response.json()) as { data?: { publicUrl: string } };
      if (json.data?.publicUrl) {
        onUpload(json.data.publicUrl);
      }
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  return (
    <label
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "4px 10px",
        borderRadius: 6,
        background: "var(--bg-tinted, #EFEAE0)",
        color: uploading ? "var(--ink-3, #6A7A7E)" : "var(--teal-deep, #1B7B6A)",
        cursor: uploading ? "default" : "pointer",
        fontFamily: "inherit",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {uploading ? "Uploading…" : "Upload"}
      <input
        type="file"
        accept="image/*"
        onChange={(event) => void handleFile(event)}
        style={{ display: "none" }}
        disabled={uploading}
      />
    </label>
  );
}

export function EditorClient() {
  const router = useRouter();
  const [envelope, setEnvelope] = useState<EditorEnvelope | null>(null);
  const [draft, setDraft] = useState<StoreEditorSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPage, setSelectedPage] = useState("home");
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null);
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [launchPricing, setLaunchPricing] = useState<StoreLaunchPricing | null>(null);
  const [rexPrompt, setRexPrompt] = useState("");
  const [rexBusy, setRexBusy] = useState(false);
  const [activeTool, setActiveTool] = useState("pages");
  const [activeTab, setActiveTab] = useState("Content");
  const [sectionLibraryOpen, setSectionLibraryOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/store/editor", { cache: "no-store" });
        const json = (await response.json()) as { data?: EditorEnvelope };
        if (!cancelled && json.data) {
          setEnvelope(json.data);
          setDraft(json.data.draft ?? null);
          setSelectedPage(json.data.draft?.pages[0]?.pageType ?? "home");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const currentPage: TemplatePageSeed | null = useMemo(() => {
    return draft?.pages.find((page) => page.pageType === selectedPage) ?? draft?.pages[0] ?? null;
  }, [draft, selectedPage]);

  const currentSection = useMemo(() => {
    return currentPage?.sections.find((section) => section.id === selectedSectionId) ?? currentPage?.sections[0] ?? null;
  }, [currentPage, selectedSectionId]);

  useEffect(() => {
    if (currentPage && !currentPage.sections.some((section) => section.id === selectedSectionId)) {
      setSelectedSectionId(currentPage.sections[0]?.id ?? null);
    }
  }, [currentPage, selectedSectionId]);

  async function saveDraft(nextSnapshot = draft) {
    if (!nextSnapshot) return;
    setSaving(true);
    try {
      const response = await fetch("/api/store/editor", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot: nextSnapshot }),
      });
      const json = (await response.json()) as { data?: { draft?: StoreEditorSnapshot | null } };
      if (json.data?.draft) {
        setDraft(json.data.draft);
      }
    } finally {
      setSaving(false);
    }
  }

  async function publishDraft() {
    setPublishing(true);
    try {
      const response = await fetch("/api/store/editor/publish", { method: "POST" });
      const json = (await response.json()) as { data?: EditorEnvelope; billing?: StoreLaunchPricing; error?: { message?: string } };
      if (response.status === 402 && json.billing) {
        setLaunchPricing(json.billing);
        return;
      }
      if (!response.ok) throw new Error(json.error?.message ?? "Publish failed.");
      if (json.data) {
        setEnvelope((prev) => (prev ? { ...prev, published: json.data?.published ?? prev.published } : prev));
      }
    } finally {
      setPublishing(false);
    }
  }

  async function askRex() {
    if (!rexPrompt.trim() || !draft || !envelope?.template?.templateId) return;
    setRexBusy(true);
    try {
      const aiResponse = await fetch("/api/ai/store-editor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: rexPrompt,
          pageType: selectedPage,
          sectionId: currentSection?.id,
          templateId: envelope.template.templateId,
        }),
      });
      const aiJson = (await aiResponse.json()) as { data?: { ops?: unknown[] } };

      if (!Array.isArray(aiJson.data?.ops)) return;

      const patchResponse = await fetch("/api/store/editor", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops: aiJson.data.ops }),
      });
      const patchJson = (await patchResponse.json()) as { data?: { draft?: StoreEditorSnapshot | null } };
      if (patchJson.data?.draft) {
        setDraft(patchJson.data.draft);
      }
      setRexPrompt("");
    } finally {
      setRexBusy(false);
    }
  }

  function commit(next: StoreEditorSnapshot) {
    setDraft(next);
  }

  function moveSection(targetIndex: number) {
    if (!draft || !currentPage || !draggedSectionId) return;
    const fromIndex = currentPage.sections.findIndex((section) => section.id === draggedSectionId);
    if (fromIndex < 0 || fromIndex === targetIndex) return;

    const sections = [...currentPage.sections];
    const [moved] = sections.splice(fromIndex, 1);
    if (!moved) return;
    sections.splice(targetIndex, 0, moved);

    commit({
      ...draft,
      updatedAt: new Date().toISOString(),
      pages: draft.pages.map((page) =>
        page.pageType === currentPage.pageType ? { ...page, sections } : page,
      ),
    });
    setDraggedSectionId(null);
  }

  function addSection(kind: string) {
    if (!draft || !currentPage) return;
    const nextSection = createSectionFromLibrary(kind);
    commit({
      ...draft,
      updatedAt: new Date().toISOString(),
      pages: draft.pages.map((page) =>
        page.pageType === currentPage.pageType
          ? { ...page, sections: [...page.sections, nextSection] }
          : page,
      ),
    });
    setSelectedSectionId(nextSection.id);
    setSectionLibraryOpen(false);
  }

  const hasTemplate = !!envelope?.template?.templateId;

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg, #F6F2E9)", color: "var(--ink-3, #6A7A7E)", fontFamily: "'Manrope', system-ui, sans-serif" }}>
        Loading editor…
      </div>
    );
  }

  if (!hasTemplate || !draft) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
          background: "var(--bg, #F6F2E9)",
          color: "var(--ink, #0B262C)",
          fontFamily: "'Manrope', system-ui, sans-serif",
          textAlign: "center",
          padding: 40,
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 24,
            background: "var(--teal-soft, #C7ECE3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 36,
          }}
        >
          🏪
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: "-0.03em" }}>
          No look chosen yet
        </h1>
        <p style={{ fontSize: 15, color: "var(--ink-3, #6A7A7E)", maxWidth: 440, lineHeight: 1.5, margin: 0 }}>
          Choose how your shop looks. You can change every part, page and colour after.
        </p>
        <button
          onClick={() => router.push("/builder/templates")}
          style={{
            padding: "14px 32px",
            borderRadius: 999,
            fontWeight: 700,
            fontSize: 14,
            background: "var(--ink, #0B262C)",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          See shop looks
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: "56px 1fr",
        minHeight: "100vh",
        background: "var(--bg, #F6F2E9)",
        color: "var(--ink, #0B262C)",
        fontFamily: "'Manrope', system-ui, sans-serif",
        fontFeatureSettings: '"ss01", "cv11"',
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <StoreLaunchBillingModal open={Boolean(launchPricing)} pricing={launchPricing} onClose={() => setLaunchPricing(null)} />
      {/* ────────────────────────────────────────────── TOP BAR ────────────────────────────────────────────── */}
      <header
        style={{
          background: "var(--bg-card, #FFFFFF)",
          borderBottom: "1px solid var(--line, #E3DDD0)",
          display: "flex",
          alignItems: "center",
          padding: "0 18px",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontWeight: 800,
            fontSize: 14,
            paddingRight: 16,
            borderRight: "1px solid var(--line, #E3DDD0)",
          }}
        >
          <span
            style={{
              width: 24,
              height: 24,
              background: "var(--ink, #0B262C)",
              color: "var(--bg, #F6F2E9)",
              fontFamily: "'Fraunces', Georgia, serif",
              fontStyle: "italic",
              borderRadius: 5,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
            }}
          >
            S
          </span>
          SHOPINBOS
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink-3, #6A7A7E)" }}>
          <span>{envelope?.store.name ?? "Your Store"}</span>
          <span>/</span>
          <strong style={{ color: "var(--ink, #0B262C)", fontWeight: 600 }}>Store editor</strong>
          {envelope?.template?.templateName ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 500,
                background: "var(--teal-soft, #C7ECE3)",
                color: "var(--teal-deep, #1B7B6A)",
                marginLeft: 4,
              }}
            >
              {envelope.template.templateName}
            </span>
          ) : null}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              display: "inline-flex",
              background: "var(--bg-tinted, #EFEAE0)",
              padding: 3,
              borderRadius: 999,
            }}
          >
            {(["desktop", "tablet", "mobile"] as const).map((value) => (
              <button
                key={value}
                onClick={() => setDevice(value)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  fontSize: 12,
                  color: device === value ? "var(--ink, #0B262C)" : "var(--ink-3, #6A7A7E)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: device === value ? "var(--bg-card, #FFFFFF)" : "transparent",
                  boxShadow: device === value ? "0 1px 2px rgba(11,38,44,0.06)" : "none",
                  fontWeight: device === value ? 600 : 400,
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {value === "desktop" ? "▭" : "▯"} {value.charAt(0).toUpperCase() + value.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={() => void saveDraft()}
            disabled={saving}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "8px 14px",
              borderRadius: 999,
              fontWeight: 600,
              fontSize: 12.5,
              background: "transparent",
              color: "var(--ink, #0B262C)",
              border: "1px solid var(--line, #E3DDD0)",
              cursor: "pointer",
              fontFamily: "inherit",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Saving…" : "Save draft"}
          </button>
          <button
            onClick={() => window.open(`/s/${envelope?.store.slug}`, "_blank")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "8px 14px",
              borderRadius: 999,
              fontWeight: 600,
              fontSize: 12.5,
              background: "transparent",
              color: "var(--ink, #0B262C)",
              border: "1px solid var(--line, #E3DDD0)",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Preview ↗
          </button>
          <button
            onClick={() => void publishDraft()}
            disabled={publishing}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "8px 14px",
              borderRadius: 999,
              fontWeight: 600,
              fontSize: 12.5,
              background: "var(--ink, #0B262C)",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              opacity: publishing ? 0.6 : 1,
            }}
          >
            {publishing ? "Publishing…" : "Publish"}
          </button>
        </div>
      </header>

      {/* ────────────────────────────────────────────── BODY ────────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "64px 280px 1fr 360px",
          overflow: "hidden",
        }}
      >
        {/* ════════════════════ TOOL RAIL ════════════════════ */}
        <aside
          style={{
            background: "var(--bg-card, #FFFFFF)",
            borderRight: "1px solid var(--line, #E3DDD0)",
            padding: "14px 8px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {tools.map((t) => {
            const isActive = activeTool === t.id;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setActiveTool(t.id);
                  if (t.id === "add") setSectionLibraryOpen(!sectionLibraryOpen);
                  if (t.id === "cms") router.push("/home/cms");
                }}
                style={{
                  width: "100%",
                  aspectRatio: "1",
                  borderRadius: 10,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  color: isActive ? "#fff" : "var(--ink-3, #6A7A7E)",
                  fontSize: 10,
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  background: isActive ? "var(--ink, #0B262C)" : "transparent",
                  border: "none",
                  cursor: "pointer",
                  transition: "background .15s, color .15s",
                }}
              >
                <span style={{ fontFamily: "'Manrope', system-ui, sans-serif", fontSize: 18, fontWeight: 700 }}>
                  {t.glyph}
                </span>
                {t.label}
              </button>
            );
          })}
        </aside>

        {/* ════════════════════ PAGES PANEL ════════════════════ */}
        <aside
          style={{
            background: "var(--bg-card, #FFFFFF)",
            borderRight: "1px solid var(--line, #E3DDD0)",
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
          }}
        >
          <div
            style={{
              padding: "18px 18px 12px",
              borderBottom: "1px solid var(--line, #E3DDD0)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Pages</h3>
            <button
              onClick={() => router.push("/home/pages/new")}
              style={{
                fontSize: 12,
                color: "var(--teal-deep, #1B7B6A)",
                fontWeight: 600,
                border: "none",
                background: "none",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              ＋ Add
            </button>
          </div>

          <div style={{ padding: "0 18px" }}>
            <div
              style={{
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--ink-3, #6A7A7E)",
                padding: "14px 0 8px",
              }}
            >
              Pages
            </div>

            {draft?.pages.map((page) => (
              <button
                key={page.id}
                onClick={() => {
                  startTransition(() => {
                    setSelectedPage(page.pageType);
                    setSelectedSectionId(page.sections[0]?.id ?? null);
                  });
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 10,
                  fontSize: 13,
                  color: selectedPage === page.pageType ? "var(--teal-deep, #1B7B6A)" : "var(--ink-2, #2A4148)",
                  textAlign: "left",
                  background: selectedPage === page.pageType ? "var(--teal-soft, #C7ECE3)" : "transparent",
                  fontWeight: selectedPage === page.pageType ? 600 : 400,
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    color: "var(--ink-4, #9AA6A9)",
                    fontSize: 11,
                  }}
                >
                  ⋮⋮
                </span>
                {page.title}
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: 10,
                    padding: "1px 7px",
                    borderRadius: 4,
                    background: selectedPage === page.pageType ? "var(--teal, #2EB39A)" : "var(--bg-tinted, #EFEAE0)",
                    color: selectedPage === page.pageType ? "#fff" : "var(--ink-3, #6A7A7E)",
                  }}
                >
                  {page.sections.length} sections
                </span>
              </button>
            ))}
          </div>

          {/* Sections on current page */}
          {currentPage ? (
            <div style={{ padding: "0 18px" }}>
              <div
                style={{
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--ink-3, #6A7A7E)",
                  padding: "14px 0 8px",
                }}
              >
                Sections on {currentPage.title}
              </div>
              {currentPage.sections.map((s) => (
                <button
                  key={s.id}
                  draggable
                  onDragStart={() => setDraggedSectionId(s.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    const idx = currentPage.sections.findIndex((sec) => sec.id === s.id);
                    moveSection(idx);
                  }}
                  onClick={() => setSelectedSectionId(s.id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 10px 6px 22px",
                    borderRadius: 10,
                    fontSize: 12.5,
                    color: selectedSectionId === s.id ? "var(--teal-deep, #1B7B6A)" : "var(--ink-2, #2A4148)",
                    textAlign: "left",
                    background: selectedSectionId === s.id ? "var(--teal-soft, #C7ECE3)" : "transparent",
                    fontWeight: selectedSectionId === s.id ? 600 : 400,
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {selectedSectionId === s.id ? "▾" : "▸"} {s.name}
                </button>
              ))}
            </div>
          ) : null}

          {/* Section Library */}
          {sectionLibraryOpen ? (
            <div style={{ padding: "12px 18px 0", borderTop: "1px solid var(--line, #E3DDD0)", marginTop: 12 }}>
              <div
                style={{
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--ink-3, #6A7A7E)",
                  padding: "8px 0",
                }}
              >
                Add section
              </div>
              {[
                { id: "hero-split", label: "Hero split", icon: "🖼" },
                { id: "featured-products", label: "Featured products", icon: "📦" },
                { id: "testimonials", label: "Testimonials", icon: "💬" },
                { id: "newsletter", label: "Newsletter", icon: "✉" },
                { id: "contact-form", label: "Contact form", icon: "📋" },
                { id: "faq", label: "FAQ", icon: "❓" },
                { id: "promo-banner", label: "Promo banner", icon: "🏷" },
                { id: "text-columns", label: "Text columns", icon: "📄" },
                { id: "story-split", label: "Story section", icon: "📖" },
              ].map((entry) => (
                <SectionPreviewPopover key={entry.id} section={entry} position="right">
                  <button
                    onClick={() => addSection(entry.id)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: 10,
                      fontSize: 12.5,
                      color: "var(--ink-2, #2A4148)",
                      textAlign: "left",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      transition: "background .1s",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-tinted, #EFEAE0)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <span style={{ fontSize: 16 }}>{entry.icon}</span>
                    {entry.label}
                  </button>
                </SectionPreviewPopover>
              ))}
            </div>
          ) : null}

          <div style={{ padding: 18 }} />
        </aside>

        {/* ════════════════════ CANVAS ════════════════════ */}
        <main
          style={{
            background: "var(--bg-tinted, #EFEAE0)",
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
            padding: "24px 28px 60px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 11,
              color: "var(--ink-3, #6A7A7E)",
              marginBottom: 14,
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "var(--teal, #2EB39A)",
              }}
            />
            <span
              style={{
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                fontSize: 10.5,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--teal-deep, #1B7B6A)",
              }}
            >
              Editing
            </span>
            <span>·</span>
            <span>{currentPage?.title ?? "Page"} · {currentSection?.name ?? "No section"}</span>
            <span style={{ marginLeft: "auto" }}>
              {device === "desktop" ? "1440" : device === "tablet" ? "768" : "375"} × auto · 100%
            </span>
          </div>

          <div
            style={{
              background: "var(--bg-card, #FFFFFF)",
              borderRadius: 14,
              boxShadow: "0 8px 24px -8px rgba(11,38,44,0.14), 0 2px 6px rgba(11,38,44,0.05)",
              maxWidth: device === "desktop" ? 1000 : device === "tablet" ? 768 : 375,
              width: "100%",
              margin: "0 auto",
              overflow: "hidden",
              border: "1px solid var(--line, #E3DDD0)",
              transition: "max-width .25s",
            }}
          >
            {envelope ? (
              <StorefrontClient
                store={{
                  ...envelope.store,
                  brandSettings: {
                    template: envelope.template ? { templateId: envelope.template.templateId } : undefined,
                  },
                }}
                storeBasePath={`/s/${envelope.store.slug}`}
                previewSnapshot={draft ?? undefined}
                previewMode
                device={device === "tablet" ? "mobile" : device}
                selectedPage={selectedPage}
                onSelectPage={setSelectedPage}
              />
            ) : null}
          </div>
        </main>

        {/* ════════════════════ PROPERTIES PANEL ════════════════════ */}
        <aside
          style={{
            background: "var(--bg-card, #FFFFFF)",
            borderLeft: "1px solid var(--line, #E3DDD0)",
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
          }}
        >
          {/* Tabs */}
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid var(--line, #E3DDD0)",
              padding: "0 4px",
            }}
          >
            {TAB_NAMES.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  padding: "14px 6px",
                  fontSize: 12.5,
                  fontWeight: activeTab === tab ? 700 : 500,
                  color: activeTab === tab ? "var(--ink, #0B262C)" : "var(--ink-3, #6A7A7E)",
                  background: "transparent",
                  border: "none",
                  borderBottom: activeTab === tab ? "2px solid var(--ink, #0B262C)" : "2px solid transparent",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "border .15s",
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ padding: 18, flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
            {activeTab === "Content" ? (
              currentSection ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--ink-3, #6A7A7E)", marginBottom: 8 }}>
                      Section name
                    </div>
                    <input
                      value={currentSection.name}
                      onChange={(event) => {
                        if (!draft) return;
                        commit(updateSection(draft, currentPage?.pageType ?? "home", currentSection.id, (section) => ({ ...section, name: event.target.value })));
                      }}
                      style={{
                        width: "100%",
                        padding: "10px 14px",
                        borderRadius: 14,
                        border: "1px solid var(--line, #E3DDD0)",
                        fontSize: 13,
                        fontFamily: "inherit",
                        outline: "none",
                        color: "var(--ink, #0B262C)",
                        background: "var(--bg, #F6F2E9)",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>

                  {currentSection.blocks.map((entry) => {
                    const isImageBlock = entry.type === "image";
                    return (
                      <div key={entry.id} style={{ borderRadius: 14, border: "1px solid var(--line, #E3DDD0)", padding: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--teal-deep, #1B7B6A)", marginBottom: 10 }}>
                          {entry.type} block
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {Object.entries(entry.content).map(([key, value]) => {
                            const isImageField = key === "src" || key === "imageUrl" || key === "image" || key === "backgroundImage";
                            return typeof value === "string" ? (
                              <label key={key} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--ink-3, #6A7A7E)" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span>{key}</span>
                                  {isImageField ? (
                                    <ImageUploadButton
                                      onUpload={(url) => {
                                        if (!draft || !currentPage) return;
                                        commit(updateSection(draft, currentPage.pageType, currentSection.id, (section) => ({
                                          ...section,
                                          blocks: section.blocks.map((block) =>
                                            block.id === entry.id
                                              ? { ...block, content: { ...block.content, [key]: url } }
                                              : block,
                                          ),
                                        })));
                                      }}
                                    />
                                  ) : null}
                                </div>
                                {isImageField && value ? (
                                  <div style={{ margin: "4px 0", borderRadius: 8, overflow: "hidden", maxHeight: 120 }}>
                                    <img src={value} alt="" style={{ width: "100%", height: "auto", display: "block", objectFit: "cover" }} />
                                  </div>
                                ) : null}
                                {value.length > 40 || value.includes("\n") ? (
                                  <textarea
                                    rows={4}
                                    value={value}
                                    onChange={(event) => {
                                      if (!draft || !currentPage) return;
                                      commit(updateSection(draft, currentPage.pageType, currentSection.id, (section) => ({
                                        ...section,
                                        blocks: section.blocks.map((block) =>
                                          block.id === entry.id
                                            ? { ...block, content: { ...block.content, [key]: event.target.value } }
                                            : block,
                                        ),
                                      })));
                                    }}
                                    style={{
                                      width: "100%",
                                      padding: "10px 14px",
                                      borderRadius: 14,
                                      border: "1px solid var(--line, #E3DDD0)",
                                      fontSize: 13,
                                      fontFamily: "inherit",
                                      outline: "none",
                                      color: "var(--ink, #0B262C)",
                                      background: "var(--bg, #F6F2E9)",
                                      resize: "vertical",
                                      boxSizing: "border-box",
                                    }}
                                  />
                                ) : (
                                  <input
                                    value={value}
                                    onChange={(event) => {
                                      if (!draft || !currentPage) return;
                                      commit(updateSection(draft, currentPage.pageType, currentSection.id, (section) => ({
                                        ...section,
                                        blocks: section.blocks.map((block) =>
                                          block.id === entry.id
                                            ? { ...block, content: { ...block.content, [key]: event.target.value } }
                                            : block,
                                        ),
                                      })));
                                    }}
                                    style={{
                                      width: "100%",
                                      padding: "10px 14px",
                                      borderRadius: 14,
                                      border: "1px solid var(--line, #E3DDD0)",
                                      fontSize: 13,
                                      fontFamily: "inherit",
                                      outline: "none",
                                      color: "var(--ink, #0B262C)",
                                      background: "var(--bg, #F6F2E9)",
                                      boxSizing: "border-box",
                                    }}
                                  />
                                )}
                              </label>
                            ) : null;
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {currentSection.items?.length ? (
                    currentSection.items.map((item, index) => {
                      const hasImageField = Object.keys(item).some((k) => k === "imageUrl" || k === "image" || k === "src");
                      return (
                        <div key={`${currentSection.id}-${index}`} style={{ borderRadius: 14, border: "1px solid var(--line, #E3DDD0)", padding: 14 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--teal-deep, #1B7B6A)", marginBottom: 10 }}>
                            Item {index + 1}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {Object.entries(item).map(([key, value]) => {
                              const isImageField = key === "imageUrl" || key === "image" || key === "src";
                              return typeof value === "string" ? (
                                <label key={key} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--ink-3, #6A7A7E)" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span>{key}</span>
                                    {isImageField ? (
                                      <ImageUploadButton
                                        onUpload={(url) => {
                                          if (!draft || !currentPage) return;
                                          commit(updateSection(draft, currentPage.pageType, currentSection.id, (section) => ({
                                            ...section,
                                            items: (section.items ?? []).map((entry, itemIndex) =>
                                              itemIndex === index ? { ...entry, [key]: url } : entry,
                                            ),
                                          })));
                                        }}
                                      />
                                    ) : null}
                                  </div>
                                  {isImageField && value ? (
                                    <div style={{ margin: "4px 0", borderRadius: 8, overflow: "hidden", maxHeight: 120 }}>
                                      <img src={value} alt="" style={{ width: "100%", height: "auto", display: "block", objectFit: "cover" }} />
                                    </div>
                                  ) : null}
                                  <input
                                    value={value}
                                    onChange={(event) => {
                                      if (!draft || !currentPage) return;
                                      commit(updateSection(draft, currentPage.pageType, currentSection.id, (section) => ({
                                        ...section,
                                        items: (section.items ?? []).map((entry, itemIndex) =>
                                          itemIndex === index ? { ...entry, [key]: event.target.value } : entry,
                                        ),
                                      })));
                                    }}
                                    style={{
                                      width: "100%",
                                      padding: "10px 14px",
                                      borderRadius: 14,
                                      border: "1px solid var(--line, #E3DDD0)",
                                      fontSize: 13,
                                      fontFamily: "inherit",
                                      outline: "none",
                                      color: "var(--ink, #0B262C)",
                                      background: "var(--bg, #F6F2E9)",
                                      boxSizing: "border-box",
                                    }}
                                  />
                                </label>
                              ) : null;
                            })}
                            {"mappedStoreProductId" in item ? (
                              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--ink-3, #6A7A7E)" }}>
                                Map to store product
                                <select
                                  value={typeof item.mappedStoreProductId === "string" ? item.mappedStoreProductId : ""}
                                  onChange={(event) => {
                                    if (!draft || !currentPage) return;
                                    commit(updateSection(draft, currentPage.pageType, currentSection.id, (section) => ({
                                      ...section,
                                      items: (section.items ?? []).map((entry, itemIndex) =>
                                        itemIndex === index ? { ...entry, mappedStoreProductId: event.target.value || null } : entry,
                                      ),
                                    })));
                                  }}
                                  style={{
                                    width: "100%",
                                    padding: "10px 14px",
                                    borderRadius: 14,
                                    border: "1px solid var(--line, #E3DDD0)",
                                    fontSize: 13,
                                    fontFamily: "inherit",
                                    outline: "none",
                                    color: "var(--ink, #0B262C)",
                                    background: "var(--bg, #F6F2E9)",
                                    boxSizing: "border-box",
                                  }}
                                >
                                  <option value="">Example only</option>
                                  {envelope?.store.storeProducts.map((product) => (
                                    <option key={product.id} value={product.id}>
                                      {product.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  ) : null}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "var(--ink-3, #6A7A7E)", textAlign: "center", padding: 24 }}>
                  Select a section on the canvas to edit its content.
                </div>
              )
            ) : activeTab === "Design" ? (
              <div style={{ fontSize: 13, color: "var(--ink-3, #6A7A7E)", textAlign: "center", padding: 24 }}>
                Color and typography settings coming soon.
              </div>
            ) : activeTab === "Layout" ? (
              <div style={{ fontSize: 13, color: "var(--ink-3, #6A7A7E)", textAlign: "center", padding: 24 }}>
                Section layout settings coming soon.
              </div>
            ) : activeTab === "Rex" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--ink-3, #6A7A7E)",
                    lineHeight: 1.5,
                  }}
                >
                  Ask Rex to edit this section — rewrite copy, change colours, or suggest improvements.
                </div>
                <textarea
                  rows={5}
                  value={rexPrompt}
                  onChange={(event) => setRexPrompt(event.target.value)}
                  placeholder="e.g. Make this hero section feel more luxurious, add a CTA about free shipping..."
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 14,
                    border: "1px solid var(--line, #E3DDD0)",
                    fontSize: 13,
                    fontFamily: "inherit",
                    outline: "none",
                    color: "var(--ink, #0B262C)",
                    background: "var(--bg, #F6F2E9)",
                    resize: "vertical",
                    boxSizing: "border-box",
                    lineHeight: 1.5,
                  }}
                />
                <button
                  onClick={() => void askRex()}
                  disabled={rexBusy || !rexPrompt.trim()}
                  style={{
                    padding: "12px 20px",
                    borderRadius: 999,
                    fontWeight: 700,
                    fontSize: 13,
                    background: rexBusy || !rexPrompt.trim() ? "var(--bg-tinted, #EFEAE0)" : "var(--ink, #0B262C)",
                    color: rexBusy || !rexPrompt.trim() ? "var(--ink-3, #6A7A7E)" : "#fff",
                    border: "none",
                    cursor: rexBusy || !rexPrompt.trim() ? "default" : "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {rexBusy ? "Rex is editing…" : "Ask Rex"}
                </button>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
